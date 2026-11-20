CREATE OR REPLACE FUNCTION public.save_inventory_route(_id uuid,_name text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '경로 관리 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _id IS NULL OR char_length(btrim(coalesce(_name,''))) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION '경로명은 1~30자로 입력해 주세요.'; END IF;
 INSERT INTO public.product_routes(id,name,sort_order) VALUES(_id,btrim(_name),coalesce((SELECT max(sort_order)+1 FROM public.product_routes),0))
 ON CONFLICT(id) DO UPDATE SET name=excluded.name,deleted_at=NULL;
 RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.delete_inventory_route(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '경로 관리 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.product_routes WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '경로를 찾을 수 없습니다.'; END IF;
 IF EXISTS(SELECT 1 FROM public.products WHERE route_id=_id AND deleted_at IS NULL) THEN RAISE EXCEPTION '이 경로의 제품을 다른 경로로 옮기거나 삭제한 뒤 경로를 삭제해 주세요.'; END IF;
 UPDATE public.product_routes SET deleted_at=coalesce(deleted_at,now()) WHERE id=_id;
END $$;

CREATE OR REPLACE FUNCTION public.register_routed_product(_id uuid,_name text,_price numeric,_stock numeric,_unit text,_route uuid DEFAULT NULL,_stock_confirmed boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products;
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '제품 등록 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_id::text,4));
 SELECT * INTO p FROM public.products WHERE id=_id FOR UPDATE;
 IF FOUND AND (p.deleted_at IS NOT NULL OR p.route_id IS DISTINCT FROM _route) THEN RAISE EXCEPTION '이미 등록된 제품입니다. 제품 수정에서 변경해 주세요.'; END IF;
 IF _route IS NOT NULL THEN
  PERFORM 1 FROM public.product_routes WHERE id=_route AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '경로를 확인해 주세요.'; END IF;
 END IF;
 PERFORM public.register_inventory_product(_id,_name,_price,_stock,_unit);
 IF p.id IS NULL THEN UPDATE public.products SET route_id=_route,stock_confirmed=coalesce(_stock_confirmed,true) WHERE id=_id; END IF;
 RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.edit_inventory_product(_id uuid,_event uuid,_name text,_price numeric,_unit text,_route uuid DEFAULT NULL,_initial_stock numeric DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products; prior public.product_catalog_history; payload jsonb; delta numeric; kind text;
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '제품 수정 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _event IS NULL OR char_length(btrim(coalesce(_name,''))) NOT BETWEEN 1 AND 100 OR _price IS NULL OR _price NOT BETWEEN 0 AND 999999999999 OR _price<>round(_price,2) OR char_length(btrim(coalesce(_unit,''))) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION '제품명·판매가·단위를 확인해 주세요.'; END IF;
 IF _initial_stock IS NOT NULL AND (_initial_stock NOT BETWEEN 0 AND 100000000 OR _initial_stock<>round(_initial_stock,3)) THEN RAISE EXCEPTION '초기 수량은 0 이상, 소수점 3자리까지 입력해 주세요.'; END IF;
 payload:=jsonb_build_object('name',btrim(_name),'price',_price,'unit',btrim(_unit),'route',_route,'initial_stock',_initial_stock);
 PERFORM pg_advisory_xact_lock(hashtextextended(_event::text,7));
 SELECT * INTO prior FROM public.product_catalog_history WHERE id=_event;
 IF FOUND THEN
  IF prior.product_id=_id AND prior.changed_by=auth.uid() AND prior.request=payload THEN RETURN _id; END IF;
  RAISE EXCEPTION '이미 처리한 수정 요청입니다. 새로고침해 주세요.';
 END IF;
 SELECT * INTO p FROM public.products WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR p.deleted_at IS NOT NULL THEN RAISE EXCEPTION '수정할 제품을 찾을 수 없습니다.'; END IF;
 IF _initial_stock IS NOT NULL AND p.stock_confirmed THEN RAISE EXCEPTION '이미 확인된 재고입니다. 수량 변경은 입출고 기록을 이용해 주세요.'; END IF;
 UPDATE public.products SET name=btrim(_name),price=_price,unit=btrim(_unit),route_id=_route WHERE id=_id;
 IF _initial_stock IS NOT NULL THEN
  delta:=_initial_stock-p.stock;
  IF delta<>0 THEN
   kind:=CASE WHEN EXISTS(SELECT 1 FROM public.stock_movements WHERE product_id=_id) THEN 'adjustment' ELSE 'initial' END;
   INSERT INTO public.stock_movements(id,product_id,quantity,reason,movement_kind) VALUES(_event,_id,delta,'초기 재고 확인',kind);
  END IF;
  UPDATE public.products SET stock=_initial_stock,stock_confirmed=true WHERE id=_id;
 END IF;
 INSERT INTO public.product_catalog_history(id,product_id,action,request,old_data,new_data) SELECT _event,_id,'edit',payload,to_jsonb(p),to_jsonb(n) FROM public.products n WHERE n.id=_id;
 RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.set_inventory_product_deleted(_id uuid,_event uuid,_deleted boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products; prior public.product_catalog_history; payload jsonb;
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '제품 관리 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _event IS NULL OR _deleted IS NULL THEN RAISE EXCEPTION '제품 상태를 확인해 주세요.'; END IF;
 payload:=jsonb_build_object('deleted',_deleted);
 PERFORM pg_advisory_xact_lock(hashtextextended(_event::text,7));
 SELECT * INTO prior FROM public.product_catalog_history WHERE id=_event;
 IF FOUND THEN
  IF prior.product_id=_id AND prior.changed_by=auth.uid() AND prior.request=payload THEN RETURN _id; END IF;
  RAISE EXCEPTION '이미 처리된 요청입니다.';
 END IF;
 SELECT * INTO p FROM public.products WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '제품을 찾을 수 없습니다.'; END IF;
 UPDATE public.products SET deleted_at=CASE WHEN _deleted THEN coalesce(deleted_at,now()) ELSE NULL END,is_active=NOT _deleted,
 route_id=CASE WHEN NOT _deleted AND EXISTS(SELECT 1 FROM public.product_routes WHERE id=p.route_id AND deleted_at IS NOT NULL) THEN NULL ELSE route_id END WHERE id=_id;
 INSERT INTO public.product_catalog_history(id,product_id,action,request,old_data,new_data) SELECT _event,_id,CASE WHEN _deleted THEN 'delete' ELSE 'restore' END,payload,to_jsonb(p),to_jsonb(n) FROM public.products n WHERE n.id=_id;
 RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.register_inventory_product(_id uuid,_name text,_price numeric,_stock numeric,_unit text DEFAULT '개')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior public.products;
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '제품 등록 권한이 없습니다.' USING ERRCODE='42501'; END IF;
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

CREATE OR REPLACE FUNCTION public.product_inventory_overview(_from date,_to date)
RETURNS TABLE(product_id uuid,received bigint,sold bigint,sales_amount numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '제품 현황 열람 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to<_from THEN RAISE EXCEPTION '조회 기간을 확인해 주세요.'; END IF;
 RETURN QUERY WITH intake AS (
  SELECT m.product_id AS pid,sum(m.quantity) AS qty FROM public.stock_movements m
  WHERE m.quantity>0 AND m.reservation_id IS NULL
   AND m.created_at>=(_from::timestamp AT TIME ZONE 'Asia/Seoul')
   AND m.created_at<((_to+1)::timestamp AT TIME ZONE 'Asia/Seoul')
  GROUP BY m.product_id
 ), sales AS (
  SELECT s.product_id AS pid,s.quantity::bigint AS qty,s.quantity*s.unit_price AS amount
  FROM public.work_product_sales s WHERE s.paid_on BETWEEN _from AND _to
  UNION ALL
  SELECT (sale->>'product_id')::uuid,(sale->>'quantity')::bigint,(sale->>'quantity')::numeric*(sale->>'unit_price')::numeric
  FROM public.customer_payments cp CROSS JOIN LATERAL jsonb_array_elements(cp.sales) sale
  WHERE cp.paid_on BETWEEN _from AND _to
 ), totals AS (
  SELECT s.pid,sum(s.qty)::bigint AS qty,sum(s.amount) AS amount FROM sales s GROUP BY s.pid
 )
 SELECT p.id,coalesce(i.qty,0)::bigint,coalesce(t.qty,0),coalesce(t.amount,0)
 FROM public.products p LEFT JOIN intake i ON i.pid=p.id LEFT JOIN totals t ON t.pid=p.id;
END $$;

CREATE OR REPLACE FUNCTION public.inventory_balance_report(_from date,_to date)
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

CREATE OR REPLACE FUNCTION public.product_stock_ledger(_product uuid,_from date,_to date,_offset integer DEFAULT 0)
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

CREATE OR REPLACE FUNCTION public.product_sales_report(_from date,_to date,_offset integer DEFAULT 0)
RETURNS TABLE(sale_key text,paid_on date,customer_name text,product_name text,quantity numeric,unit text,unit_price numeric,sales_amount numeric,reservation_id uuid,source text,total_count bigint,total_amount numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '제품 판매내역 열람 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to<_from THEN RAISE EXCEPTION '조회 기간을 확인해 주세요.'; END IF;
 RETURN QUERY WITH sales AS (
  SELECT cp.reservation_id::text||':'||(v->>'product_id') AS sale_key,cp.paid_on,
   coalesce(nullif(r.customer_name,''),c.name,'고객 미지정') AS customer_name,
   coalesce(nullif(v->>'name',''),p.name,'제품') AS product_name,(v->>'quantity')::numeric AS quantity,
   coalesce(p.unit,'개') AS unit,(v->>'unit_price')::numeric AS unit_price,
   round((v->>'quantity')::numeric*(v->>'unit_price')::numeric,2) AS sales_amount,cp.reservation_id,'예약 구매'::text AS source
  FROM public.customer_payments cp CROSS JOIN LATERAL jsonb_array_elements(cp.sales) v
  LEFT JOIN public.reservations r ON r.id=cp.reservation_id LEFT JOIN public.customers c ON c.id=cp.customer_id
  LEFT JOIN public.products p ON p.id=(v->>'product_id')::uuid
  WHERE cp.paid_on BETWEEN _from AND _to
  UNION ALL
  SELECT w.id::text,w.paid_on,coalesce(c.name,'고객 미지정'),w.product_name,w.quantity,coalesce(p.unit,'개'),w.unit_price,round(w.quantity*w.unit_price,2),NULL::uuid,'예약 외 판매'::text
  FROM public.work_product_sales w LEFT JOIN public.customers c ON c.id=w.customer_id LEFT JOIN public.products p ON p.id=w.product_id
  WHERE w.paid_on BETWEEN _from AND _to
 )
 SELECT s.sale_key,s.paid_on,s.customer_name,s.product_name,s.quantity,s.unit,s.unit_price,s.sales_amount,s.reservation_id,s.source,count(*) OVER(),sum(s.sales_amount) OVER()
 FROM sales s ORDER BY s.paid_on DESC,s.sale_key LIMIT 50 OFFSET greatest(coalesce(_offset,0),0);
END $$;

CREATE OR REPLACE FUNCTION public.record_product_movement(_event uuid,_product uuid,_kind text,_quantity numeric,_date date,_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE delta numeric; prior public.stock_movements;
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '재고 기록 권한이 없습니다.' USING ERRCODE='42501'; END IF;
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

ALTER POLICY "staff read product changes" ON public.product_catalog_history USING ((SELECT public.can_manage_sales()));
ALTER POLICY "staff read stock" ON public.stock_movements USING ((SELECT public.can_manage_sales()));

CREATE FUNCTION public.set_inventory_product_active(_id uuid,_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous public.products;
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '제품 관리 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _active IS NULL THEN RAISE EXCEPTION '제품 상태를 선택해 주세요.'; END IF;
 SELECT * INTO previous FROM public.products WHERE id=_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '관리할 제품을 찾을 수 없습니다.'; END IF;
 IF previous.is_active = _active THEN RETURN; END IF;
 UPDATE public.products SET is_active=_active WHERE id=_id;
 INSERT INTO public.product_catalog_history(id,product_id,action,request,old_data,new_data)
 SELECT gen_random_uuid(),_id,CASE WHEN _active THEN 'activate' ELSE 'deactivate' END,
   jsonb_build_object('active',_active),to_jsonb(previous),to_jsonb(p)
 FROM public.products p WHERE p.id=_id;
END $$;
REVOKE ALL ON FUNCTION public.set_inventory_product_active(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_inventory_product_active(uuid,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
