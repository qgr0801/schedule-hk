ALTER TABLE public.customer_management_sessions
 ADD COLUMN starts_at timestamptz,
 ADD COLUMN initial_used integer NOT NULL DEFAULT 0,
 ADD CONSTRAINT management_sessions_initial_used_check CHECK (initial_used BETWEEN 0 AND total);

CREATE OR REPLACE FUNCTION public.management_sessions_used(_customer uuid, _before timestamptz, _exclude uuid DEFAULT NULL)
RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT coalesce(max(p.initial_used), 0) + count(r.id)::integer
 FROM public.customer_management_sessions p
 LEFT JOIN public.reservations r ON r.customer_id=p.customer_id
  AND r.id IS DISTINCT FROM _exclude
  AND upper(btrim(r.service)) NOT IN ('SV','서비스','서비스 SV','서비스(SV)')
  AND r.status IN ('completed','paid')
  AND r.start_at >= coalesce(p.starts_at, p.starts_on::timestamp AT TIME ZONE 'Asia/Seoul')
  AND r.start_at < _before
 WHERE p.customer_id=_customer
$$;
