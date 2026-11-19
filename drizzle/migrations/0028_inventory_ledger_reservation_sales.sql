-- Fractional stock and classified, dated stock ledger; preserve all existing data.
ALTER TABLE public.products ALTER COLUMN stock TYPE numeric(16,3);
ALTER TABLE public.products ADD COLUMN unit text NOT NULL DEFAULT '개' CHECK(char_length(btrim(unit)) BETWEEN 1 AND 20);
GRANT UPDATE(unit) ON public.products TO authenticated;
ALTER TABLE public.stock_movements ALTER COLUMN quantity TYPE numeric(16,3);
ALTER TABLE public.stock_movements ADD COLUMN movement_kind text NOT NULL DEFAULT 'adjustment' CHECK(movement_kind IN ('initial','receipt','sale','usage','internal','adjustment'));
ALTER TABLE public.stock_movements ADD COLUMN effective_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date);
ALTER TABLE public.work_product_sales ALTER COLUMN quantity TYPE numeric(16,3);
UPDATE public.stock_movements m SET movement_kind=CASE WHEN m.reason='초기 재고' THEN 'initial' WHEN m.reservation_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.work_product_sales w WHERE w.id=m.id) THEN 'sale' WHEN m.quantity>0 THEN 'receipt' ELSE 'adjustment' END,
 effective_on=coalesce((SELECT cp.paid_on FROM public.customer_payments cp WHERE cp.reservation_id=m.reservation_id),(SELECT w.paid_on FROM public.work_product_sales w WHERE w.id=m.id),(m.created_at AT TIME ZONE 'Asia/Seoul')::date);
CREATE INDEX stock_movements_effective_product ON public.stock_movements(effective_on,product_id);

