-- Staff list management: test-account flag, inactive staff blocked server-side, admin role guards.

-- 1. Test-account label (admin sets it; never used to delete anything automatically).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
UPDATE public.profiles SET is_test = true WHERE email IN (
  'internal@demo-bsm.com','external@demo-bsm.com','internal2@demo-bsm.com',
  'qa4-admin-a@demo-bsm.com','qa4-internal-b@demo-bsm.com','qa4-external-c@demo-bsm.com');

-- 2. Profiles are written only by admin server functions (service role), never from the browser.
REVOKE UPDATE ON public.profiles FROM authenticated;

-- 3. Deactivated staff lose all data access immediately, even with a still-valid session token.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['reservations','customers','customer_category_tags','reservation_history',
    'reservation_status_history','schedules','schedule_shares','reservation_view_grants','staff_view_scopes',
    'user_roles','trial_feedback','staff_permission_log']
  LOOP
    EXECUTE format('CREATE POLICY "active staff only" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.is_active_staff(auth.uid()))) WITH CHECK ((SELECT public.is_active_staff(auth.uid())))', t);
  END LOOP;
END $$;

-- 4. Admin role guards: no self-demotion, never remove the last active admin, no moving a role row to another user.
CREATE OR REPLACE FUNCTION public.user_roles_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION '역할의 대상 직원은 바꿀 수 없습니다.';
  END IF;
  IF OLD.role = 'admin' AND (TG_OP = 'DELETE' OR NEW.role <> 'admin') THEN
    IF auth.uid() IS NOT NULL AND auth.uid() = OLD.user_id THEN
      RAISE EXCEPTION '본인의 관리자 권한은 변경할 수 없습니다.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id
      WHERE r.role = 'admin' AND r.user_id <> OLD.user_id AND p.is_active
    ) THEN
      RAISE EXCEPTION '마지막 관리자 계정은 제거하거나 역할을 바꿀 수 없습니다.';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE EXECUTE ON FUNCTION public.user_roles_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS user_roles_guard ON public.user_roles;
CREATE TRIGGER user_roles_guard BEFORE UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.user_roles_guard();

-- 5. Server-side RPCs also refuse deactivated staff.
CREATE OR REPLACE FUNCTION public.calendar_reservations(_from timestamp with time zone, _to timestamp with time zone)
 RETURNS TABLE(id uuid, created_by uuid, staff_id uuid, status reservation_status, section smallint, room text, start_at timestamp with time zone, end_at timestamp with time zone, public_service text, service text, category_id uuid, customer_name text, customer_phone text, memo text, customer_no bigint, access text, visible text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT auth.uid() AS uid,
      public.staff_has_field(auth.uid(),'staff') AS f_staff,
      public.staff_has_field(auth.uid(),'customer') AS f_cust,
      public.staff_has_field(auth.uid(),'customerNo') AS f_no,
      public.staff_has_field(auth.uid(),'phone') AS f_phone,
      public.staff_has_field(auth.uid(),'memo') AS f_memo,
      public.staff_has_field(auth.uid(),'history') AS f_hist
  )
  SELECT r.id, r.created_by,
    CASE WHEN me.f_staff THEN r.staff_id END,
    r.status, r.section, r.room, r.start_at, r.end_at, r.public_service,
    CASE WHEN x.d THEN r.service END,
    CASE WHEN x.d THEN c.category_id END,
    CASE WHEN me.f_cust THEN r.customer_name END,
    CASE WHEN me.f_phone THEN r.customer_phone END,
    CASE WHEN me.f_memo THEN r.memo END,
    CASE WHEN me.f_no THEN c.customer_no END,
    CASE WHEN x.d THEN 'detail' ELSE 'block' END,
    array_remove(ARRAY[
      CASE WHEN me.f_staff THEN 'staff' END, CASE WHEN me.f_cust THEN 'customer' END,
      CASE WHEN me.f_no THEN 'customerNo' END, CASE WHEN me.f_phone THEN 'phone' END,
      CASE WHEN me.f_memo THEN 'memo' END, CASE WHEN me.f_hist AND r.customer_id IS NOT NULL THEN 'history' END
    ], NULL)
  FROM public.reservations r
  CROSS JOIN me
  LEFT JOIN public.customers c ON c.id = r.customer_id
  CROSS JOIN LATERAL (SELECT public.can_view_owner(me.uid, r.created_by) AS d) x
  WHERE public.is_active_staff(me.uid)
    AND r.start_at >= _from AND r.start_at <= _to
    AND NOT public.can_view_full(me.uid, r.created_by)
  ORDER BY r.start_at
$function$;

CREATE OR REPLACE FUNCTION public.customer_visit_history(_reservation uuid)
 RETURNS TABLE(start_at timestamp with time zone, end_at timestamp with time zone, public_service text, status reservation_status)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT r2.start_at, r2.end_at, r2.public_service, r2.status
  FROM public.reservations r
  JOIN public.reservations r2 ON r2.customer_id = r.customer_id
  WHERE r.id = _reservation AND r.customer_id IS NOT NULL AND public.is_active_staff(auth.uid())
    AND (public.can_view_full(auth.uid(), r.created_by) OR public.staff_has_field(auth.uid(), 'history'))
  ORDER BY r2.start_at DESC
  LIMIT 50
$function$;

CREATE OR REPLACE FUNCTION public.find_overlaps(_start timestamp with time zone, _end timestamp with time zone, _staff uuid, _section smallint, _exclude uuid)
 RETURNS TABLE(start_at timestamp with time zone, end_at timestamp with time zone, public_service text, status reservation_status, conflict text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT r.start_at, r.end_at, r.public_service, r.status,
    CASE WHEN COALESCE(r.staff_id, r.created_by) = _staff THEN 'staff' ELSE 'section' END
  FROM public.reservations r
  WHERE public.is_active_staff(auth.uid())
    AND r.id IS DISTINCT FROM _exclude
    AND tstzrange(r.start_at, r.end_at) && tstzrange(_start, _end)
    AND (r.status <> 'cancelled' OR NOT COALESCE((SELECT b.cancelled_slot_reusable FROM public.booking_settings b LIMIT 1), true))
    AND (COALESCE(r.staff_id, r.created_by) = _staff OR (_section IS NOT NULL AND r.section = _section))
  ORDER BY r.start_at
$function$;

CREATE OR REPLACE FUNCTION public.shared_reservations(_from timestamp with time zone, _to timestamp with time zone)
 RETURNS TABLE(id uuid, created_by uuid, staff_id uuid, service text, status reservation_status, section smallint, start_at timestamp with time zone, end_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT r.id, r.created_by, r.staff_id, r.service, r.status, r.section, r.start_at, r.end_at
  FROM public.reservations r
  WHERE public.is_active_staff(auth.uid())
    AND r.start_at >= _from AND r.start_at <= _to
    AND NOT public.can_view_full(auth.uid(), r.created_by)
    AND public.can_view_owner(auth.uid(), r.created_by)
  ORDER BY r.start_at
$function$;

CREATE OR REPLACE FUNCTION public.staff_directory()
 RETURNS TABLE(id uuid, full_name text, department text, is_active boolean, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.full_name, p.department, p.is_active, p.created_at
  FROM public.profiles p
  WHERE public.is_active_staff(auth.uid())
  ORDER BY p.full_name
$function$;

CREATE OR REPLACE FUNCTION public.staff_emails()
 RETURNS TABLE(id uuid, email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.email FROM public.profiles p
  WHERE public.is_active_staff(auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role)
     OR p.id = auth.uid())
$function$;