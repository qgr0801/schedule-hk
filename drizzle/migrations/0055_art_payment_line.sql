CREATE OR REPLACE FUNCTION public.save_reservation_payment(_id uuid, _reservation jsonb, _payment jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 r public.reservations; old_payment public.customer_payments;
 line jsonb; sale jsonb; key text; amount numeric; p record;
 old_qty numeric; new_qty numeric; next_sales jsonb := '[]'; canonical_rows jsonb := '[]'; canonical_line jsonb;
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '계산 등록 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 -- Serializes new submissions and retries for the same reservation as well as edits.
 PERFORM pg_advisory_xact_lock(hashtextextended(_id::text,0));
 SELECT * INTO r FROM public.reservations WHERE id=_id FOR UPDATE;
 IF FOUND AND r.status='cancelled' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION '취소된 예약은 관리자만 수정할 수 있습니다.' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.customers WHERE id=(_reservation->>'customer_id')::uuid) THEN RAISE EXCEPTION '고객을 확인해 주세요.'; END IF;
 IF char_length(coalesce(_reservation->>'customer_name','')) NOT BETWEEN 1 AND 50 OR char_length(coalesce(_reservation->>'service_detail',''))>200 THEN RAISE EXCEPTION '고객명과 시술명을 확인해 주세요.'; END IF;
 IF r.id IS NULL THEN
  INSERT INTO public.reservations(id,customer_id,customer_name,customer_phone,service,service_detail,public_service,staff_id,booking_route_id,section,room,memo,start_at,end_at)
  VALUES(_id,(_reservation->>'customer_id')::uuid,_reservation->>'customer_name',_reservation->>'customer_phone',_reservation->>'service',coalesce(_reservation->>'service_detail',''),_reservation->>'public_service',(_reservation->>'staff_id')::uuid,(_reservation->>'booking_route_id')::uuid,(_reservation->>'section')::smallint,_reservation->>'room',_reservation->>'memo',(_reservation->>'start_at')::timestamptz,(_reservation->>'end_at')::timestamptz);
 ELSE
  UPDATE public.reservations SET customer_id=(_reservation->>'customer_id')::uuid,customer_name=_reservation->>'customer_name',customer_phone=_reservation->>'customer_phone',service=_reservation->>'service',service_detail=coalesce(_reservation->>'service_detail',''),public_service=_reservation->>'public_service',staff_id=(_reservation->>'staff_id')::uuid,booking_route_id=CASE WHEN _reservation ? 'booking_route_id' THEN (_reservation->>'booking_route_id')::uuid ELSE booking_route_id END,section=(_reservation->>'section')::smallint,room=_reservation->>'room',memo=_reservation->>'memo',start_at=(_reservation->>'start_at')::timestamptz,end_at=(_reservation->>'end_at')::timestamptz WHERE id=_id;
 END IF;
 IF _payment IS NULL OR _payment='null'::jsonb THEN RETURN _id; END IF;
 SELECT * INTO old_payment FROM public.customer_payments WHERE reservation_id=_id FOR UPDATE;
 IF old_payment.reservation_id IS NOT NULL AND coalesce((_payment->>'version')::integer,0)<>old_payment.version THEN RAISE EXCEPTION '다른 직원이 계산을 수정했습니다. 새로고침한 뒤 확인해 주세요.'; END IF;
 IF jsonb_typeof(_payment->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(_payment->'rows') NOT IN (3,4) THEN RAISE EXCEPTION '계산 항목을 확인해 주세요.'; END IF;
 IF char_length(coalesce(_payment->>'memo',''))>1000 THEN RAISE EXCEPTION '계산 메모는 1000자까지 입력할 수 있습니다.'; END IF;
 FOREACH key IN ARRAY ARRAY['service','care','art','product'] LOOP
  SELECT value INTO line FROM jsonb_array_elements(_payment->'rows') WHERE value->>'kind'=key;
  IF NOT FOUND AND key='art' AND jsonb_array_length(_payment->'rows')=3 THEN
   canonical_rows:=canonical_rows||coalesce((SELECT jsonb_agg(v) FROM jsonb_array_elements(coalesce(old_payment.rows,'[]')) v WHERE v->>'kind'='art'),'[]'::jsonb);
   CONTINUE;
  END IF;
  IF NOT FOUND OR (SELECT count(*) FROM jsonb_array_elements(_payment->'rows') WHERE value->>'kind'=key)<>1 THEN RAISE EXCEPTION '계산 항목을 확인해 주세요.'; END IF;
  IF char_length(coalesce(line->>'description',''))>300 THEN RAISE EXCEPTION '내용은 300자까지 입력할 수 있습니다.'; END IF;
  canonical_line:=jsonb_build_object('kind',key,'description',coalesce(line->>'description',''));
  FOREACH key IN ARRAY ARRAY['cost','card','bank','krw','jpy','usd','cny'] LOOP
   IF key='bank' AND NOT (line ? 'bank') THEN line:=line||jsonb_build_object('bank',coalesce((SELECT (v->>'bank')::numeric FROM jsonb_array_elements(coalesce(old_payment.rows,'[]')) v WHERE v->>'kind'=line->>'kind'),0)); END IF;
   IF jsonb_typeof(line->key) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION '금액은 숫자로 입력해 주세요.'; END IF;
   amount:=(line->>key)::numeric;
   IF amount<0 OR amount>999999999999 OR amount<>round(amount,2) THEN RAISE EXCEPTION '금액은 0 이상, 소수점 2자리까지 입력해 주세요.'; END IF;
   canonical_line:=canonical_line||jsonb_build_object(key,amount);
  END LOOP;
  canonical_rows:=canonical_rows||jsonb_build_array(canonical_line);
 END LOOP;
 IF jsonb_typeof(_payment->'sales') IS DISTINCT FROM 'array' OR jsonb_array_length(_payment->'sales')>100 THEN RAISE EXCEPTION '제품 목록을 확인해 주세요.'; END IF;
 FOR sale IN SELECT value FROM jsonb_array_elements(_payment->'sales') LOOP
  IF coalesce((sale->>'quantity')::numeric,0) NOT BETWEEN 0.001 AND 100000 OR (sale->>'quantity')::numeric<>round((sale->>'quantity')::numeric,3) THEN RAISE EXCEPTION '판매 수량은 0보다 크게, 소수점 3자리까지 입력해 주세요.'; END IF;
  IF sale ? 'unit_price' THEN
   IF jsonb_typeof(sale->'unit_price') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION '판매단가는 숫자로 입력해 주세요.'; END IF;
   IF (sale->>'unit_price')::numeric NOT BETWEEN 0 AND 999999999999 OR (sale->>'unit_price')::numeric<>round((sale->>'unit_price')::numeric,2) THEN RAISE EXCEPTION '판매단가는 0 이상, 소수점 2자리까지 입력해 주세요.'; END IF;
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(_payment->'sales') WHERE value->>'product_id'=sale->>'product_id')<>1 THEN RAISE EXCEPTION '같은 제품은 한 줄에 입력해 주세요.'; END IF;
 END LOOP;
 -- Lock all affected products in a consistent order, then apply only the difference.
 FOR p IN SELECT * FROM public.products WHERE id IN (
  SELECT (value->>'product_id')::uuid FROM jsonb_array_elements(_payment->'sales')
  UNION SELECT (value->>'product_id')::uuid FROM jsonb_array_elements(coalesce(old_payment.sales,'[]'))
 ) ORDER BY id FOR UPDATE LOOP
  SELECT coalesce(sum((value->>'quantity')::numeric),0) INTO old_qty FROM jsonb_array_elements(coalesce(old_payment.sales,'[]')) WHERE value->>'product_id'=p.id::text;
  SELECT coalesce(sum((value->>'quantity')::numeric),0) INTO new_qty FROM jsonb_array_elements(_payment->'sales') WHERE value->>'product_id'=p.id::text;
  IF new_qty>old_qty AND NOT p.is_active THEN RAISE EXCEPTION '사용 중지된 제품입니다.'; END IF;
  IF p.stock+old_qty-new_qty<0 THEN RAISE EXCEPTION '제품 재고가 부족합니다. 제품 %',p.name; END IF;
  IF new_qty<>old_qty THEN
   UPDATE public.products SET stock=stock+old_qty-new_qty WHERE id=p.id;
  END IF;
  IF old_payment.reservation_id IS NOT NULL AND old_payment.paid_on IS DISTINCT FROM (_payment->>'paid_on')::date THEN
   IF old_qty>0 THEN INSERT INTO public.stock_movements(product_id,quantity,reason,reservation_id,movement_kind,effective_on) VALUES(p.id,old_qty,'예약 판매일 변경 · 이전 판매 복원',_id,'sale',old_payment.paid_on); END IF;
   IF new_qty>0 THEN INSERT INTO public.stock_movements(product_id,quantity,reason,reservation_id,movement_kind,effective_on) VALUES(p.id,-new_qty,'예약 제품판매',_id,'sale',(_payment->>'paid_on')::date); END IF;
  ELSIF new_qty<>old_qty THEN
   INSERT INTO public.stock_movements(product_id,quantity,reason,reservation_id,movement_kind,effective_on) VALUES(p.id,old_qty-new_qty,'예약 제품판매 변경',_id,'sale',(_payment->>'paid_on')::date);
  END IF;
  IF new_qty>0 THEN next_sales:=next_sales||jsonb_build_array(jsonb_build_object('product_id',p.id,'name',p.name,'quantity',new_qty,'unit_price',coalesce((SELECT (value->>'unit_price')::numeric FROM jsonb_array_elements(_payment->'sales') WHERE value->>'product_id'=p.id::text),(SELECT (value->>'unit_price')::numeric FROM jsonb_array_elements(coalesce(old_payment.sales,'[]')) WHERE value->>'product_id'=p.id::text),p.price))); END IF;
 END LOOP;
 IF jsonb_array_length(next_sales)<>jsonb_array_length(_payment->'sales') THEN RAISE EXCEPTION '등록되지 않은 제품이 있습니다.'; END IF;
 INSERT INTO public.customer_payments(reservation_id,customer_id,paid_on,rows,sales,memo,updated_by)
 VALUES(_id,(_reservation->>'customer_id')::uuid,(_payment->>'paid_on')::date,canonical_rows,next_sales,coalesce(_payment->>'memo',''),auth.uid())
 ON CONFLICT(reservation_id) DO UPDATE SET customer_id=excluded.customer_id,paid_on=excluded.paid_on,rows=excluded.rows,sales=excluded.sales,memo=excluded.memo,updated_by=auth.uid(),updated_at=now(),version=customer_payments.version+1;
 INSERT INTO public.payment_history(reservation_id,snapshot) SELECT _id,to_jsonb(cp) FROM public.customer_payments cp WHERE cp.reservation_id=_id;
 RETURN _id;
END $function$

