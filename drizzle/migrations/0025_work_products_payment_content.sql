-- Preserve free text payment descriptions and move inventory sales to WORK.
CREATE OR REPLACE FUNCTION public.save_reservation_payment(_id uuid, _reservation jsonb, _payment jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 r public.reservations; old_payment public.customer_payments;
 line jsonb; sale jsonb; key text; amount numeric; p record;
 old_qty integer; new_qty integer; next_sales jsonb := '[]'; canonical_rows jsonb := '[]'; canonical_line jsonb;
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '계산 등록 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 -- Serializes new submissions and retries for the same reservation as well as edits.
 PERFORM pg_advisory_xact_lock(hashtextextended(_id::text,0));
 SELECT * INTO r FROM public.reservations WHERE id=_id FOR UPDATE;
 IF FOUND AND r.status='cancelled' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION '취소된 예약은 관리자만 수정할 수 있습니다.' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.customers WHERE id=(_reservation->>'customer_id')::uuid) THEN RAISE EXCEPTION '고객을 확인해 주세요.'; END IF;
 IF char_length(coalesce(_reservation->>'customer_name','')) NOT BETWEEN 1 AND 50 OR char_length(coalesce(_reservation->>'service_detail',''))>200 THEN RAISE EXCEPTION '고객명과 시술명을 확인해 주세요.'; END IF;
 IF r.id IS NULL THEN
  INSERT INTO public.reservations(id,customer_id,customer_name,customer_phone,service,service_detail,public_service,staff_id,section,room,memo,start_at,end_at)
  VALUES(_id,(_reservation->>'customer_id')::uuid,_reservation->>'customer_name',_reservation->>'customer_phone',_reservation->>'service',coalesce(_reservation->>'service_detail',''),_reservation->>'public_service',(_reservation->>'staff_id')::uuid,(_reservation->>'section')::smallint,_reservation->>'room',_reservation->>'memo',(_reservation->>'start_at')::timestamptz,(_reservation->>'end_at')::timestamptz);
 ELSE
  UPDATE public.reservations SET customer_id=(_reservation->>'customer_id')::uuid,customer_name=_reservation->>'customer_name',customer_phone=_reservation->>'customer_phone',service=_reservation->>'service',service_detail=coalesce(_reservation->>'service_detail',''),public_service=_reservation->>'public_service',staff_id=(_reservation->>'staff_id')::uuid,section=(_reservation->>'section')::smallint,room=_reservation->>'room',memo=_reservation->>'memo',start_at=(_reservation->>'start_at')::timestamptz,end_at=(_reservation->>'end_at')::timestamptz WHERE id=_id;
 END IF;
 IF _payment IS NULL OR _payment='null'::jsonb THEN RETURN _id; END IF;
 SELECT * INTO old_payment FROM public.customer_payments WHERE reservation_id=_id FOR UPDATE;
 IF old_payment.reservation_id IS NOT NULL AND coalesce((_payment->>'version')::integer,0)<>old_payment.version THEN RAISE EXCEPTION '다른 직원이 계산을 수정했습니다. 새로고침한 뒤 확인해 주세요.'; END IF;
 IF jsonb_typeof(_payment->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(_payment->'rows')<>3 THEN RAISE EXCEPTION '계산 항목을 확인해 주세요.'; END IF;
 IF char_length(coalesce(_payment->>'memo',''))>1000 THEN RAISE EXCEPTION '계산 메모는 1000자까지 입력할 수 있습니다.'; END IF;
 FOREACH key IN ARRAY ARRAY['service','care','product'] LOOP
  SELECT value INTO line FROM jsonb_array_elements(_payment->'rows') WHERE value->>'kind'=key;
  IF NOT FOUND OR (SELECT count(*) FROM jsonb_array_elements(_payment->'rows') WHERE value->>'kind'=key)<>1 THEN RAISE EXCEPTION '계산 항목을 확인해 주세요.'; END IF;
  IF char_length(coalesce(line->>'description',''))>300 THEN RAISE EXCEPTION '내용은 300자까지 입력할 수 있습니다.'; END IF;
  canonical_line:=jsonb_build_object('kind',key,'description',coalesce(line->>'description',''));
  FOREACH key IN ARRAY ARRAY['cost','card','krw','jpy','usd','cny'] LOOP
   IF jsonb_typeof(line->key) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION '금액은 숫자로 입력해 주세요.'; END IF;
   amount:=(line->>key)::numeric;
   IF amount<0 OR amount>999999999999 OR amount<>round(amount,2) THEN RAISE EXCEPTION '금액은 0 이상, 소수점 2자리까지 입력해 주세요.'; END IF;
   canonical_line:=canonical_line||jsonb_build_object(key,amount);
  END LOOP;
  canonical_rows:=canonical_rows||jsonb_build_array(canonical_line);
 END LOOP;
 IF jsonb_typeof(_payment->'sales') IS DISTINCT FROM 'array' OR jsonb_array_length(_payment->'sales')>100 THEN RAISE EXCEPTION '제품 목록을 확인해 주세요.'; END IF;
 FOR sale IN SELECT value FROM jsonb_array_elements(_payment->'sales') LOOP
  IF coalesce((sale->>'quantity')::numeric,0) NOT BETWEEN 1 AND 100000 OR (sale->>'quantity')::numeric<>trunc((sale->>'quantity')::numeric) THEN RAISE EXCEPTION '판매 수량은 1 이상의 정수로 입력해 주세요.'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(_payment->'sales') WHERE value->>'product_id'=sale->>'product_id')<>1 THEN RAISE EXCEPTION '같은 제품은 한 줄에 입력해 주세요.'; END IF;
 END LOOP;
 -- Lock all affected products in a consistent order, then apply only the difference.
 FOR p IN SELECT * FROM public.products WHERE id IN (
  SELECT (value->>'product_id')::uuid FROM jsonb_array_elements(_payment->'sales')
  UNION SELECT (value->>'product_id')::uuid FROM jsonb_array_elements(coalesce(old_payment.sales,'[]'))
 ) ORDER BY id FOR UPDATE LOOP
  SELECT coalesce(sum((value->>'quantity')::integer),0) INTO old_qty FROM jsonb_array_elements(coalesce(old_payment.sales,'[]')) WHERE value->>'product_id'=p.id::text;
  SELECT coalesce(sum((value->>'quantity')::integer),0) INTO new_qty FROM jsonb_array_elements(_payment->'sales') WHERE value->>'product_id'=p.id::text;
  IF new_qty>old_qty AND NOT p.is_active THEN RAISE EXCEPTION '사용 중지된 제품입니다.'; END IF;
  IF p.stock+old_qty-new_qty<0 THEN RAISE EXCEPTION '제품 재고가 부족합니다. 제품 %',p.name; END IF;
  IF new_qty<>old_qty THEN
   UPDATE public.products SET stock=stock+old_qty-new_qty WHERE id=p.id;
   INSERT INTO public.stock_movements(product_id,quantity,reason,reservation_id) VALUES(p.id,old_qty-new_qty,'계산 제품판매 변경',_id);
  END IF;
  IF new_qty>0 THEN next_sales:=next_sales||jsonb_build_array(jsonb_build_object('product_id',p.id,'name',p.name,'quantity',new_qty,'unit_price',coalesce((SELECT (value->>'unit_price')::numeric FROM jsonb_array_elements(coalesce(old_payment.sales,'[]')) WHERE value->>'product_id'=p.id::text),p.price))); END IF;
 END LOOP;
 IF jsonb_array_length(next_sales)<>jsonb_array_length(_payment->'sales') THEN RAISE EXCEPTION '등록되지 않은 제품이 있습니다.'; END IF;
 INSERT INTO public.customer_payments(reservation_id,customer_id,paid_on,rows,sales,memo,updated_by)
 VALUES(_id,(_reservation->>'customer_id')::uuid,(_payment->>'paid_on')::date,canonical_rows,next_sales,coalesce(_payment->>'memo',''),auth.uid())
 ON CONFLICT(reservation_id) DO UPDATE SET customer_id=excluded.customer_id,paid_on=excluded.paid_on,rows=excluded.rows,sales=excluded.sales,memo=excluded.memo,updated_by=auth.uid(),updated_at=now(),version=customer_payments.version+1;
 INSERT INTO public.payment_history(reservation_id,snapshot) SELECT _id,to_jsonb(cp) FROM public.customer_payments cp WHERE cp.reservation_id=_id;
 RETURN _id;
