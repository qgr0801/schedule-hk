-- Full staff profile rows: only yourself or an admin.
DROP POLICY IF EXISTS "profiles read" ON public.profiles;
CREATE POLICY "profiles read self or admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Name-only staff directory for calendar/staff labels (no e-mail, no other personal data).
CREATE OR REPLACE FUNCTION public.staff_directory()
RETURNS TABLE(id uuid, full_name text, department text, is_active boolean, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.department, p.is_active, p.created_at
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
  ORDER BY p.full_name
$$;
REVOKE EXECUTE ON FUNCTION public.staff_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_directory() TO authenticated, service_role;