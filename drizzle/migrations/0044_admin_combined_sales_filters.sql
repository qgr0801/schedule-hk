CREATE FUNCTION public.admin_filtered_collections(_from date,_to date,_route uuid DEFAULT NULL,_kind text DEFAULT NULL,_category text DEFAULT NULL,_unassigned boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'ADMIN은 최고관리자만 열람할 수 있습니다.' USING ERRCODE='42501'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to<_from OR (_kind IS NOT NULL AND _kind NOT IN ('service','care')) THEN RAISE EXCEPTION '조회 기간과 구분을 확인해 주세요.'; END IF;
 WITH receipts AS (
 SELECT r.booking_route_id route_id,v->>'kind' kind,left(string_agg(DISTINCT coalesce(nullif(v->>'description',''),CASE WHEN v->>'kind'='service' THEN coalesce(nullif(r.service_detail,''),r.service) END),' / '),2000) content,
 sum(coalesce((v->>'card')::numeric,0)+coalesce((v->>'bank')::numeric,0)+coalesce((v->>'krw')::numeric,0)) collected,
 sum(coalesce((v->>'jpy')::numeric,0)) jpy,sum(coalesce((v->>'usd')::numeric,0)) usd,sum(coalesce((v->>'cny')::numeric,0)) cny
 FROM public.customer_payments cp JOIN public.reservations r ON r.id=cp.reservation_id LEFT JOIN public.customers c ON c.id=cp.customer_id LEFT JOIN public.customer_categories cc ON cc.id=c.category_id CROSS JOIN LATERAL jsonb_array_elements(cp.rows) v
 WHERE cp.paid_on BETWEEN _from AND _to AND (_category IS NULL OR coalesce(cc.name,'미지정')=_category) AND v->>'kind' IN ('service','care') AND (nullif(v->>'description','') IS NOT NULL OR (coalesce((v->>'cost')::numeric,0)+coalesce((v->>'card')::numeric,0)+coalesce((v->>'bank')::numeric,0)+coalesce((v->>'krw')::numeric,0)+coalesce((v->>'jpy')::numeric,0)+coalesce((v->>'usd')::numeric,0)+coalesce((v->>'cny')::numeric,0))>0)
 GROUP BY r.booking_route_id,v->>'kind'
 ),notes AS (SELECT * FROM public.admin_route_settlements WHERE _category IS NULL AND period_from=_from AND period_to=_to),combined AS (
 SELECT coalesce(p.route_id,n.route_id) route_id,coalesce(p.kind,n.kind) kind,p.content,coalesce(p.collected,0) collected,coalesce(p.jpy,0) jpy,coalesce(p.usd,0) usd,coalesce(p.cny,0) cny,n.id record_id,coalesce(n.version,0) version,coalesce(n.amount,0) amount,coalesce(n.completed_amount,0) completed,coalesce(n.memo,'') memo
 FROM receipts p FULL JOIN notes n ON coalesce(p.route_id::text,'unassigned')=n.route_key AND p.kind=n.kind
 ) SELECT coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('route_name',coalesce(br.name,'미지정')) ORDER BY coalesce(br.name,'미지정'),c.kind),'[]') INTO result FROM combined c LEFT JOIN public.booking_routes br ON br.id=c.route_id WHERE (_route IS NULL OR c.route_id=_route) AND (NOT _unassigned OR c.route_id IS NULL) AND (_kind IS NULL OR c.kind=_kind);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_filtered_collections(date,date,uuid,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_filtered_collections(date,date,uuid,text,text,boolean) TO authenticated;

CREATE FUNCTION public.admin_sales_by_route_category(_from date,_to date,_route uuid DEFAULT NULL,_unassigned boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE sales jsonb;
BEGIN
 IF NOT (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'ADMIN은 최고관리자만 열람할 수 있습니다.' USING ERRCODE='42501'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to<_from THEN RAISE EXCEPTION '조회 기간을 확인해 주세요.'; END IF;
 WITH entries AS (
  SELECT cp.customer_id,coalesce(cc.name,'미지정') category,coalesce((v->>'card')::numeric,0)+coalesce((v->>'bank')::numeric,0)+coalesce((v->>'krw')::numeric,0) collected,coalesce((v->>'jpy')::numeric,0) jpy,coalesce((v->>'usd')::numeric,0) usd,coalesce((v->>'cny')::numeric,0) cny
  FROM public.customer_payments cp LEFT JOIN public.customers c ON c.id=cp.customer_id LEFT JOIN public.customer_categories cc ON cc.id=c.category_id LEFT JOIN public.reservations r ON r.id=cp.reservation_id CROSS JOIN LATERAL jsonb_array_elements(cp.rows) v WHERE cp.paid_on BETWEEN _from AND _to AND (_route IS NULL OR r.booking_route_id=_route) AND (NOT _unassigned OR r.booking_route_id IS NULL)
  UNION ALL
  SELECT ws.customer_id,coalesce(cc.name,'미지정'),round(ws.quantity*ws.unit_price,2),0,0,0 FROM public.work_product_sales ws LEFT JOIN public.customers c ON c.id=ws.customer_id LEFT JOIN public.customer_categories cc ON cc.id=c.category_id WHERE ws.paid_on BETWEEN _from AND _to AND _route IS NULL
 ), grouped AS (SELECT category,sum(collected) collected,sum(jpy) jpy,sum(usd) usd,sum(cny) cny,count(DISTINCT customer_id) customers FROM entries GROUP BY category)
 SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY category),'[]') INTO sales FROM grouped g;
 RETURN sales;
END $$;
REVOKE ALL ON FUNCTION public.admin_sales_by_route_category(date,date,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_sales_by_route_category(date,date,uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_sales_entries(
 _from date,_to date,_scope text,_kind text DEFAULT NULL,_route uuid DEFAULT NULL,
 _unassigned boolean DEFAULT false,_category text DEFAULT NULL,_offset integer DEFAULT 0
)
RETURNS TABLE(entry_id uuid,reservation_id uuid,paid_on date,customer_name text,category text,route_name text,
 service_content text,care_content text,payment_rows jsonb,payment_memo text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')) THEN
  RAISE EXCEPTION '매출 상세내역은 대표관리자만 열람할 수 있습니다.' USING ERRCODE='42501';
 END IF;
 IF _from IS NULL OR _to IS NULL OR _to<_from OR _scope IS NULL OR _scope NOT IN ('category','settlement')
 OR (_kind IS NOT NULL AND _kind NOT IN ('service','care')) THEN
  RAISE EXCEPTION '조회 조건을 확인해 주세요.';
 END IF;
 RETURN QUERY WITH entries AS (
  SELECT cp.reservation_id AS entry_id,cp.reservation_id,cp.paid_on,
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
   WHERE (_scope='category' OR v->>'kind' IN ('service','care'))
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
  SELECT w.id,NULL::uuid,w.paid_on,coalesce(c.name,'고객 미지정'),coalesce(cc.name,'미지정'),'미지정',
   '','',jsonb_build_array(jsonb_build_object('kind','product','description',w.product_name||' × '||w.quantity,
    w.method,round(w.quantity*w.unit_price,2))),coalesce(w.memo,'')
  FROM public.work_product_sales w
  LEFT JOIN public.customers c ON c.id=w.customer_id
  LEFT JOIN public.customer_categories cc ON cc.id=c.category_id
  WHERE _scope='category' AND _route IS NULL AND w.paid_on BETWEEN _from AND _to AND (_category IS NULL OR coalesce(cc.name,'미지정')=_category)
 )
 SELECT e.* FROM entries e ORDER BY e.paid_on DESC,e.entry_id,e.reservation_id NULLS LAST
 LIMIT 30 OFFSET greatest(coalesce(_offset,0),0);
END $$;

CREATE FUNCTION public.admin_filtered_booking_activity(_from date,_to date,_kind text DEFAULT NULL,_route uuid DEFAULT NULL,_unassigned boolean DEFAULT false,_offset integer DEFAULT 0,_staff uuid DEFAULT NULL,_customer text DEFAULT '',_category text DEFAULT NULL)
RETURNS TABLE(reservation_id uuid,start_at timestamptz,customer_name text,staff_name text,route_name text,service_content text,care_content text,paid_on date,payment_rows jsonb,payment_memo text,status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'ADMIN 내역은 최고관리자만 열람할 수 있습니다.' USING ERRCODE='42501'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to<_from OR (_kind IS NOT NULL AND _kind NOT IN ('service','care')) THEN RAISE EXCEPTION '조회 기간을 확인해 주세요.'; END IF;
 RETURN QUERY SELECT r.id,r.start_at,r.customer_name,coalesce(p.full_name,'미지정'),coalesce(br.name,'미지정'),
 coalesce(nullif((SELECT v->>'description' FROM jsonb_array_elements(coalesce(cp.rows,'[]')) v WHERE v->>'kind'='service'),''),nullif(r.service_detail,''),r.service),
 coalesce((SELECT v->>'description' FROM jsonb_array_elements(coalesce(cp.rows,'[]')) v WHERE v->>'kind'='care'),''),cp.paid_on,
 CASE WHEN _kind IS NULL THEN coalesce(cp.rows,'[]') ELSE
  coalesce((SELECT jsonb_agg(v) FROM jsonb_array_elements(coalesce(cp.rows,'[]')) v WHERE v->>'kind'=_kind),'[]')
 END,
 CASE WHEN _kind IS NULL THEN coalesce(cp.memo,'') ELSE '' END,r.status::text
 FROM public.reservations r LEFT JOIN public.profiles p ON p.id=r.staff_id LEFT JOIN public.booking_routes br ON br.id=r.booking_route_id LEFT JOIN public.customer_payments cp ON cp.reservation_id=r.id
 LEFT JOIN public.customers c ON c.id=coalesce(cp.customer_id,r.customer_id) LEFT JOIN public.customer_categories cc ON cc.id=c.category_id
 WHERE r.start_at>=(_from::timestamp AT TIME ZONE 'Asia/Seoul') AND r.start_at<((_to+1)::timestamp AT TIME ZONE 'Asia/Seoul')
 AND (_route IS NULL OR r.booking_route_id=_route) AND (NOT _unassigned OR r.booking_route_id IS NULL)
 AND (_category IS NULL OR coalesce(cc.name,'미지정')=_category)
 AND (_staff IS NULL OR r.staff_id=_staff) AND (coalesce(_customer,'')='' OR strpos(lower(r.customer_name),lower(_customer))>0)
 AND (_kind IS DISTINCT FROM 'care' OR EXISTS (
  SELECT 1 FROM jsonb_array_elements(coalesce(cp.rows,'[]')) v
  WHERE v->>'kind'='care' AND (
   btrim(coalesce(v->>'description',''))<>'' OR EXISTS (
    SELECT 1 FROM jsonb_each(v) AS amount(key,value)
    WHERE key IN ('cost','card','bank','krw','jpy','usd','cny') AND CASE WHEN jsonb_typeof(value)='number' THEN value::numeric<>0 ELSE false END
   )
  )
 ))
 ORDER BY r.start_at DESC,r.id LIMIT 30 OFFSET greatest(coalesce(_offset,0),0);
END $$;
REVOKE ALL ON FUNCTION public.admin_filtered_booking_activity(date,date,text,uuid,boolean,integer,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_filtered_booking_activity(date,date,text,uuid,boolean,integer,uuid,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
