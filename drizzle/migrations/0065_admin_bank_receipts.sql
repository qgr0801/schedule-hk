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
 sum(coalesce((v->>'bank')::numeric,0)) bank,
 sum(coalesce((v->>'bank_jpy')::numeric,0)) bank_jpy,
 sum(coalesce((v->>'cost')::numeric,0)) cost,
 sum(coalesce((v->>'jpy')::numeric,0)+coalesce((v->>'bank_jpy')::numeric,0)) jpy,sum(coalesce((v->>'usd')::numeric,0)) usd,sum(coalesce((v->>'cny')::numeric,0)) cny
 FROM public.customer_payments cp JOIN public.reservations r ON r.id=cp.reservation_id LEFT JOIN public.customers c ON c.id=cp.customer_id LEFT JOIN public.customer_categories cc ON cc.id=c.category_id CROSS JOIN LATERAL jsonb_array_elements(cp.rows) v
 WHERE cp.paid_on BETWEEN _from AND _to AND (_category IS NULL OR coalesce(cc.name,'미지정')=_category) AND v->>'kind' IN ('service','care','art') AND (nullif(v->>'description','') IS NOT NULL OR (coalesce((v->>'cost')::numeric,0)+coalesce((v->>'card')::numeric,0)+coalesce((v->>'bank')::numeric,0)+coalesce((v->>'krw')::numeric,0)+coalesce((v->>'bank_jpy')::numeric,0)+coalesce((v->>'jpy')::numeric,0)+coalesce((v->>'usd')::numeric,0)+coalesce((v->>'cny')::numeric,0))>0)
 GROUP BY r.booking_route_id,v->>'kind'
 ),notes AS (SELECT * FROM public.admin_route_settlements WHERE _category IS NULL AND period_from=_from AND period_to=_to),combined AS (
 SELECT coalesce(p.route_id,n.route_id) route_id,coalesce(p.kind,n.kind) kind,p.content,coalesce(p.collected,0) collected,coalesce(p.cost,0) cost,coalesce(p.bank,0) bank,coalesce(p.bank_jpy,0) bank_jpy,coalesce(p.jpy,0) jpy,coalesce(p.usd,0) usd,coalesce(p.cny,0) cny,n.id record_id,coalesce(n.version,0) version,coalesce(n.amount,0) amount,coalesce(n.completed_amount,0) completed,coalesce(n.memo,'') memo
 FROM receipts p FULL JOIN notes n ON coalesce(p.route_id::text,'unassigned')=n.route_key AND p.kind=n.kind
 ) SELECT coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('route_name',coalesce(br.name,'미지정')) ORDER BY coalesce(br.name,'미지정'),c.kind),'[]') INTO result FROM combined c LEFT JOIN public.booking_routes br ON br.id=c.route_id WHERE (_route IS NULL OR c.route_id=_route) AND (NOT _unassigned OR c.route_id IS NULL) AND (_kind IS NULL OR c.kind=_kind);
 RETURN result;
END $function$;

