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
  FOREACH key IN ARRAY ARRAY['cost','card','bank','bank_jpy','krw','jpy','usd','cny'] LOOP
   IF key IN ('bank','bank_jpy') AND NOT (line ? key) THEN line:=line||jsonb_build_object(key,coalesce((SELECT (v->>key)::numeric FROM jsonb_array_elements(coalesce(old_payment.rows,'[]')) v WHERE v->>'kind'=line->>'kind'),0)); END IF;
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
END $function$;


CREATE OR REPLACE FUNCTION public.admin_business_overview(_from date,_to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE sales jsonb;times jsonb;work jsonb;
BEGIN
 IF NOT (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'ADMIN은 최고관리자만 열람할 수 있습니다.' USING ERRCODE='42501'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to<_from THEN RAISE EXCEPTION '조회 기간을 확인해 주세요.'; END IF;
 WITH entries AS (
  SELECT cp.customer_id,coalesce(cc.name,'미지정') category,coalesce((v->>'card')::numeric,0)+coalesce((v->>'bank')::numeric,0)+coalesce((v->>'krw')::numeric,0) collected,coalesce((v->>'cost')::numeric,0) cost,(coalesce((v->>'jpy')::numeric,0)+coalesce((v->>'bank_jpy')::numeric,0)) jpy,coalesce((v->>'usd')::numeric,0) usd,coalesce((v->>'cny')::numeric,0) cny
  FROM public.customer_payments cp LEFT JOIN public.customers c ON c.id=cp.customer_id LEFT JOIN public.customer_categories cc ON cc.id=c.category_id CROSS JOIN LATERAL jsonb_array_elements(cp.rows) v WHERE cp.paid_on BETWEEN _from AND _to
  UNION ALL
  SELECT ws.customer_id,coalesce(cc.name,'미지정'),round(ws.quantity*ws.unit_price,2),round(ws.quantity*ws.unit_price,2),0,0,0 FROM public.work_product_sales ws LEFT JOIN public.customers c ON c.id=ws.customer_id LEFT JOIN public.customer_categories cc ON cc.id=c.category_id WHERE ws.paid_on BETWEEN _from AND _to
 ), grouped AS (SELECT category,sum(collected) collected,sum(cost) cost,sum(jpy) jpy,sum(usd) usd,sum(cny) cny,count(DISTINCT customer_id) customers FROM entries GROUP BY category)
 SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY category),'[]') INTO sales FROM grouped g;
 WITH grouped AS (SELECT a.employee_id,e.name,sum(extract(epoch FROM least(a.end_at,((_to+1)::timestamp AT TIME ZONE 'Asia/Seoul'))-greatest(a.start_at,(_from::timestamp AT TIME ZONE 'Asia/Seoul')))/60) minutes FROM public.freelancer_attendance a JOIN public.employees e ON e.id=a.employee_id WHERE a.start_at<((_to+1)::timestamp AT TIME ZONE 'Asia/Seoul') AND a.end_at>(_from::timestamp AT TIME ZONE 'Asia/Seoul') GROUP BY a.employee_id,e.name)
 SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY name),'[]') INTO times FROM grouped g;
 WITH grouped AS (SELECT w.employee_id,e.name,count(*) records,sum(w.shot_edit_count) shot,sum(w.upload_count) video,sum(w.feed_upload_count) feed,sum(w.influencer_upload_count) sponsored,
 sum((w.work_counts->>'youtube')::numeric) youtube,sum((w.work_counts->>'dm')::numeric) dm,sum((w.work_counts->>'dmr')::numeric) dmr,sum((w.work_counts->>'dm_confirmed')::numeric) dm_confirmed,sum((w.work_counts->>'dm_visited')::numeric) dm_visited,
 sum((w.work_counts->>'extra_1')::numeric) extra_1,
 sum((w.work_counts->>'extra_2')::numeric) extra_2,
 sum((w.work_counts->>'extra_3')::numeric) extra_3,
 sum((w.work_counts->>'extra_4')::numeric) extra_4,
 sum((w.work_counts->>'extra_5')::numeric) extra_5,
 sum((w.work_counts->>'extra_6')::numeric) extra_6
 FROM public.monthly_work_reports w JOIN public.employees e ON e.id=w.employee_id WHERE w.report_date BETWEEN _from AND _to OR (w.report_date IS NULL AND w.report_month BETWEEN date_trunc('month',_from)::date AND date_trunc('month',_to)::date) GROUP BY w.employee_id,e.name)
 SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY name),'[]') INTO work FROM grouped g;
 RETURN jsonb_build_object('sales',sales,'times',times,'work',work);
