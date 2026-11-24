CREATE OR REPLACE FUNCTION public.admin_business_overview(_from date,_to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE sales jsonb;times jsonb;work jsonb;
BEGIN
 IF NOT (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'ADMIN은 최고관리자만 열람할 수 있습니다.' USING ERRCODE='42501'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to<_from THEN RAISE EXCEPTION '조회 기간을 확인해 주세요.'; END IF;
 WITH entries AS (
  SELECT cp.customer_id,coalesce(cc.name,'미지정') category,coalesce((v->>'card')::numeric,0)+coalesce((v->>'bank')::numeric,0)+coalesce((v->>'krw')::numeric,0) collected,coalesce((v->>'cost')::numeric,0) cost,coalesce((v->>'jpy')::numeric,0) jpy,coalesce((v->>'usd')::numeric,0) usd,coalesce((v->>'cny')::numeric,0) cny
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
  SELECT cp.customer_id,coalesce(cc.name,'미지정') category,coalesce((v->>'card')::numeric,0)+coalesce((v->>'bank')::numeric,0)+coalesce((v->>'krw')::numeric,0) collected,coalesce((v->>'cost')::numeric,0) cost,coalesce((v->>'jpy')::numeric,0) jpy,coalesce((v->>'usd')::numeric,0) usd,coalesce((v->>'cny')::numeric,0) cny
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
 sum(coalesce((v->>'jpy')::numeric,0)) jpy,sum(coalesce((v->>'usd')::numeric,0)) usd,sum(coalesce((v->>'cny')::numeric,0)) cny
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
     WHERE key IN ('cost','card','bank','krw','jpy','usd','cny')
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
  WHERE amount.key IN ('cost','card','bank','krw','jpy','usd','cny')
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
     WHERE key IN ('cost','card','bank','krw','jpy','usd','cny')
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
  WHERE amount.key IN ('cost','card','bank','krw','jpy','usd','cny')
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
      WHERE description IS NOT NULL OR cost<>0 OR krw<>0 OR jpy<>0 OR usd<>0 OR cny<>0),
    'settlements', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY kind),'[]') FROM settlements s)
  ) INTO result;
  RETURN result;
END $$;
