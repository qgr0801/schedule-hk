-- Preserve the complete record while removing a duplicate from live schedules and reports.
CREATE TABLE public.voided_reservations (
  reservation_id uuid PRIMARY KEY,
  voided_by uuid NOT NULL,
  voided_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  snapshot jsonb NOT NULL
);
ALTER TABLE public.voided_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.voided_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.voided_reservations TO authenticated;
CREATE POLICY "administrators can read voided reservations" ON public.voided_reservations
  FOR SELECT TO authenticated USING (
    (SELECT public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin'))
  );

CREATE FUNCTION public.reject_voided_reservation_reinsert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.id::text,0));
 IF EXISTS (SELECT 1 FROM public.voided_reservations WHERE reservation_id=NEW.id) THEN
  RAISE EXCEPTION '이미 삭제 처리된 예약입니다. 목록을 새로고침해 주세요.';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.reject_voided_reservation_reinsert() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER reject_voided_reservation_reinsert BEFORE INSERT ON public.reservations
 FOR EACH ROW EXECUTE FUNCTION public.reject_voided_reservation_reinsert();

CREATE FUNCTION public.void_duplicate_reservation(_id uuid,_expected_updated_at timestamptz,_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  actor uuid:=auth.uid();
  res public.reservations;
  payment public.customer_payments;
  entry record;
BEGIN
 IF NOT coalesce(public.is_active_staff(actor) AND public.has_role(actor,'admin'),false) THEN
  RAISE EXCEPTION '중복 예약 삭제는 관리자만 할 수 있습니다.' USING ERRCODE='42501';
 END IF;
 IF _id IS NULL OR _expected_updated_at IS NULL OR char_length(btrim(coalesce(_reason,''))) NOT BETWEEN 1 AND 500 THEN
  RAISE EXCEPTION '삭제 사유를 입력해 주세요.';
 END IF;

 -- Use the same reservation lock as payment saves, including retries.
 PERFORM pg_advisory_xact_lock(hashtextextended(_id::text,0));
 IF EXISTS (SELECT 1 FROM public.voided_reservations WHERE reservation_id=_id) THEN RETURN; END IF;
 SELECT * INTO res FROM public.reservations WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR res.updated_at IS DISTINCT FROM _expected_updated_at THEN
  RAISE EXCEPTION '예약이 변경됐습니다. 목록을 새로고침한 뒤 다시 확인해 주세요.';
 END IF;
 SELECT * INTO payment FROM public.customer_payments WHERE reservation_id=_id FOR UPDATE;

 IF EXISTS (SELECT 1 FROM public.stock_movements WHERE reservation_id=_id AND movement_kind<>'sale')
 OR EXISTS (
  WITH sold AS (
    SELECT (v->>'product_id')::uuid product_id,sum((v->>'quantity')::numeric) quantity
    FROM jsonb_array_elements(coalesce(payment.sales,'[]')) v GROUP BY 1
  ), movements AS (
    SELECT product_id,-sum(quantity) quantity FROM public.stock_movements WHERE reservation_id=_id GROUP BY 1
  )
  SELECT 1 FROM sold FULL JOIN movements USING(product_id)
  WHERE coalesce(sold.quantity,0)<>coalesce(movements.quantity,0)
 ) THEN
  RAISE EXCEPTION '제품 판매와 재고 이력이 일치하지 않습니다. 확인 후 다시 처리해 주세요.';
 END IF;

 INSERT INTO public.voided_reservations(reservation_id,voided_by,reason,snapshot)
 VALUES(_id,actor,btrim(_reason),jsonb_build_object(
  'reservation',to_jsonb(res),'payment',to_jsonb(payment),
  'payment_history',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.id),'[]') FROM public.payment_history h WHERE h.reservation_id=_id),
  'reservation_history',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.id),'[]') FROM public.reservation_history h WHERE h.reservation_id=_id),
  'status_history',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.id),'[]') FROM public.reservation_status_history h WHERE h.reservation_id=_id),
  'stock_movements',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]') FROM public.stock_movements m WHERE m.reservation_id=_id)
 ));
 FOR entry IN
  SELECT (v->>'product_id')::uuid product_id,sum((v->>'quantity')::numeric) quantity
  FROM jsonb_array_elements(coalesce(payment.sales,'[]')) v GROUP BY 1 ORDER BY 1
 LOOP
  UPDATE public.products SET stock=stock+entry.quantity WHERE id=entry.product_id;
  IF NOT FOUND THEN RAISE EXCEPTION '판매 제품을 찾을 수 없습니다.'; END IF;
 END LOOP;
 DELETE FROM public.stock_movements WHERE reservation_id=_id;
 DELETE FROM public.payment_history WHERE reservation_id=_id;
 DELETE FROM public.customer_payments WHERE reservation_id=_id;
 DELETE FROM public.reservation_status_history WHERE reservation_id=_id;
 DELETE FROM public.reservations WHERE id=_id;
END $$;
REVOKE ALL ON FUNCTION public.void_duplicate_reservation(uuid,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_duplicate_reservation(uuid,timestamptz,text) TO authenticated;
NOTIFY pgrst,'reload schema';