END $$;

CREATE OR REPLACE FUNCTION public.admin_sales_by_route_category(_from date,_to date,_route uuid DEFAULT NULL,_unassigned boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE sales jsonb;
BEGIN
 IF NOT (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'ADMIN은 최고관리자만 열람할 수 있습니다.' USING ERRCODE='42501'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to<_from THEN RAISE EXCEPTION '조회 기간을 확인해 주세요.'; END IF;
 WITH entries AS (
  SELECT cp.customer_id,coalesce(cc.name,'미지정') category,coalesce((v->>'card')::numeric,0)+coalesce((v->>'bank')::numeric,0)+coalesce((v->>'krw')::numeric,0) collected,coalesce((v->>'cost')::numeric,0) cost,(coalesce((v->>'jpy')::numeric,0)+coalesce((v->>'bank_jpy')::numeric,0)) jpy,coalesce((v->>'usd')::numeric,0) usd,coalesce((v->>'cny')::numeric,0) cny
  FROM public.customer_payments cp LEFT JOIN public.customers c ON c.id=cp.customer_id LEFT JOIN public.customer_categories cc ON cc.id=c.category_id LEFT JOIN public.reservations r ON r.id=cp.reservation_id CROSS JOIN LATERAL jsonb_array_elements(cp.rows) v WHERE cp.paid_on BETWEEN _from AND _to AND (_route IS NULL OR r.booking_route_id=_route) AND (NOT _unassigned OR r.booking_route_id IS NULL)
  UNION ALL
  SELECT ws.customer_id,coalesce(cc.name,'미지정'),round(ws.quantity*ws.unit_price,2),round(ws.quantity*ws.unit_price,2),0,0,0 FROM public.work_product_sales ws LEFT JOIN public.customers c ON c.id=ws.customer_id LEFT JOIN public.customer_categories cc ON cc.id=c.category_id WHERE ws.paid_on BETWEEN _from AND _to AND _route IS NULL
 ), grouped AS (SELECT category,sum(collected) collected,sum(cost) cost,sum(jpy) jpy,sum(usd) usd,sum(cny) cny,count(DISTINCT customer_id) customers FROM entries GROUP BY category)
 SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY category),'[]') INTO sales FROM grouped g;
 RETURN sales;
END $$;

