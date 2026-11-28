ALTER POLICY "staff read monthly work reports" ON public.monthly_work_reports
 USING ((SELECT public.is_active_staff(auth.uid()) AND
   (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'internal'))));
