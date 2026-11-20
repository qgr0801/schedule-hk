CREATE FUNCTION public.admin_sales_entries(
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
  WHERE _scope='category' AND w.paid_on BETWEEN _from AND _to AND (_category IS NULL OR coalesce(cc.name,'미지정')=_category)
 )
 SELECT e.* FROM entries e ORDER BY e.paid_on DESC,e.entry_id,e.reservation_id NULLS LAST
 LIMIT 30 OFFSET greatest(coalesce(_offset,0),0);
END $$;
REVOKE ALL ON FUNCTION public.admin_sales_entries(date,date,text,text,uuid,boolean,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_sales_entries(date,date,text,text,uuid,boolean,text,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
