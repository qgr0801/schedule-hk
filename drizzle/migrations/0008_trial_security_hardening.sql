-- 1) Signed-out visitors get no table access at all (RLS already returned 0 rows; this removes the grant too).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- 2) Permission helper functions: callable only by signed-in users (used inside RLS policies).
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_customer(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_customer(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_full(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_schedule_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_schedule_shared(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_customer(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_customer(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_full(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_owner(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_schedule_owner(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_schedule_shared(uuid, uuid) TO authenticated, service_role;

-- 3) Staff e-mail addresses: hidden from other staff; only admins read them through staff_emails().
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, full_name, department, is_active, created_at) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_emails()
RETURNS TABLE(id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.email FROM public.profiles p
  WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
     OR p.id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION public.staff_emails() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_emails() TO authenticated, service_role;