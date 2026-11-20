ALTER TABLE public.monthly_work_reports ADD COLUMN work_checks jsonb NOT NULL DEFAULT '{"youtube":false,"dm":false,"dmr":false,"dm_confirmed":false,"dm_visited":false}' CHECK(jsonb_typeof(work_checks)='object');
CREATE FUNCTION public.save_monthly_work_report_v3(_id uuid,_event uuid,_employee uuid,_month date,_shot_count integer,_influencer_count integer,_upload_count integer,_memo text,_links jsonb,_feed_count integer,_customer_content text,_checks jsonb,_version integer DEFAULT 0)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.monthly_work_reports;prior public.monthly_work_report_history;payload jsonb;v jsonb;key text;canonical_checks jsonb:='{}';
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '업무 기록 작성 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _id IS NULL OR _event IS NULL OR _employee IS NULL OR _month IS NULL OR extract(day FROM _month)<>1 OR _shot_count IS NULL OR _shot_count NOT BETWEEN 0 AND 100000 OR _influencer_count IS NULL OR _influencer_count NOT BETWEEN 0 AND 100000 OR _upload_count IS NULL OR _upload_count NOT BETWEEN 0 AND 100000 OR _memo IS NULL OR char_length(_memo)>5000 OR _feed_count IS NULL OR _feed_count NOT BETWEEN 0 AND 100000 OR _customer_content IS NULL OR char_length(_customer_content)>5000 OR _version IS NULL OR _version<0 THEN RAISE EXCEPTION '직원·작성 월·건수·메모를 확인해 주세요.'; END IF;
 IF jsonb_typeof(_checks) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION '체크항목을 확인해 주세요.'; END IF;
 FOREACH key IN ARRAY ARRAY['youtube','dm','dmr','dm_confirmed','dm_visited'] LOOP
  IF jsonb_typeof(_checks->key) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION '체크항목은 체크 또는 미체크로 입력해 주세요.'; END IF;
  canonical_checks:=canonical_checks||jsonb_build_object(key,_checks->key);
 END LOOP;
 IF jsonb_typeof(_links) IS DISTINCT FROM 'array' OR jsonb_array_length(_links)>50 THEN RAISE EXCEPTION '영상 링크는 최대 50개까지 등록할 수 있습니다.'; END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(_links) LOOP
  IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR jsonb_typeof(v->'name') IS DISTINCT FROM 'string' OR char_length(v->>'name')>100 OR jsonb_typeof(v->'url') IS DISTINCT FROM 'string' OR char_length(v->>'url')>2048 OR (v->>'url') !~ '^https?://[^[:space:][:cntrl:]]+$' THEN RAISE EXCEPTION '영상 설명과 http 또는 https 영상 링크를 확인해 주세요.'; END IF;
 END LOOP;
 payload:=jsonb_build_object('employee',_employee,'month',_month,'shot',_shot_count,'influencer',_influencer_count,'upload',_upload_count,'memo',_memo,'links',_links,'feed',_feed_count,'customer_content',_customer_content,'checks',canonical_checks,'version',_version);
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
 IF EXISTS(SELECT 1 FROM public.monthly_work_reports WHERE employee_id=_employee AND report_month=_month AND id<>_id) THEN RAISE EXCEPTION '해당 직원의 월별 기록이 있습니다. 기존 내역에서 수정해 주세요.'; END IF;
 INSERT INTO public.monthly_work_reports(id,employee_id,report_month,shot_edit_count,influencer_upload_count,upload_count,memo,links,feed_upload_count,customer_content,work_checks)
 VALUES(_id,_employee,_month,_shot_count,_influencer_count,_upload_count,_memo,_links,_feed_count,_customer_content,canonical_checks)
 ON CONFLICT(id) DO UPDATE SET employee_id=excluded.employee_id,report_month=excluded.report_month,shot_edit_count=excluded.shot_edit_count,influencer_upload_count=excluded.influencer_upload_count,upload_count=excluded.upload_count,memo=excluded.memo,links=excluded.links,feed_upload_count=excluded.feed_upload_count,customer_content=excluded.customer_content,work_checks=excluded.work_checks,version=monthly_work_reports.version+1,updated_by=auth.uid(),updated_at=now();
 INSERT INTO public.monthly_work_report_history(id,report_id,request,snapshot) SELECT _event,_id,payload,to_jsonb(r) FROM public.monthly_work_reports r WHERE r.id=_id;
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.save_monthly_work_report_v3(uuid,uuid,uuid,date,integer,integer,integer,text,jsonb,integer,text,jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_monthly_work_report_v3(uuid,uuid,uuid,date,integer,integer,integer,text,jsonb,integer,text,jsonb,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
