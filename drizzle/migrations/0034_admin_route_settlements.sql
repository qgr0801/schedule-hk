CREATE OR REPLACE FUNCTION public.booking_activity_report(_from date,_to date,_route uuid DEFAULT NULL,_staff uuid DEFAULT NULL,_customer text DEFAULT '',_offset integer DEFAULT 0)
RETURNS TABLE(reservation_id uuid,start_at timestamptz,customer_name text,staff_name text,route_name text,service_content text,care_content text,paid_on date,payment_rows jsonb,payment_memo text,status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'ADMIN 내역은 최고관리자만 열람할 수 있습니다.' USING ERRCODE='42501'; END IF;
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

CREATE FUNCTION public.route_settlement_summary(_from date,_to date,_route uuid DEFAULT NULL,_staff uuid DEFAULT NULL,_customer text DEFAULT '')
RETURNS TABLE(route_id uuid,route_name text,kind text,settlement_count bigint,customer_count bigint,cost numeric,card numeric,bank numeric,krw numeric,jpy numeric,usd numeric,cny numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'ADMIN 정산은 최고관리자만 열람할 수 있습니다.' USING ERRCODE='42501'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to<_from THEN RAISE EXCEPTION '조회 기간을 확인해 주세요.'; END IF;
 RETURN QUERY SELECT br.id,coalesce(br.name,'미지정'),v->>'kind',count(DISTINCT cp.reservation_id),count(DISTINCT cp.customer_id),
 sum(coalesce((v->>'cost')::numeric,0)),sum(coalesce((v->>'card')::numeric,0)),sum(coalesce((v->>'bank')::numeric,0)),sum(coalesce((v->>'krw')::numeric,0)),sum(coalesce((v->>'jpy')::numeric,0)),sum(coalesce((v->>'usd')::numeric,0)),sum(coalesce((v->>'cny')::numeric,0))
 FROM public.customer_payments cp JOIN public.reservations r ON r.id=cp.reservation_id LEFT JOIN public.booking_routes br ON br.id=r.booking_route_id CROSS JOIN LATERAL jsonb_array_elements(cp.rows) v
 WHERE r.start_at>=(_from::timestamp AT TIME ZONE 'Asia/Seoul') AND r.start_at<((_to+1)::timestamp AT TIME ZONE 'Asia/Seoul')
 AND (_route IS NULL OR r.booking_route_id=_route) AND (_staff IS NULL OR r.staff_id=_staff) AND (coalesce(_customer,'')='' OR strpos(lower(r.customer_name),lower(_customer))>0)
 AND v->>'kind' IN ('service','care') AND (coalesce(v->>'description','')<>'' OR EXISTS(SELECT 1 FROM jsonb_each(v) e WHERE e.key IN ('cost','card','bank','krw','jpy','usd','cny') AND (e.value::text)::numeric>0))
 GROUP BY br.id,br.name,v->>'kind' ORDER BY coalesce(br.name,'미지정'),v->>'kind';
END $$;
REVOKE ALL ON FUNCTION public.route_settlement_summary(date,date,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.route_settlement_summary(date,date,uuid,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