CREATE OR REPLACE FUNCTION public.admin_filtered_collections(_from date, _to date, _route uuid DEFAULT NULL::uuid, _kind text DEFAULT NULL::text, _category text DEFAULT NULL::text, _unassigned boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb;
BEGIN
 IF NOT (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'ADMIN은 최고관리자만 열람할 수 있습니다.' USING ERRCODE='42501'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to<_from OR (_kind IS NOT NULL AND _kind NOT IN ('service','care','art')) THEN RAISE EXCEPTION '조회 기간과 구분을 확인해 주세요.'; END IF;
 WITH receipts AS (
 SELECT r.booking_route_id route_id,v->>'kind' kind,left(string_agg(DISTINCT coalesce(nullif(v->>'description',''),CASE WHEN v->>'kind'='service' THEN coalesce(nullif(r.service_detail,''),r.service) END),' / '),2000) content,
 sum(coalesce((v->>'card')::numeric,0)+coalesce((v->>'bank')::numeric,0)+coalesce((v->>'krw')::numeric,0)) collected,
 sum(coalesce((v->>'cost')::numeric,0)) cost,
 sum(coalesce((v->>'jpy')::numeric,0)+coalesce((v->>'bank_jpy')::numeric,0)) jpy,sum(coalesce((v->>'usd')::numeric,0)) usd,sum(coalesce((v->>'cny')::numeric,0)) cny
 FROM public.customer_payments cp JOIN public.reservations r ON r.id=cp.reservation_id LEFT JOIN public.customers c ON c.id=cp.customer_id LEFT JOIN public.customer_categories cc ON cc.id=c.category_id CROSS JOIN LATERAL jsonb_array_elements(cp.rows) v
 WHERE cp.paid_on BETWEEN _from AND _to AND (_category IS NULL OR coalesce(cc.name,'미지정')=_category) AND v->>'kind' IN ('service','care','art') AND (nullif(v->>'description','') IS NOT NULL OR (coalesce((v->>'cost')::numeric,0)+coalesce((v->>'card')::numeric,0)+coalesce((v->>'bank')::numeric,0)+coalesce((v->>'krw')::numeric,0)+coalesce((v->>'jpy')::numeric,0)+coalesce((v->>'usd')::numeric,0)+coalesce((v->>'cny')::numeric,0))>0)
 GROUP BY r.booking_route_id,v->>'kind'
 ),notes AS (SELECT * FROM public.admin_route_settlements WHERE _category IS NULL AND period_from=_from AND period_to=_to),combined AS (
 SELECT coalesce(p.route_id,n.route_id) route_id,coalesce(p.kind,n.kind) kind,p.content,coalesce(p.collected,0) collected,coalesce(p.cost,0) cost,coalesce(p.jpy,0) jpy,coalesce(p.usd,0) usd,coalesce(p.cny,0) cny,n.id record_id,coalesce(n.version,0) version,coalesce(n.amount,0) amount,coalesce(n.completed_amount,0) completed,coalesce(n.memo,'') memo
 FROM receipts p FULL JOIN notes n ON coalesce(p.route_id::text,'unassigned')=n.route_key AND p.kind=n.kind
 ) SELECT coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('route_name',coalesce(br.name,'미지정')) ORDER BY coalesce(br.name,'미지정'),c.kind),'[]') INTO result FROM combined c LEFT JOIN public.booking_routes br ON br.id=c.route_id WHERE (_route IS NULL OR c.route_id=_route) AND (NOT _unassigned OR c.route_id IS NULL) AND (_kind IS NULL OR c.kind=_kind);
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_sales_entries(_from date, _to date, _scope text, _kind text DEFAULT NULL::text, _route uuid DEFAULT NULL::uuid, _unassigned boolean DEFAULT false, _category text DEFAULT NULL::text, _offset integer DEFAULT 0)
 RETURNS TABLE(entry_id uuid, reservation_id uuid, paid_on date, customer_name text, category text, route_name text, service_content text, care_content text, payment_rows jsonb, payment_memo text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF (public.is_active_staff(auth.uid()) AND (
  public.has_role(auth.uid(),'admin')
  OR (_scope='performance' AND public.has_role(auth.uid(),'internal'))
 )) IS NOT TRUE THEN
  RAISE EXCEPTION '매출 상세내역은 대표관리자만 열람할 수 있습니다.' USING ERRCODE='42501';
 END IF;
 IF _from IS NULL OR _to IS NULL OR _to<_from OR _scope IS NULL OR _scope NOT IN ('category','settlement','performance')
 OR (_kind IS NOT NULL AND _kind NOT IN ('service','care','art')) THEN
  RAISE EXCEPTION '조회 조건을 확인해 주세요.';
 END IF;
 RETURN QUERY WITH entries AS (
  SELECT cp.reservation_id AS entry_id,cp.reservation_id,cp.paid_on,cp.customer_id,
   coalesce(nullif(r.customer_name,''),c.name,'고객 미지정') AS customer_name,
   coalesce(cc.name,'미지정') AS category,coalesce(br.name,'미지정') AS route_name,
   coalesce(payment.service_content,nullif(r.service_detail,''),r.service,'') AS service_content,
   coalesce(payment.care_content,'') AS care_content,payment.lines AS payment_rows,coalesce(cp.memo,'') AS payment_memo
  FROM public.customer_payments cp
  LEFT JOIN public.reservations r ON r.id=cp.reservation_id
  LEFT JOIN public.customers c ON c.id=cp.customer_id
  LEFT JOIN public.customer_categories cc ON cc.id=c.category_id
  LEFT JOIN public.booking_routes br ON br.id=r.booking_route_id
  CROSS JOIN LATERAL (
   SELECT jsonb_agg(v) AS lines,
    max(nullif(v->>'description','')) FILTER (WHERE v->>'kind'='service') AS service_content,
    max(nullif(v->>'description','')) FILTER (WHERE v->>'kind'='care') AS care_content
   FROM jsonb_array_elements(cp.rows) v
   WHERE (_scope='category' OR v->>'kind' IN ('service','care','art'))
    AND (_kind IS NULL OR v->>'kind'=_kind)
    AND (nullif(btrim(v->>'description'),'') IS NOT NULL OR EXISTS (
     SELECT 1 FROM jsonb_each(v) AS amount(key,value)
     WHERE key IN ('cost','card','bank','bank_jpy','krw','jpy','usd','cny')
      AND CASE WHEN jsonb_typeof(value)='number' THEN value::numeric<>0 ELSE false END
    ))
  ) payment
  WHERE cp.paid_on BETWEEN _from AND _to
   AND (_route IS NULL OR r.booking_route_id=_route) AND (NOT _unassigned OR r.booking_route_id IS NULL)
   AND (_category IS NULL OR coalesce(cc.name,'미지정')=_category) AND payment.lines IS NOT NULL
  UNION ALL
  SELECT w.id,NULL::uuid,w.paid_on,w.customer_id,coalesce(c.name,'고객 미지정'),coalesce(cc.name,'미지정'),'미지정',
   '','',jsonb_build_array(jsonb_build_object('kind','product','description',w.product_name||' × '||w.quantity,
    w.method,round(w.quantity*w.unit_price,2))),coalesce(w.memo,'')
  FROM public.work_product_sales w
  LEFT JOIN public.customers c ON c.id=w.customer_id
  LEFT JOIN public.customer_categories cc ON cc.id=c.category_id
  WHERE _scope='category' AND _route IS NULL AND w.paid_on BETWEEN _from AND _to AND (_category IS NULL OR coalesce(cc.name,'미지정')=_category)
 ), collected AS (
 SELECT e.*,CASE WHEN _scope IN ('settlement','performance') THEN coalesce(e.customer_id,e.entry_id) ELSE e.entry_id END AS group_id
 FROM entries e
 WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(e.payment_rows) AS line(value)
  CROSS JOIN LATERAL jsonb_each(line.value) AS amount(key,value)
  WHERE amount.key IN ('cost','card','bank','bank_jpy','krw','jpy','usd','cny')
   AND CASE WHEN jsonb_typeof(amount.value)='number' THEN amount.value::numeric>0 ELSE false END
 )
 ), grouped AS (
 SELECT (array_agg(e.entry_id ORDER BY e.paid_on DESC,e.entry_id))[1] AS entry_id,
  (array_agg(e.reservation_id ORDER BY e.paid_on DESC,e.entry_id))[1] AS reservation_id,
  max(e.paid_on) AS paid_on,
  (array_agg(e.customer_name ORDER BY e.paid_on DESC,e.entry_id))[1] AS customer_name,
  (array_agg(e.category ORDER BY e.paid_on DESC,e.entry_id))[1] AS category,
  string_agg(DISTINCT e.route_name,' · ' ORDER BY e.route_name) AS route_name,
  string_agg(nullif(e.service_content,''),' · ' ORDER BY e.paid_on DESC,e.entry_id) AS service_content,
  string_agg(nullif(e.care_content,''),' · ' ORDER BY e.paid_on DESC,e.entry_id) AS care_content,
  string_agg(nullif(e.payment_memo,''),' · ' ORDER BY e.paid_on DESC,e.entry_id) AS payment_memo,
  jsonb_agg(e.payment_rows ORDER BY e.paid_on DESC,e.entry_id) AS payments
 FROM collected e
 GROUP BY e.group_id
 )
 SELECT g.entry_id,g.reservation_id,g.paid_on,g.customer_name,g.category,g.route_name,
  coalesce(g.service_content,''),coalesce(g.care_content,''),
  (SELECT jsonb_agg(line.value ORDER BY batch.position,line.position)
   FROM jsonb_array_elements(g.payments) WITH ORDINALITY AS batch(value,position)
   CROSS JOIN LATERAL jsonb_array_elements(batch.value) WITH ORDINALITY AS line(value,position)),
  coalesce(g.payment_memo,'')
 FROM grouped g
 ORDER BY g.paid_on DESC,g.entry_id,g.reservation_id NULLS LAST
 LIMIT 30 OFFSET greatest(coalesce(_offset,0),0);
