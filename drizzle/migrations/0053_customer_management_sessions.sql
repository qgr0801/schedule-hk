CREATE TABLE public.customer_management_sessions (
 customer_id uuid PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
 total integer NOT NULL CHECK (total BETWEEN 1 AND 30),
 starts_on date NOT NULL
);
ALTER TABLE public.customer_management_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_management_sessions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.customer_management_sessions TO authenticated;
CREATE POLICY "staff manage customer session totals" ON public.customer_management_sessions
 FOR ALL TO authenticated USING (public.can_manage_sales()) WITH CHECK (public.can_manage_sales());

CREATE FUNCTION public.management_sessions_used(_customer uuid, _before timestamptz, _exclude uuid DEFAULT NULL)
RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT count(*)::integer
 FROM public.customer_management_sessions p
 JOIN public.reservations r ON r.customer_id=p.customer_id
 WHERE p.customer_id=_customer
  AND r.id IS DISTINCT FROM _exclude
  AND upper(btrim(r.service)) NOT IN ('SV','서비스','서비스 SV','서비스(SV)')
  AND r.status IN ('completed','paid')
  AND r.start_at >= (p.starts_on::timestamp AT TIME ZONE 'Asia/Seoul')
  AND r.start_at < _before
$$;
REVOKE ALL ON FUNCTION public.management_sessions_used(uuid,timestamptz,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.management_sessions_used(uuid,timestamptz,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
