-- Shared settings (colors, section names, card fields, booking rules) are readable by
-- active staff accounts only, instead of "any signed-in session".
CREATE OR REPLACE FUNCTION public.is_active_staff(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    JOIN public.profiles p ON p.id = r.user_id
    WHERE r.user_id = _user AND p.is_active
  )
$$;
REVOKE EXECUTE ON FUNCTION public.is_active_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_staff(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "booking settings read" ON public.booking_settings;
CREATE POLICY "booking settings read active staff" ON public.booking_settings
  FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS "display read" ON public.calendar_display_settings;
CREATE POLICY "display read active staff" ON public.calendar_display_settings
  FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS "categories read" ON public.customer_categories;
CREATE POLICY "categories read active staff" ON public.customer_categories
  FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS "sections read" ON public.day_sections;
CREATE POLICY "sections read active staff" ON public.day_sections
  FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS "status colors read" ON public.reservation_status_settings;
CREATE POLICY "status colors read active staff" ON public.reservation_status_settings
  FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS "staff colors read" ON public.staff_color_settings;
CREATE POLICY "staff colors read active staff" ON public.staff_color_settings
  FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));