END $function$;

CREATE OR REPLACE FUNCTION public.admin_sales_entries(_from date, _to date, _scope text, _preview_staff uuid, _kind text DEFAULT NULL::text, _route uuid DEFAULT NULL::uuid, _unassigned boolean DEFAULT false, _category text DEFAULT NULL::text, _offset integer DEFAULT 0)
 RETURNS TABLE(entry_id uuid, reservation_id uuid, paid_on date, customer_name text, category text, route_name text, service_content text, care_content text, payment_rows jsonb, payment_memo text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE linked_route uuid;
BEGIN
 IF (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')
     AND public.is_active_staff(_preview_staff) AND public.has_role(_preview_staff,'external')) IS NOT TRUE THEN
  RAISE EXCEPTION '조회 권한이 없습니다.' USING ERRCODE='42501';
 END IF;
 SELECT route_id INTO linked_route FROM public.external_performance_routes WHERE staff_id=_preview_staff;
 IF _from IS NULL OR _to IS NULL OR _to<_from OR _scope IS NULL OR _scope NOT IN ('category','settlement','performance')
 OR (_kind IS NOT NULL AND _kind NOT IN ('service','care','art')) THEN
  RAISE EXCEPTION '조회 조건을 확인해 주세요.';
 END IF;
 RETURN QUERY WITH entries AS (
  SELECT cp.reservation_id AS entry_id,cp.reservation_id,cp.paid_on,cp.customer_id,
   coalesce(nullif(r.customer_name,''),c.name,'고객 미지정') AS customer_name,
   coalesce(cc.name,'미지정') AS category,coalesce(br.name,'미지정') AS route_name,
   coalesce(payment.service_content,nullif(r.service_detail,''),r.service,'') AS service_content,
   coalesce(payment.care_content,'') AS care_content,payment.lines AS payment_rows,coalesce(cp.memo,'') AS payment_memo
  FROM public.customer_payments cp
  LEFT JOIN public.reservations r ON r.id=cp.reservation_id
  LEFT JOIN public.customers c ON c.id=cp.customer_id
  LEFT JOIN public.customer_categories cc ON cc.id=c.category_id
  LEFT JOIN public.booking_routes br ON br.id=r.booking_route_id
  CROSS JOIN LATERAL (
   SELECT jsonb_agg(v) AS lines,
    max(nullif(v->>'description','')) FILTER (WHERE v->>'kind'='service') AS service_content,
    max(nullif(v->>'description','')) FILTER (WHERE v->>'kind'='care') AS care_content
   FROM jsonb_array_elements(cp.rows) v
   WHERE (_scope='category' OR v->>'kind' IN ('service','care','art'))
    AND (_kind IS NULL OR v->>'kind'=_kind)
    AND (nullif(btrim(v->>'description'),'') IS NOT NULL OR EXISTS (
     SELECT 1 FROM jsonb_each(v) AS amount(key,value)
     WHERE key IN ('cost','card','bank','bank_jpy','krw','jpy','usd','cny')
      AND CASE WHEN jsonb_typeof(value)='number' THEN value::numeric<>0 ELSE false END
    ))
  ) payment
  WHERE cp.paid_on BETWEEN _from AND _to
   AND (r.created_by=_preview_staff OR r.booking_route_id=linked_route) AND (NOT _unassigned OR r.booking_route_id IS NULL)
   AND (_category IS NULL OR coalesce(cc.name,'미지정')=_category) AND payment.lines IS NOT NULL
 ), collected AS (
 SELECT e.*,CASE WHEN _scope IN ('settlement','performance') THEN coalesce(e.customer_id,e.entry_id) ELSE e.entry_id END AS group_id
 FROM entries e
 WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(e.payment_rows) AS line(value)
  CROSS JOIN LATERAL jsonb_each(line.value) AS amount(key,value)
  WHERE amount.key IN ('cost','card','bank','bank_jpy','krw','jpy','usd','cny')
   AND CASE WHEN jsonb_typeof(amount.value)='number' THEN amount.value::numeric>0 ELSE false END
 )
 ), grouped AS (
 SELECT (array_agg(e.entry_id ORDER BY e.paid_on DESC,e.entry_id))[1] AS entry_id,
  (array_agg(e.reservation_id ORDER BY e.paid_on DESC,e.entry_id))[1] AS reservation_id,
  max(e.paid_on) AS paid_on,
  (array_agg(e.customer_name ORDER BY e.paid_on DESC,e.entry_id))[1] AS customer_name,
  (array_agg(e.category ORDER BY e.paid_on DESC,e.entry_id))[1] AS category,
  string_agg(DISTINCT e.route_name,' · ' ORDER BY e.route_name) AS route_name,
  string_agg(nullif(e.service_content,''),' · ' ORDER BY e.paid_on DESC,e.entry_id) AS service_content,
  string_agg(nullif(e.care_content,''),' · ' ORDER BY e.paid_on DESC,e.entry_id) AS care_content,
  string_agg(nullif(e.payment_memo,''),' · ' ORDER BY e.paid_on DESC,e.entry_id) AS payment_memo,
  jsonb_agg(e.payment_rows ORDER BY e.paid_on DESC,e.entry_id) AS payments
 FROM collected e
 GROUP BY e.group_id
 )
 SELECT g.entry_id,g.reservation_id,g.paid_on,g.customer_name,g.category,g.route_name,
  coalesce(g.service_content,''),coalesce(g.care_content,''),
  (SELECT jsonb_agg(line.value ORDER BY batch.position,line.position)
   FROM jsonb_array_elements(g.payments) WITH ORDINALITY AS batch(value,position)
   CROSS JOIN LATERAL jsonb_array_elements(batch.value) WITH ORDINALITY AS line(value,position)),
  coalesce(g.payment_memo,'')
 FROM grouped g
 ORDER BY g.paid_on DESC,g.entry_id,g.reservation_id NULLS LAST
 LIMIT 30 OFFSET greatest(coalesce(_offset,0),0);