CREATE OR REPLACE FUNCTION public.record_product_movement(_event uuid,_product uuid,_kind text,_quantity numeric,_date date,_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE delta numeric; prior public.stock_movements;
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '재고 기록 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _kind='adjustment' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION '재고 조정은 최고관리자만 가능합니다.' USING ERRCODE='42501'; END IF;
 IF _event IS NULL OR _kind IS NULL OR _kind NOT IN ('receipt','usage','internal','adjustment') OR _quantity IS NULL OR _quantity=0 OR abs(_quantity)>100000000 OR _quantity<>round(_quantity,3) OR (_kind<>'adjustment' AND _quantity<0) OR _date IS NULL OR char_length(btrim(coalesce(_reason,''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION '구분·날짜·수량·내용을 확인해 주세요. 수량은 소수점 3자리까지 가능합니다.'; END IF;
 delta:=CASE WHEN _kind IN ('usage','internal') THEN -_quantity ELSE _quantity END;
 PERFORM pg_advisory_xact_lock(hashtextextended(_event::text,5));
 SELECT * INTO prior FROM public.stock_movements WHERE id=_event;
 IF FOUND THEN
  IF prior.product_id=_product AND prior.quantity=delta AND prior.movement_kind=_kind AND prior.effective_on=_date AND prior.reason=_reason AND prior.created_by=auth.uid() THEN RETURN; END IF;
  RAISE EXCEPTION '이미 등록된 재고 기록입니다. 새로고침해 주세요.';
 END IF;
 PERFORM 1 FROM public.products WHERE id=_product AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '사용 중인 제품을 선택해 주세요.'; END IF;
 IF (SELECT stock FROM public.products WHERE id=_product)+delta<0 THEN RAISE EXCEPTION '제품 재고가 부족합니다.'; END IF;
 UPDATE public.products SET stock=stock+delta WHERE id=_product;
 INSERT INTO public.stock_movements(id,product_id,quantity,reason,movement_kind,effective_on) VALUES(_event,_product,delta,_reason,_kind,_date);
END $$;
REVOKE ALL ON FUNCTION public.record_product_movement(uuid,uuid,text,numeric,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_product_movement(uuid,uuid,text,numeric,date,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.adjust_product_stock(_event uuid,_product uuid,_quantity integer,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION '관리자만 재고를 조정할 수 있습니다.' USING ERRCODE='42501'; END IF;
 PERFORM public.record_product_movement(_event,_product,CASE WHEN _quantity>0 THEN 'receipt' ELSE 'adjustment' END,_quantity,(now() AT TIME ZONE 'Asia/Seoul')::date,_reason);
END $$;
REVOKE ALL ON FUNCTION public.adjust_product_stock(uuid,uuid,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(uuid,uuid,integer,text) TO authenticated;
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


CREATE OR REPLACE FUNCTION public.record_product_sale(_id uuid,_product uuid,_quantity numeric,_paid_on date,_method text,_memo text DEFAULT '',_customer uuid DEFAULT NULL,_unit_price numeric DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products; prior public.work_product_sales;
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '제품판매 등록 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _id IS NULL OR _quantity IS NULL OR _quantity NOT BETWEEN 0.001 AND 100000 OR _quantity<>round(_quantity,3) OR _paid_on IS NULL OR _method IS NULL OR _method NOT IN ('card','krw') OR _memo IS NULL OR char_length(_memo)>500 THEN RAISE EXCEPTION '판매 정보를 확인해 주세요.'; END IF;
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
CREATE OR REPLACE FUNCTION public.register_inventory_product(_id uuid,_name text,_price numeric,_stock numeric,_unit text DEFAULT '개')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior public.products;
BEGIN
 IF NOT (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION '최고관리자만 제품을 등록할 수 있습니다.' USING ERRCODE='42501'; END IF;
 IF _id IS NULL OR _name IS NULL OR char_length(btrim(_name)) NOT BETWEEN 1 AND 100 OR _price IS NULL OR _price<0 OR _price>999999999999 OR _price<>round(_price,2) OR _stock IS NULL OR _stock NOT BETWEEN 0 AND 100000000 OR _stock<>round(_stock,3) OR _unit IS NULL OR char_length(btrim(_unit)) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION '제품명, 판매가, 현재 보유 수량을 확인해 주세요.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_id::text,4));
 SELECT * INTO prior FROM public.products WHERE id=_id;
 IF FOUND THEN
  IF prior.name=btrim(_name) AND prior.price=_price AND prior.unit=btrim(_unit) AND (_stock=0 OR EXISTS(SELECT 1 FROM public.stock_movements m WHERE m.id=_id AND m.product_id=_id AND m.quantity=_stock AND m.reason='초기 재고' AND m.created_by=auth.uid())) THEN RETURN _id; END IF;
  RAISE EXCEPTION '이미 등록된 제품입니다. 새로고침해 주세요.';
 END IF;
 INSERT INTO public.products(id,name,price,stock,unit) VALUES(_id,btrim(_name),_price,_stock,btrim(_unit));
 IF _stock>0 THEN INSERT INTO public.stock_movements(id,product_id,quantity,reason,movement_kind) VALUES(_id,_id,_stock,'초기 재고','initial'); END IF;
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.register_inventory_product(uuid,text,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_inventory_product(uuid,text,numeric,numeric,text) TO authenticated;

CREATE FUNCTION public.inventory_balance_report(_from date,_to date)
RETURNS TABLE(product_id uuid,received numeric,sold numeric,sales_amount numeric,opening_stock numeric,used numeric,internal_used numeric,adjustment numeric,closing_stock numeric,notes text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '제품 현황 열람 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to<_from THEN RAISE EXCEPTION '조회 기간을 확인해 주세요.'; END IF;
 RETURN QUERY WITH ledger AS (
 SELECT m.product_id AS pid,
  coalesce(sum(m.quantity) FILTER(WHERE m.effective_on>=_from),0) AS after_start,
  coalesce(sum(m.quantity) FILTER(WHERE m.effective_on>_to),0) AS after_end,
  coalesce(sum(m.quantity) FILTER(WHERE m.effective_on BETWEEN _from AND _to AND m.movement_kind='initial'),0) AS initial,
  coalesce(sum(m.quantity) FILTER(WHERE m.effective_on BETWEEN _from AND _to AND m.movement_kind='receipt'),0) AS received,
  -coalesce(sum(m.quantity) FILTER(WHERE m.effective_on BETWEEN _from AND _to AND m.movement_kind='sale'),0) AS sold,
  -coalesce(sum(m.quantity) FILTER(WHERE m.effective_on BETWEEN _from AND _to AND m.movement_kind='usage'),0) AS used,
  -coalesce(sum(m.quantity) FILTER(WHERE m.effective_on BETWEEN _from AND _to AND m.movement_kind='internal'),0) AS internal_used,
  coalesce(sum(m.quantity) FILTER(WHERE m.effective_on BETWEEN _from AND _to AND m.movement_kind='adjustment'),0) AS adjustment,
  left(string_agg(DISTINCT m.reason,' · ') FILTER(WHERE m.effective_on BETWEEN _from AND _to AND m.movement_kind IN ('usage','internal','adjustment')),500) AS notes
 FROM public.stock_movements m GROUP BY m.product_id
 ), sales AS (
 SELECT w.product_id AS pid,round(w.quantity*w.unit_price,2) AS amount FROM public.work_product_sales w WHERE w.paid_on BETWEEN _from AND _to
 UNION ALL
 SELECT (v->>'product_id')::uuid,round((v->>'quantity')::numeric*(v->>'unit_price')::numeric,2) FROM public.customer_payments cp CROSS JOIN LATERAL jsonb_array_elements(cp.sales) v WHERE cp.paid_on BETWEEN _from AND _to
 ), amounts AS (SELECT t.pid,sum(t.amount) AS amount FROM sales t GROUP BY t.pid)
 SELECT p.id,coalesce(l.received,0),coalesce(l.sold,0),coalesce(a.amount,0),p.stock-coalesce(l.after_start,0)+coalesce(l.initial,0),coalesce(l.used,0),coalesce(l.internal_used,0),coalesce(l.adjustment,0),p.stock-coalesce(l.after_end,0),coalesce(l.notes,'')
 FROM public.products p LEFT JOIN ledger l ON l.pid=p.id LEFT JOIN amounts a ON a.pid=p.id;
END $$;
REVOKE ALL ON FUNCTION public.inventory_balance_report(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inventory_balance_report(date,date) TO authenticated;

CREATE FUNCTION public.product_stock_ledger(_product uuid,_from date,_to date,_offset integer DEFAULT 0)
RETURNS TABLE(id uuid,effective_on date,movement_kind text,quantity numeric,reason text,reservation_id uuid,customer_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '재고 내역 열람 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT m.id,m.effective_on,m.movement_kind,m.quantity,
  coalesce(nullif(w.memo,''),m.reason),m.reservation_id,coalesce(r.customer_name,c.name,'')
 FROM public.stock_movements m LEFT JOIN public.reservations r ON r.id=m.reservation_id LEFT JOIN public.work_product_sales w ON w.id=m.id LEFT JOIN public.customers c ON c.id=w.customer_id
 WHERE m.product_id=_product AND m.effective_on BETWEEN _from AND _to
 ORDER BY m.effective_on DESC,m.created_at DESC,m.id LIMIT 30 OFFSET greatest(coalesce(_offset,0),0);
END $$;
REVOKE ALL ON FUNCTION public.product_stock_ledger(uuid,date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.product_stock_ledger(uuid,date,date,integer) TO authenticated;

-- Round standalone KRW sale amounts once per sale in finance summaries.
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
 SELECT 'product',round(ws.quantity*ws.unit_price,2),CASE WHEN ws.method='card' THEN round(ws.quantity*ws.unit_price,2) ELSE 0 END,CASE WHEN ws.method='krw' THEN round(ws.quantity*ws.unit_price,2) ELSE 0 END,0,0,0
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
 SELECT 'product',round(ws.quantity*ws.unit_price,2),CASE WHEN ws.method='card' THEN round(ws.quantity*ws.unit_price,2) ELSE 0 END,CASE WHEN ws.method='krw' THEN round(ws.quantity*ws.unit_price,2) ELSE 0 END,0,0,0
 FROM public.work_product_sales ws WHERE (_customer IS NULL OR ws.customer_id=_customer) AND (_from IS NULL OR ws.paid_on>=_from) AND (_to IS NULL OR ws.paid_on<=_to)
 )
 SELECT 'product'::text,coalesce(sum(vcost),0),coalesce(sum(vcard),0),coalesce(sum(vkrw),0),coalesce(sum(vjpy),0),coalesce(sum(vusd),0),coalesce(sum(vcny),0) FROM entries;
END $$;

-- Keep the original RPC signatures available for clients using an older page.
CREATE OR REPLACE FUNCTION public.record_work_product_sale(_id uuid,_product uuid,_quantity integer,_paid_on date,_method text,_memo text DEFAULT '',_customer uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN RETURN public.record_product_sale(_id,_product,_quantity::numeric,_paid_on,_method,_memo,_customer,NULL); END $$;
CREATE OR REPLACE FUNCTION public.create_product_with_stock(_id uuid,_name text,_price numeric,_stock integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN RETURN public.register_inventory_product(_id,_name,_price,_stock::numeric,'개'); END $$;
NOTIFY pgrst, 'reload schema';
