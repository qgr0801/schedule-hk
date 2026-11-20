ALTER TABLE public.monthly_work_reports
 ADD COLUMN report_date date CHECK (date_trunc('month',report_date)::date = report_month),
 DROP CONSTRAINT monthly_work_reports_employee_id_report_month_key;

CREATE UNIQUE INDEX monthly_work_reports_legacy_employee_month
 ON public.monthly_work_reports(employee_id,report_month) WHERE report_date IS NULL;
CREATE UNIQUE INDEX monthly_work_reports_employee_date
 ON public.monthly_work_reports(employee_id,report_date) WHERE report_date IS NOT NULL;

CREATE FUNCTION public.save_work_report_by_date(_id uuid,_event uuid,_employee uuid,_month date,_date date,_shot_count integer,_influencer_count integer,_upload_count integer,_memo text,_links jsonb,_feed_count integer,_customer_content text,_counts jsonb,_version integer DEFAULT 0)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.monthly_work_reports;prior public.monthly_work_report_history;payload jsonb;v jsonb;key text;canonical_counts jsonb:='{}';
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '업무 기록 작성 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _id IS NULL OR _event IS NULL OR _employee IS NULL OR _month IS NULL OR extract(day FROM _month)<>1 OR (_date IS NOT NULL AND date_trunc('month',_date)::date <> _month) OR _shot_count IS NULL OR _shot_count NOT BETWEEN 0 AND 100000 OR _influencer_count IS NULL OR _influencer_count NOT BETWEEN 0 AND 100000 OR _upload_count IS NULL OR _upload_count NOT BETWEEN 0 AND 100000 OR _memo IS NULL OR char_length(_memo)>5000 OR _feed_count IS NULL OR _feed_count NOT BETWEEN 0 AND 100000 OR _customer_content IS NULL OR char_length(_customer_content)>5000 OR _version IS NULL OR _version<0 THEN RAISE EXCEPTION '직원·작성일·건수·메모를 확인해 주세요.'; END IF;
 IF jsonb_typeof(_counts) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION '업무 건수를 확인해 주세요.'; END IF;
 FOREACH key IN ARRAY ARRAY['youtube','dm','dmr','dm_confirmed','dm_visited'] LOOP
  IF jsonb_typeof(_counts->key) IS DISTINCT FROM 'number' OR (_counts->>key)::numeric NOT BETWEEN 0 AND 100000 OR (_counts->>key)::numeric<>trunc((_counts->>key)::numeric) THEN RAISE EXCEPTION '업무 건수는 0 이상 100000 이하의 정수로 입력해 주세요.'; END IF;
  canonical_counts:=canonical_counts||jsonb_build_object(key,_counts->key);
 END LOOP;
 FOREACH key IN ARRAY ARRAY['extra_1','extra_2','extra_3','extra_4','extra_5','extra_6'] LOOP
  IF NOT (_counts ? key) THEN CONTINUE; END IF;
  IF jsonb_typeof(_counts->key) IS DISTINCT FROM 'number' OR (_counts->>key)::numeric NOT BETWEEN 0 AND 100000 OR (_counts->>key)::numeric<>trunc((_counts->>key)::numeric) THEN
   RAISE EXCEPTION '업무 건수는 0 이상 100000 이하의 정수로 입력해 주세요.';
  END IF;
  canonical_counts:=canonical_counts||jsonb_build_object(key,_counts->key);
 END LOOP;
 IF jsonb_typeof(_links) IS DISTINCT FROM 'array' OR jsonb_array_length(_links)>50 THEN RAISE EXCEPTION '영상 링크는 최대 50개까지 등록할 수 있습니다.'; END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(_links) LOOP
  IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR jsonb_typeof(v->'name') IS DISTINCT FROM 'string' OR char_length(v->>'name')>100 OR jsonb_typeof(v->'url') IS DISTINCT FROM 'string' OR char_length(v->>'url')>2048 OR (v->>'url') !~ '^https?://[^[:space:][:cntrl:]]+$' THEN RAISE EXCEPTION '영상 설명과 http 또는 https 영상 링크를 확인해 주세요.'; END IF;
 END LOOP;
 payload:=jsonb_build_object('employee',_employee,'month',_month,'date',_date,'shot',_shot_count,'influencer',_influencer_count,'upload',_upload_count,'memo',_memo,'links',_links,'feed',_feed_count,'customer_content',_customer_content,'counts',canonical_counts,'version',_version);
 PERFORM pg_advisory_xact_lock(hashtextextended(_event::text,8));
 SELECT * INTO prior FROM public.monthly_work_report_history WHERE id=_event;
 IF FOUND THEN
  IF prior.report_id=_id AND prior.changed_by=auth.uid() AND prior.request=payload THEN RETURN _id; END IF;
  RAISE EXCEPTION '이미 처리된 요청입니다. 내역을 새로 조회해 주세요.';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_id::text,9));
 SELECT * INTO old FROM public.monthly_work_reports WHERE id=_id FOR UPDATE;
 IF coalesce(old.version,0)<>_version THEN RAISE EXCEPTION '다른 직원이 수정했습니다. 내역을 새로 조회한 뒤 수정해 주세요.'; END IF;
 IF old.id IS NULL OR old.employee_id<>_employee THEN
  IF NOT EXISTS(SELECT 1 FROM public.employees WHERE id=_employee AND is_active) THEN RAISE EXCEPTION '사용 중인 직원을 선택해 주세요.'; END IF;
 END IF;
 IF _date IS NULL AND (old.id IS NULL OR old.report_date IS NOT NULL) THEN RAISE EXCEPTION '작성일을 선택해 주세요.'; END IF;
 IF EXISTS(SELECT 1 FROM public.monthly_work_reports WHERE employee_id=_employee AND report_month=_month AND report_date IS NOT DISTINCT FROM _date AND id<>_id) THEN RAISE EXCEPTION '해당 직원의 기록이 이미 있습니다. 기존 내역에서 수정해 주세요.'; END IF;
 INSERT INTO public.monthly_work_reports(id,employee_id,report_month,report_date,shot_edit_count,influencer_upload_count,upload_count,memo,links,feed_upload_count,customer_content,work_counts)
 VALUES(_id,_employee,_month,_date,_shot_count,_influencer_count,_upload_count,_memo,_links,_feed_count,_customer_content,canonical_counts)
 ON CONFLICT(id) DO UPDATE SET employee_id=excluded.employee_id,report_month=excluded.report_month,report_date=excluded.report_date,shot_edit_count=excluded.shot_edit_count,influencer_upload_count=excluded.influencer_upload_count,upload_count=excluded.upload_count,memo=excluded.memo,links=excluded.links,feed_upload_count=excluded.feed_upload_count,customer_content=excluded.customer_content,work_counts=excluded.work_counts,version=monthly_work_reports.version+1,updated_by=auth.uid(),updated_at=now();
 INSERT INTO public.monthly_work_report_history(id,report_id,request,snapshot) SELECT _event,_id,payload,to_jsonb(r) FROM public.monthly_work_reports r WHERE r.id=_id;
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.save_work_report_by_date(uuid,uuid,uuid,date,date,integer,integer,integer,text,jsonb,integer,text,jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_work_report_by_date(uuid,uuid,uuid,date,date,integer,integer,integer,text,jsonb,integer,text,jsonb,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
CREATE OR REPLACE FUNCTION public.admin_business_overview(_from date,_to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
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

ALTER TABLE public.freelancer_attendance
 ADD COLUMN work_type text CHECK (work_type IN ('internal','external'));

CREATE TABLE public.work_metric_labels (
 id text PRIMARY KEY CHECK (id IN ('shot','upload','feed','influencer','youtube','dm','dmr','dm_confirmed','dm_visited','extra_1','extra_2','extra_3','extra_4','extra_5','extra_6')),
 label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 40)
);
ALTER TABLE public.work_metric_labels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_metric_labels FROM PUBLIC,anon,authenticated;
GRANT SELECT, INSERT, UPDATE ON public.work_metric_labels TO authenticated;
CREATE POLICY "staff read work metric labels" ON public.work_metric_labels
 FOR SELECT TO authenticated USING ((SELECT public.can_manage_sales()));
CREATE POLICY "admin add work metric labels" ON public.work_metric_labels
 FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')));
CREATE POLICY "admin update work metric labels" ON public.work_metric_labels
 FOR UPDATE TO authenticated USING ((SELECT public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')))
 WITH CHECK ((SELECT public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')));
NOTIFY pgrst,'reload schema';