END $function$;

CREATE OR REPLACE FUNCTION public.external_performance_for_staff(_from date, _to date, _staff uuid, _route_only boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  own_route uuid;
  result jsonb;
BEGIN
  IF (public.is_active_staff(auth.uid())
    AND (_staff=auth.uid() OR public.has_role(auth.uid(), 'admin'))
    AND public.is_active_staff(_staff) AND public.has_role(_staff, 'external')) IS NOT TRUE THEN
    RAISE EXCEPTION '외부 직원 본인만 조회할 수 있습니다.' USING ERRCODE='42501';
  END IF;
  IF _from IS NULL OR _to IS NULL OR _from > _to THEN
    RAISE EXCEPTION '조회 기간을 확인해 주세요.';
  END IF;
  SELECT route_id INTO own_route FROM public.external_performance_routes WHERE staff_id=_staff;

  WITH entries AS (
    SELECT cp.paid_on, line->>'kind' AS kind, nullif(btrim(line->>'description'),'') AS description,
      coalesce((line->>'cost')::numeric,0) AS cost,
      coalesce((line->>'bank')::numeric,0) AS bank,
      coalesce((line->>'bank_jpy')::numeric,0) AS bank_jpy,
      coalesce((line->>'card')::numeric,0)+coalesce((line->>'bank')::numeric,0)+coalesce((line->>'krw')::numeric,0) AS krw,
      coalesce((line->>'jpy')::numeric,0) AS jpy, coalesce((line->>'usd')::numeric,0) AS usd, coalesce((line->>'cny')::numeric,0) AS cny
    FROM public.customer_payments cp
    JOIN public.reservations r ON r.id=cp.reservation_id
    CROSS JOIN LATERAL jsonb_array_elements(cp.rows) line
    WHERE (r.booking_route_id=own_route OR (NOT _route_only AND r.created_by=_staff))
      AND cp.paid_on BETWEEN _from AND _to
      AND line->>'kind' IN ('service','care','art')
  ), settlements AS (
    SELECT kind, amount, completed_amount
    FROM public.admin_route_settlements
    WHERE route_id=own_route AND period_from=_from AND period_to=_to
  )
  SELECT jsonb_build_object(
    'entries', (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY paid_on DESC, kind, description),'[]') FROM entries e
      WHERE description IS NOT NULL OR cost<>0 OR bank_jpy<>0 OR krw<>0 OR jpy<>0 OR usd<>0 OR cny<>0),
    'settlements', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY kind),'[]') FROM settlements s)
  ) INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.payment_summary_v2(_customer uuid DEFAULT NULL,_from date DEFAULT NULL,_to date DEFAULT NULL,_product_only boolean DEFAULT false)
