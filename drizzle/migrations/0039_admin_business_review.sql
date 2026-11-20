CREATE TABLE public.admin_route_settlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period_from date NOT NULL,period_to date NOT NULL CHECK(period_to>=period_from),
 route_id uuid REFERENCES public.booking_routes(id),route_key text GENERATED ALWAYS AS (coalesce(route_id::text,'unassigned')) STORED,
 kind text NOT NULL CHECK(kind IN ('service','care')), amount numeric(16,2) NOT NULL DEFAULT 0 CHECK(amount BETWEEN 0 AND 999999999999),
 completed_amount numeric(16,2) NOT NULL DEFAULT 0 CHECK(completed_amount BETWEEN 0 AND 999999999999),
 memo text NOT NULL DEFAULT '' CHECK(char_length(memo)<=1000),version integer NOT NULL DEFAULT 1,
 updated_by uuid NOT NULL DEFAULT auth.uid(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(period_from,period_to,route_key,kind)
);
CREATE INDEX admin_route_settlements_route ON public.admin_route_settlements(route_id);
CREATE TABLE public.admin_settlement_history(id uuid PRIMARY KEY,settlement_id uuid NOT NULL REFERENCES public.admin_route_settlements(id),request jsonb NOT NULL,snapshot jsonb NOT NULL,changed_by uuid NOT NULL DEFAULT auth.uid(),changed_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX admin_settlement_history_record ON public.admin_settlement_history(settlement_id,changed_at);
REVOKE ALL ON public.admin_route_settlements,public.admin_settlement_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.admin_route_settlements,public.admin_settlement_history TO authenticated;
GRANT ALL ON public.admin_route_settlements,public.admin_settlement_history TO service_role;
ALTER TABLE public.admin_route_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settlement_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read settlements" ON public.admin_route_settlements FOR SELECT TO authenticated USING((SELECT public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')));
CREATE POLICY "admin read settlement history" ON public.admin_settlement_history FOR SELECT TO authenticated USING((SELECT public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')));
CREATE FUNCTION public.save_admin_settlement(_id uuid,_event uuid,_from date,_to date,_route uuid,_kind text,_amount numeric,_completed numeric,_memo text,_version integer DEFAULT 0) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.admin_route_settlements; prior public.admin_settlement_history;payload jsonb;
BEGIN
 IF NOT (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION '정산 작성은 최고관리자만 가능합니다.' USING ERRCODE='42501'; END IF;
 IF _id IS NULL OR _event IS NULL OR _from IS NULL OR _to IS NULL OR _to<_from OR _kind IS NULL OR _kind NOT IN ('service','care') OR _amount IS NULL OR _amount NOT BETWEEN 0 AND 999999999999 OR _amount<>round(_amount,2) OR _completed IS NULL OR _completed NOT BETWEEN 0 AND 999999999999 OR _completed<>round(_completed,2) OR _memo IS NULL OR char_length(_memo)>1000 OR _version IS NULL OR _version<0 THEN RAISE EXCEPTION '기간·정산금액·메모를 확인해 주세요.'; END IF;
 payload:=jsonb_build_object('from',_from,'to',_to,'route',_route,'kind',_kind,'amount',_amount,'completed',_completed,'memo',_memo,'version',_version);
 PERFORM pg_advisory_xact_lock(hashtextextended(_event::text,10));
 SELECT * INTO prior FROM public.admin_settlement_history WHERE id=_event;
 IF FOUND THEN IF prior.settlement_id=_id AND prior.changed_by=auth.uid() AND prior.request=payload THEN RETURN _id; END IF;RAISE EXCEPTION '이미 처리한 요청입니다. 다시 조회해 주세요.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_id::text,11));
 SELECT * INTO old FROM public.admin_route_settlements WHERE id=_id FOR UPDATE;
 IF coalesce(old.version,0)<>_version THEN RAISE EXCEPTION '다른 화면에서 수정했습니다. 다시 조회해 주세요.'; END IF;
 IF old.id IS NOT NULL AND (old.period_from<>_from OR old.period_to<>_to OR old.route_id IS DISTINCT FROM _route OR old.kind<>_kind) THEN RAISE EXCEPTION '정산 기록의 기간과 경로는 변경할 수 없습니다.'; END IF;
 INSERT INTO public.admin_route_settlements(id,period_from,period_to,route_id,kind,amount,completed_amount,memo)
 VALUES(_id,_from,_to,_route,_kind,_amount,_completed,_memo)
 ON CONFLICT(id) DO UPDATE SET amount=excluded.amount,completed_amount=excluded.completed_amount,memo=excluded.memo,version=admin_route_settlements.version+1,updated_by=auth.uid(),updated_at=now();
 INSERT INTO public.admin_settlement_history(id,settlement_id,request,snapshot) SELECT _event,_id,payload,to_jsonb(n) FROM public.admin_route_settlements n WHERE id=_id;
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.save_admin_settlement(uuid,uuid,date,date,uuid,text,numeric,numeric,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_admin_settlement(uuid,uuid,date,date,uuid,text,numeric,numeric,text,integer) TO authenticated;
CREATE FUNCTION public.admin_business_overview(_from date,_to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE sales jsonb;times jsonb;work jsonb;
BEGIN
 IF NOT (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'ADMIN은 최고관리자만 열람할 수 있습니다.' USING ERRCODE='42501'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to<_from THEN RAISE EXCEPTION '조회 기간을 확인해 주세요.'; END IF;
 WITH entries AS (
  SELECT cp.customer_id,coalesce(cc.name,'미지정') category,coalesce((v->>'card')::numeric,0)+coalesce((v->>'bank')::numeric,0)+coalesce((v->>'krw')::numeric,0) collected,coalesce((v->>'jpy')::numeric,0) jpy,coalesce((v->>'usd')::numeric,0) usd,coalesce((v->>'cny')::numeric,0) cny
  FROM public.customer_payments cp LEFT JOIN public.customers c ON c.id=cp.customer_id LEFT JOIN public.customer_categories cc ON cc.id=c.category_id CROSS JOIN LATERAL jsonb_array_elements(cp.rows) v WHERE cp.paid_on BETWEEN _from AND _to
  UNION ALL
  SELECT ws.customer_id,coalesce(cc.name,'미지정'),round(ws.quantity*ws.unit_price,2),0,0,0 FROM public.work_product_sales ws LEFT JOIN public.customers c ON c.id=ws.customer_id LEFT JOIN public.customer_categories cc ON cc.id=c.category_id WHERE ws.paid_on BETWEEN _from AND _to
 ), grouped AS (SELECT category,sum(collected) collected,sum(jpy) jpy,sum(usd) usd,sum(cny) cny,count(DISTINCT customer_id) customers FROM entries GROUP BY category)
 SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY category),'[]') INTO sales FROM grouped g;
 WITH grouped AS (SELECT a.employee_id,e.name,sum(extract(epoch FROM least(a.end_at,((_to+1)::timestamp AT TIME ZONE 'Asia/Seoul'))-greatest(a.start_at,(_from::timestamp AT TIME ZONE 'Asia/Seoul')))/60) minutes FROM public.freelancer_attendance a JOIN public.employees e ON e.id=a.employee_id WHERE a.start_at<((_to+1)::timestamp AT TIME ZONE 'Asia/Seoul') AND a.end_at>(_from::timestamp AT TIME ZONE 'Asia/Seoul') GROUP BY a.employee_id,e.name)
 SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY name),'[]') INTO times FROM grouped g;
 WITH grouped AS (SELECT w.employee_id,e.name,count(*) records,sum(w.shot_edit_count) shot,sum(w.upload_count) video,sum(w.feed_upload_count) feed,sum(w.influencer_upload_count) sponsored,
 sum((w.work_counts->>'youtube')::numeric) youtube,sum((w.work_counts->>'dm')::numeric) dm,sum((w.work_counts->>'dmr')::numeric) dmr,sum((w.work_counts->>'dm_confirmed')::numeric) dm_confirmed,sum((w.work_counts->>'dm_visited')::numeric) dm_visited
 FROM public.monthly_work_reports w JOIN public.employees e ON e.id=w.employee_id WHERE w.report_month BETWEEN date_trunc('month',_from)::date AND date_trunc('month',_to)::date GROUP BY w.employee_id,e.name)
 SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY name),'[]') INTO work FROM grouped g;
 RETURN jsonb_build_object('sales',sales,'times',times,'work',work);
END $$;
REVOKE ALL ON FUNCTION public.admin_business_overview(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_business_overview(date,date) TO authenticated;
CREATE FUNCTION public.admin_route_collection_report(_from date,_to date,_route uuid DEFAULT NULL,_kind text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'ADMIN은 최고관리자만 열람할 수 있습니다.' USING ERRCODE='42501'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to<_from OR (_kind IS NOT NULL AND _kind NOT IN ('service','care')) THEN RAISE EXCEPTION '조회 기간과 구분을 확인해 주세요.'; END IF;
 WITH receipts AS (
 SELECT r.booking_route_id route_id,v->>'kind' kind,left(string_agg(DISTINCT coalesce(nullif(v->>'description',''),CASE WHEN v->>'kind'='service' THEN coalesce(nullif(r.service_detail,''),r.service) END),' / '),2000) content,
 sum(coalesce((v->>'card')::numeric,0)+coalesce((v->>'bank')::numeric,0)+coalesce((v->>'krw')::numeric,0)) collected,
 sum(coalesce((v->>'jpy')::numeric,0)) jpy,sum(coalesce((v->>'usd')::numeric,0)) usd,sum(coalesce((v->>'cny')::numeric,0)) cny
 FROM public.customer_payments cp JOIN public.reservations r ON r.id=cp.reservation_id CROSS JOIN LATERAL jsonb_array_elements(cp.rows) v
 WHERE cp.paid_on BETWEEN _from AND _to AND v->>'kind' IN ('service','care') AND (nullif(v->>'description','') IS NOT NULL OR (coalesce((v->>'cost')::numeric,0)+coalesce((v->>'card')::numeric,0)+coalesce((v->>'bank')::numeric,0)+coalesce((v->>'krw')::numeric,0)+coalesce((v->>'jpy')::numeric,0)+coalesce((v->>'usd')::numeric,0)+coalesce((v->>'cny')::numeric,0))>0)
 GROUP BY r.booking_route_id,v->>'kind'
 ),notes AS (SELECT * FROM public.admin_route_settlements WHERE period_from=_from AND period_to=_to),combined AS (
 SELECT coalesce(p.route_id,n.route_id) route_id,coalesce(p.kind,n.kind) kind,p.content,coalesce(p.collected,0) collected,coalesce(p.jpy,0) jpy,coalesce(p.usd,0) usd,coalesce(p.cny,0) cny,n.id record_id,coalesce(n.version,0) version,coalesce(n.amount,0) amount,coalesce(n.completed_amount,0) completed,coalesce(n.memo,'') memo
 FROM receipts p FULL JOIN notes n ON coalesce(p.route_id::text,'unassigned')=n.route_key AND p.kind=n.kind
 ) SELECT coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('route_name',coalesce(br.name,'미지정')) ORDER BY coalesce(br.name,'미지정'),c.kind),'[]') INTO result FROM combined c LEFT JOIN public.booking_routes br ON br.id=c.route_id WHERE (_route IS NULL OR c.route_id=_route) AND (_kind IS NULL OR c.kind=_kind);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_route_collection_report(date,date,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_route_collection_report(date,date,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
