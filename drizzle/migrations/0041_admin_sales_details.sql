CREATE FUNCTION public.booking_activity_report_by_kind(_from date,_to date,_kind text DEFAULT NULL,_route uuid DEFAULT NULL,_unassigned boolean DEFAULT false,_offset integer DEFAULT 0,_staff uuid DEFAULT NULL,_customer text DEFAULT '')
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
 WHERE r.start_at>=(_from::timestamp AT TIME ZONE 'Asia/Seoul') AND r.start_at<((_to+1)::timestamp AT TIME ZONE 'Asia/Seoul')
 AND (_route IS NULL OR r.booking_route_id=_route) AND (NOT _unassigned OR r.booking_route_id IS NULL)
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
REVOKE ALL ON FUNCTION public.booking_activity_report_by_kind(date,date,text,uuid,boolean,integer,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.booking_activity_report_by_kind(date,date,text,uuid,boolean,integer,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