RETURNS TABLE(kind text,cost numeric,card numeric,bank numeric,krw numeric,jpy numeric,usd numeric,cny numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_manage_sales() OR _product_only IS NULL OR (NOT _product_only AND NOT public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION '합계 열람 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 RETURN QUERY WITH entries AS (
  SELECT line->>'kind' k,coalesce((line->>'cost')::numeric,0) vcost,coalesce((line->>'card')::numeric,0) vcard,coalesce((line->>'bank')::numeric,0) vbank,coalesce((line->>'krw')::numeric,0) vkrw,coalesce((line->>'jpy')::numeric,0)+coalesce((line->>'bank_jpy')::numeric,0) vjpy,coalesce((line->>'usd')::numeric,0) vusd,coalesce((line->>'cny')::numeric,0) vcny
  FROM public.customer_payments cp CROSS JOIN LATERAL jsonb_array_elements(cp.rows) line
  WHERE (_customer IS NULL OR cp.customer_id=_customer) AND (_from IS NULL OR cp.paid_on>=_from) AND (_to IS NULL OR cp.paid_on<=_to) AND (NOT _product_only OR line->>'kind'='product')
  UNION ALL
  SELECT 'product',round(ws.quantity*ws.unit_price,2),CASE WHEN ws.method='card' THEN round(ws.quantity*ws.unit_price,2) ELSE 0 END,CASE WHEN ws.method='bank' THEN round(ws.quantity*ws.unit_price,2) ELSE 0 END,CASE WHEN ws.method='krw' THEN round(ws.quantity*ws.unit_price,2) ELSE 0 END,0,0,0
  FROM public.work_product_sales ws WHERE (_customer IS NULL OR ws.customer_id=_customer) AND (_from IS NULL OR ws.paid_on>=_from) AND (_to IS NULL OR ws.paid_on<=_to)
 ), totals AS (
  SELECT coalesce(k,'total') k,sum(vcost) vcost,sum(vcard) vcard,sum(vbank) vbank,sum(vkrw) vkrw,sum(vjpy) vjpy,sum(vusd) vusd,sum(vcny) vcny FROM entries GROUP BY ROLLUP(k)
 ) SELECT t.k,t.vcost,t.vcard,t.vbank,t.vkrw,t.vjpy,t.vusd,t.vcny FROM totals t WHERE NOT _product_only OR t.k='product';
END $$;
