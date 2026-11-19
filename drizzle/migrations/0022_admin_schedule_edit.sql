CREATE POLICY "active admin update schedules" ON public.schedules
FOR UPDATE TO authenticated
USING (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(), 'admin'));
