-- Reservation/customer acquisition routes are separate from inventory suppliers.
CREATE TABLE public.booking_routes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 50),
 is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX booking_routes_name ON public.booking_routes(lower(btrim(name)));
REVOKE ALL ON public.booking_routes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.booking_routes TO authenticated;
GRANT ALL ON public.booking_routes TO service_role;
ALTER TABLE public.booking_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read booking routes" ON public.booking_routes FOR SELECT TO authenticated USING((SELECT public.can_manage_sales()));
ALTER TABLE public.reservations ADD COLUMN booking_route_id uuid REFERENCES public.booking_routes(id);
CREATE INDEX reservations_booking_route_date ON public.reservations(booking_route_id,start_at);
CREATE FUNCTION public.save_booking_route(_id uuid,_name text,_active boolean DEFAULT true) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION '경로 등록·수정은 대표 관리자만 가능합니다.' USING ERRCODE='42501'; END IF;
 IF _id IS NULL OR _active IS NULL OR char_length(btrim(coalesce(_name,''))) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION '경로명을 확인해 주세요.'; END IF;
 INSERT INTO public.booking_routes(id,name,is_active) VALUES(_id,btrim(_name),_active) ON CONFLICT(id) DO UPDATE SET name=excluded.name,is_active=excluded.is_active;
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.save_booking_route(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_booking_route(uuid,text,boolean) TO authenticated;
CREATE FUNCTION public.guard_booking_route() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF (TG_OP='INSERT' AND NEW.booking_route_id IS NOT NULL) OR (TG_OP='UPDATE' AND NEW.booking_route_id IS DISTINCT FROM OLD.booking_route_id) THEN
  IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '경로 선택 권한이 없습니다.' USING ERRCODE='42501'; END IF;
  IF NEW.booking_route_id IS NOT NULL THEN
   PERFORM 1 FROM public.booking_routes WHERE id=NEW.booking_route_id AND is_active FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION '사용 중인 경로를 선택해 주세요.'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_booking_route() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_booking_route BEFORE INSERT OR UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.guard_booking_route();
CREATE OR REPLACE FUNCTION public.save_reservation_payment(_id uuid, _reservation jsonb, _payment jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
 IF jsonb_typeof(_payment->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(_payment->'rows')<>3 THEN RAISE EXCEPTION '계산 항목을 확인해 주세요.'; END IF;
 IF char_length(coalesce(_payment->>'memo',''))>1000 THEN RAISE EXCEPTION '계산 메모는 1000자까지 입력할 수 있습니다.'; END IF;
 FOREACH key IN ARRAY ARRAY['service','care','product'] LOOP
  SELECT value INTO line FROM jsonb_array_elements(_payment->'rows') WHERE value->>'kind'=key;
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
END $$;


ALTER TABLE public.work_product_sales DROP CONSTRAINT work_product_sales_method_check;
ALTER TABLE public.work_product_sales ADD CONSTRAINT work_product_sales_method_check CHECK(method IN ('card','krw','bank'));
CREATE OR REPLACE FUNCTION public.record_product_sale(_id uuid,_product uuid,_quantity numeric,_paid_on date,_method text,_memo text DEFAULT '',_customer uuid DEFAULT NULL,_unit_price numeric DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products; prior public.work_product_sales;
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '제품판매 등록 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _id IS NULL OR _quantity IS NULL OR _quantity NOT BETWEEN 0.001 AND 100000 OR _quantity<>round(_quantity,3) OR _paid_on IS NULL OR _method IS NULL OR _method NOT IN ('card','krw','bank') OR _memo IS NULL OR char_length(_memo)>500 THEN RAISE EXCEPTION '판매 정보를 확인해 주세요.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_id::text,2));
 SELECT * INTO prior FROM public.work_product_sales WHERE id=_id;
 IF FOUND THEN
  IF prior.created_by=auth.uid() AND prior.product_id=_product AND prior.quantity=_quantity AND prior.paid_on=_paid_on AND prior.method=_method AND prior.memo=_memo AND prior.customer_id IS NOT DISTINCT FROM _customer AND prior.unit_price=coalesce(_unit_price,prior.unit_price) THEN RETURN _id; END IF;
  RAISE EXCEPTION '이미 등록된 판매입니다. 새로고침해 주세요.';
 END IF;
 IF _unit_price IS NOT NULL AND (_unit_price NOT BETWEEN 0 AND 999999999999 OR _unit_price<>round(_unit_price,2)) THEN RAISE EXCEPTION '판매단가를 확인해 주세요.'; END IF;
 IF _customer IS NOT NULL AND NOT public.can_view_customer(auth.uid(),_customer) THEN RAISE EXCEPTION '고객 열람 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.products WHERE id=_product FOR UPDATE;
 IF NOT FOUND OR NOT p.is_active THEN RAISE EXCEPTION '사용 중인 제품을 선택해 주세요.'; END IF;
 IF p.stock<_quantity THEN RAISE EXCEPTION '제품 재고가 부족합니다.'; END IF;
 INSERT INTO public.work_product_sales(id,product_id,customer_id,product_name,quantity,unit_price,paid_on,method,memo)
 VALUES(_id,_product,_customer,p.name,_quantity,coalesce(_unit_price,p.price),_paid_on,_method,_memo);
 UPDATE public.products SET stock=stock-_quantity WHERE id=_product;
 INSERT INTO public.stock_movements(id,product_id,quantity,reason,movement_kind,effective_on) VALUES(_id,_product,-_quantity,'WORK 제품판매','sale',_paid_on);
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.record_product_sale(uuid,uuid,numeric,date,text,text,uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_product_sale(uuid,uuid,numeric,date,text,text,uuid,numeric) TO authenticated;

CREATE FUNCTION public.payment_summary_v2(_customer uuid DEFAULT NULL,_from date DEFAULT NULL,_to date DEFAULT NULL,_product_only boolean DEFAULT false)
RETURNS TABLE(kind text,cost numeric,card numeric,bank numeric,krw numeric,jpy numeric,usd numeric,cny numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_manage_sales() OR _product_only IS NULL OR (NOT _product_only AND NOT public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION '합계 열람 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 RETURN QUERY WITH entries AS (
  SELECT line->>'kind' k,coalesce((line->>'cost')::numeric,0) vcost,coalesce((line->>'card')::numeric,0) vcard,coalesce((line->>'bank')::numeric,0) vbank,coalesce((line->>'krw')::numeric,0) vkrw,coalesce((line->>'jpy')::numeric,0) vjpy,coalesce((line->>'usd')::numeric,0) vusd,coalesce((line->>'cny')::numeric,0) vcny
  FROM public.customer_payments cp CROSS JOIN LATERAL jsonb_array_elements(cp.rows) line
  WHERE (_customer IS NULL OR cp.customer_id=_customer) AND (_from IS NULL OR cp.paid_on>=_from) AND (_to IS NULL OR cp.paid_on<=_to) AND (NOT _product_only OR line->>'kind'='product')
  UNION ALL
  SELECT 'product',round(ws.quantity*ws.unit_price,2),CASE WHEN ws.method='card' THEN round(ws.quantity*ws.unit_price,2) ELSE 0 END,CASE WHEN ws.method='bank' THEN round(ws.quantity*ws.unit_price,2) ELSE 0 END,CASE WHEN ws.method='krw' THEN round(ws.quantity*ws.unit_price,2) ELSE 0 END,0,0,0
  FROM public.work_product_sales ws WHERE (_customer IS NULL OR ws.customer_id=_customer) AND (_from IS NULL OR ws.paid_on>=_from) AND (_to IS NULL OR ws.paid_on<=_to)
 ), totals AS (
  SELECT coalesce(k,'total') k,sum(vcost) vcost,sum(vcard) vcard,sum(vbank) vbank,sum(vkrw) vkrw,sum(vjpy) vjpy,sum(vusd) vusd,sum(vcny) vcny FROM entries GROUP BY ROLLUP(k)
 ) SELECT t.k,t.vcost,t.vcard,t.vbank,t.vkrw,t.vjpy,t.vusd,t.vcny FROM totals t WHERE NOT _product_only OR t.k='product';
END $$;
REVOKE ALL ON FUNCTION public.payment_summary_v2(uuid,date,date,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.payment_summary_v2(uuid,date,date,boolean) TO authenticated;
CREATE FUNCTION public.booking_activity_report(_from date,_to date,_route uuid DEFAULT NULL,_staff uuid DEFAULT NULL,_customer text DEFAULT '',_offset integer DEFAULT 0)
RETURNS TABLE(reservation_id uuid,start_at timestamptz,customer_name text,staff_name text,route_name text,service_content text,care_content text,paid_on date,payment_rows jsonb,payment_memo text,status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '고객·담당자·경로 내역 열람 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to<_from THEN RAISE EXCEPTION '조회 기간을 확인해 주세요.'; END IF;
 RETURN QUERY SELECT r.id,r.start_at,r.customer_name,coalesce(p.full_name,'미지정'),coalesce(br.name,'미지정'),
 coalesce(nullif((SELECT v->>'description' FROM jsonb_array_elements(coalesce(cp.rows,'[]')) v WHERE v->>'kind'='service'),''),nullif(r.service_detail,''),r.service),
 coalesce((SELECT v->>'description' FROM jsonb_array_elements(coalesce(cp.rows,'[]')) v WHERE v->>'kind'='care'),''),cp.paid_on,coalesce(cp.rows,'[]'),coalesce(cp.memo,''),r.status::text
 FROM public.reservations r LEFT JOIN public.profiles p ON p.id=r.staff_id LEFT JOIN public.booking_routes br ON br.id=r.booking_route_id LEFT JOIN public.customer_payments cp ON cp.reservation_id=r.id
 WHERE r.start_at>=(_from::timestamp AT TIME ZONE 'Asia/Seoul') AND r.start_at<((_to+1)::timestamp AT TIME ZONE 'Asia/Seoul')
 AND (_route IS NULL OR r.booking_route_id=_route) AND (_staff IS NULL OR r.staff_id=_staff) AND (coalesce(_customer,'')='' OR strpos(lower(r.customer_name),lower(_customer))>0)
 ORDER BY r.start_at DESC,r.id LIMIT 30 OFFSET greatest(coalesce(_offset,0),0);
END $$;
REVOKE ALL ON FUNCTION public.booking_activity_report(date,date,uuid,uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.booking_activity_report(date,date,uuid,uuid,text,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
