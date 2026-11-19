CREATE TABLE public.freelancer_attendance (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 employee_id uuid NOT NULL REFERENCES public.employees(id),
 start_at timestamptz NOT NULL,
 end_at timestamptz NOT NULL,
 memo text NOT NULL DEFAULT '' CHECK(char_length(memo)<=500),
 created_by uuid NOT NULL DEFAULT auth.uid(),
 CHECK(end_at>start_at),
 CHECK(date_trunc('minute',start_at)=start_at AND date_trunc('minute',end_at)=end_at)
);
CREATE INDEX freelancer_attendance_period ON public.freelancer_attendance(employee_id,start_at,end_at);
REVOKE ALL ON public.freelancer_attendance FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.freelancer_attendance TO authenticated;
GRANT ALL ON public.freelancer_attendance TO service_role;
ALTER TABLE public.freelancer_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read attendance" ON public.freelancer_attendance FOR SELECT TO authenticated USING(public.can_manage_sales());
CREATE POLICY "staff insert attendance" ON public.freelancer_attendance FOR INSERT TO authenticated WITH CHECK(public.can_manage_sales() AND created_by=auth.uid());
CREATE POLICY "staff update attendance" ON public.freelancer_attendance FOR UPDATE TO authenticated USING(public.can_manage_sales()) WITH CHECK(public.can_manage_sales());

CREATE OR REPLACE FUNCTION public.check_attendance_overlap() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e uuid;
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '출근부 수정 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 FOR e IN SELECT DISTINCT value FROM unnest(ARRAY[NEW.employee_id,CASE WHEN TG_OP='UPDATE' THEN OLD.employee_id ELSE NEW.employee_id END]) value ORDER BY value LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(e::text,1));
 END LOOP;
 IF TG_OP='UPDATE' AND NEW.created_by<>OLD.created_by THEN RAISE EXCEPTION '등록자는 변경할 수 없습니다.'; END IF;
 IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM public.employees WHERE id=NEW.employee_id AND is_active) THEN RAISE EXCEPTION '사용 중인 직원을 선택해 주세요.'; END IF;
 IF EXISTS(SELECT 1 FROM public.freelancer_attendance a WHERE a.employee_id=NEW.employee_id AND a.id<>NEW.id AND a.start_at<NEW.end_at AND a.end_at>NEW.start_at) THEN
  RAISE EXCEPTION '같은 직원의 근무시간이 겹칩니다.' USING ERRCODE='23P01';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.check_attendance_overlap() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER check_attendance_overlap BEFORE INSERT OR UPDATE ON public.freelancer_attendance FOR EACH ROW EXECUTE FUNCTION public.check_attendance_overlap();

CREATE OR REPLACE FUNCTION public.attendance_summary(_from timestamptz,_to timestamptz,_employee uuid DEFAULT NULL)
RETURNS TABLE(employee_id uuid,minutes numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '출근부 열람 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _to<=_from THEN RAISE EXCEPTION '조회 기간을 확인해 주세요.'; END IF;
 RETURN QUERY SELECT a.employee_id,sum(extract(epoch FROM least(a.end_at,_to)-greatest(a.start_at,_from))/60)
 FROM public.freelancer_attendance a
 WHERE a.start_at<_to AND a.end_at>_from AND (_employee IS NULL OR a.employee_id=_employee)
 GROUP BY a.employee_id;
END $$;
REVOKE ALL ON FUNCTION public.attendance_summary(timestamptz,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.attendance_summary(timestamptz,timestamptz,uuid) TO authenticated;
