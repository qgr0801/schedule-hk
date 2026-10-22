DROP POLICY "customers read" ON public.customers;
CREATE POLICY "customers read" ON public.customers FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.can_view_customer(auth.uid(), id));