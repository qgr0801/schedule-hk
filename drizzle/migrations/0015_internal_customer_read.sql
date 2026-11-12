CREATE POLICY "internal staff read all customers"
ON public.customers FOR SELECT TO authenticated
USING ((SELECT public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(), 'internal')));
--> statement-breakpoint
CREATE POLICY "internal staff read all customer tags"
ON public.customer_category_tags FOR SELECT TO authenticated
USING ((SELECT public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(), 'internal')));