END $$;


CREATE TABLE public.work_product_sales (
 id uuid PRIMARY KEY,
 product_id uuid NOT NULL REFERENCES public.products(id),
 customer_id uuid REFERENCES public.customers(id),
 product_name text NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0),
 unit_price numeric(16,2) NOT NULL CHECK(unit_price>=0),
 paid_on date NOT NULL,
 method text NOT NULL CHECK(method IN ('card','krw')),
 memo text NOT NULL DEFAULT '' CHECK(char_length(memo)<=500),
 created_by uuid NOT NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_product_sales_customer_date ON public.work_product_sales(customer_id,paid_on);
CREATE INDEX work_product_sales_product ON public.work_product_sales(product_id);
CREATE INDEX work_product_sales_date ON public.work_product_sales(paid_on);
CREATE INDEX payment_history_reservation ON public.payment_history(reservation_id);
CREATE INDEX stock_movements_product_date ON public.stock_movements(product_id,created_at);
CREATE INDEX stock_movements_reservation ON public.stock_movements(reservation_id);
REVOKE ALL ON public.work_product_sales FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.work_product_sales TO authenticated;
GRANT ALL ON public.work_product_sales TO service_role;
ALTER TABLE public.work_product_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read work sales" ON public.work_product_sales FOR SELECT TO authenticated USING((SELECT public.can_manage_sales()));
ALTER POLICY "admin insert products" ON public.products WITH CHECK((SELECT public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')));
ALTER POLICY "admin update products" ON public.products USING((SELECT public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin'))) WITH CHECK((SELECT public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')));
ALTER POLICY "staff insert attendance" ON public.freelancer_attendance WITH CHECK((SELECT public.can_manage_sales()) AND created_by=(SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.record_work_product_sale(_id uuid,_product uuid,_quantity integer,_paid_on date,_method text,_memo text DEFAULT '',_customer uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products; prior public.work_product_sales;
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '제품판매 등록 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _id IS NULL OR _quantity IS NULL OR _quantity NOT BETWEEN 1 AND 100000 OR _paid_on IS NULL OR _method IS NULL OR _method NOT IN ('card','krw') OR _memo IS NULL OR char_length(_memo)>500 THEN RAISE EXCEPTION '판매 정보를 확인해 주세요.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_id::text,2));
 SELECT * INTO prior FROM public.work_product_sales WHERE id=_id;
 IF FOUND THEN
  IF prior.created_by=auth.uid() AND prior.product_id=_product AND prior.quantity=_quantity AND prior.paid_on=_paid_on AND prior.method=_method AND prior.memo=_memo AND prior.customer_id IS NOT DISTINCT FROM _customer THEN RETURN _id; END IF;
  RAISE EXCEPTION '이미 등록된 판매입니다. 새로고침해 주세요.';
 END IF;
 IF _customer IS NOT NULL AND NOT public.can_view_customer(auth.uid(),_customer) THEN RAISE EXCEPTION '고객 열람 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.products WHERE id=_product FOR UPDATE;
 IF NOT FOUND OR NOT p.is_active THEN RAISE EXCEPTION '사용 중인 제품을 선택해 주세요.'; END IF;
 IF p.stock<_quantity THEN RAISE EXCEPTION '제품 재고가 부족합니다.'; END IF;
 INSERT INTO public.work_product_sales(id,product_id,customer_id,product_name,quantity,unit_price,paid_on,method,memo)
 VALUES(_id,_product,_customer,p.name,_quantity,p.price,_paid_on,_method,_memo);
 UPDATE public.products SET stock=stock-_quantity WHERE id=_product;
 INSERT INTO public.stock_movements(id,product_id,quantity,reason) VALUES(_id,_product,-_quantity,'WORK 제품판매');
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.record_work_product_sale(uuid,uuid,integer,date,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_work_product_sale(uuid,uuid,integer,date,text,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.payment_summary(_customer uuid DEFAULT NULL, _from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS TABLE(kind text,cost numeric,card numeric,krw numeric,jpy numeric,usd numeric,cny numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION '합계는 최고관리자만 조회할 수 있습니다.' USING ERRCODE='42501'; END IF;

 RETURN QUERY WITH entries AS (
 SELECT line->>'kind' AS k,(line->>'cost')::numeric AS vcost,(line->>'card')::numeric AS vcard,(line->>'krw')::numeric AS vkrw,(line->>'jpy')::numeric AS vjpy,(line->>'usd')::numeric AS vusd,(line->>'cny')::numeric AS vcny
 FROM public.customer_payments cp CROSS JOIN LATERAL jsonb_array_elements(cp.rows) line
 WHERE (_customer IS NULL OR cp.customer_id=_customer) AND (_from IS NULL OR cp.paid_on>=_from) AND (_to IS NULL OR cp.paid_on<=_to)
 UNION ALL
 SELECT 'product',ws.quantity*ws.unit_price,CASE WHEN ws.method='card' THEN ws.quantity*ws.unit_price ELSE 0 END,CASE WHEN ws.method='krw' THEN ws.quantity*ws.unit_price ELSE 0 END,0,0,0
 FROM public.work_product_sales ws WHERE (_customer IS NULL OR ws.customer_id=_customer) AND (_from IS NULL OR ws.paid_on>=_from) AND (_to IS NULL OR ws.paid_on<=_to)
 )
 SELECT coalesce(k,'total'),sum(vcost),sum(vcard),sum(vkrw),sum(vjpy),sum(vusd),sum(vcny) FROM entries GROUP BY ROLLUP(k);
END $$;
CREATE OR REPLACE FUNCTION public.product_payment_summary(_customer uuid DEFAULT NULL,_from date DEFAULT NULL,_to date DEFAULT NULL)
RETURNS TABLE(kind text,cost numeric,card numeric,krw numeric,jpy numeric,usd numeric,cny numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '제품판매 합계 열람 권한이 없습니다.' USING ERRCODE='42501'; END IF;

 RETURN QUERY WITH entries AS (
 SELECT line->>'kind' AS k,(line->>'cost')::numeric AS vcost,(line->>'card')::numeric AS vcard,(line->>'krw')::numeric AS vkrw,(line->>'jpy')::numeric AS vjpy,(line->>'usd')::numeric AS vusd,(line->>'cny')::numeric AS vcny
 FROM public.customer_payments cp CROSS JOIN LATERAL jsonb_array_elements(cp.rows) line
 WHERE (_customer IS NULL OR cp.customer_id=_customer) AND (_from IS NULL OR cp.paid_on>=_from) AND (_to IS NULL OR cp.paid_on<=_to) AND line->>'kind'='product'
 UNION ALL
 SELECT 'product',ws.quantity*ws.unit_price,CASE WHEN ws.method='card' THEN ws.quantity*ws.unit_price ELSE 0 END,CASE WHEN ws.method='krw' THEN ws.quantity*ws.unit_price ELSE 0 END,0,0,0
 FROM public.work_product_sales ws WHERE (_customer IS NULL OR ws.customer_id=_customer) AND (_from IS NULL OR ws.paid_on>=_from) AND (_to IS NULL OR ws.paid_on<=_to)
 )
 SELECT 'product'::text,coalesce(sum(vcost),0),coalesce(sum(vcard),0),coalesce(sum(vkrw),0),coalesce(sum(vjpy),0),coalesce(sum(vusd),0),coalesce(sum(vcny),0) FROM entries;
END $$;
