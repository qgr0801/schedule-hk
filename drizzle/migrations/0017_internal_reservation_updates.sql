CREATE POLICY "internal staff read reservations"
ON public.reservations FOR SELECT TO authenticated
USING ((SELECT public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(), 'internal')));
--> statement-breakpoint
CREATE POLICY "internal staff update reservations"
ON public.reservations FOR UPDATE TO authenticated
USING (status <> 'cancelled' AND (SELECT public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(), 'internal')))
WITH CHECK ((SELECT public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(), 'internal')));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.can_view_customer(_viewer uuid, _customer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customers c WHERE c.id = _customer AND (
      (public.is_active_staff(_viewer) AND public.has_role(_viewer, 'internal'))
      OR public.can_view_full(_viewer, c.created_by)
      OR EXISTS (SELECT 1 FROM public.reservations r WHERE r.customer_id = c.id AND public.can_view_full(_viewer, r.created_by))))
$$;
