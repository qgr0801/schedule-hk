-- Per-staff view scope set by admin: own / selected (grants) / all
CREATE TABLE public.staff_view_scopes (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'selected' CHECK (scope IN ('own','selected','all')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.staff_view_scopes TO authenticated;
GRANT ALL ON public.staff_view_scopes TO service_role;
ALTER TABLE public.staff_view_scopes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scopes read" ON public.staff_view_scopes FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "scopes admin insert" ON public.staff_view_scopes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "scopes admin update" ON public.staff_view_scopes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Who may see that another staff member's reservation exists (limited fields)
CREATE OR REPLACE FUNCTION public.can_view_owner(_viewer uuid, _owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _viewer = _owner
    OR public.has_role(_viewer, 'admin')
    OR (public.has_role(_viewer, 'internal') AND (
      COALESCE((SELECT s.scope FROM public.staff_view_scopes s WHERE s.user_id = _viewer), 'selected') = 'all'
      OR (COALESCE((SELECT s.scope FROM public.staff_view_scopes s WHERE s.user_id = _viewer), 'selected') = 'selected'
          AND EXISTS (SELECT 1 FROM public.reservation_view_grants g WHERE g.viewer_id = _viewer AND g.owner_id = _owner))))
$$;

-- Who may see full reservation details (customer info, memo, history)
CREATE OR REPLACE FUNCTION public.can_view_full(_viewer uuid, _owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _viewer = _owner OR public.has_role(_viewer, 'admin')
$$;

DROP POLICY "reservations read" ON public.reservations;
CREATE POLICY "reservations read" ON public.reservations FOR SELECT TO authenticated USING (public.can_view_full(auth.uid(), created_by));
DROP POLICY "history read" ON public.reservation_history;
CREATE POLICY "history read" ON public.reservation_history FOR SELECT TO authenticated USING (public.can_view_full(auth.uid(), owner_id));
DROP POLICY "status history read" ON public.reservation_status_history;
CREATE POLICY "status history read" ON public.reservation_status_history FOR SELECT TO authenticated USING (public.can_view_full(auth.uid(), owner_id));

CREATE OR REPLACE FUNCTION public.can_view_customer(_viewer uuid, _customer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customers c WHERE c.id = _customer AND (
      public.can_view_full(_viewer, c.created_by)
      OR EXISTS (SELECT 1 FROM public.reservations r WHERE r.customer_id = c.id AND public.can_view_full(_viewer, r.created_by))))
$$;

-- Other staff's reservations, reduced to status + service only
CREATE OR REPLACE FUNCTION public.shared_reservations(_from timestamptz, _to timestamptz)
RETURNS TABLE (id uuid, created_by uuid, staff_id uuid, service text, status public.reservation_status, section smallint, start_at timestamptz, end_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.created_by, r.staff_id, r.service, r.status, r.section, r.start_at, r.end_at
  FROM public.reservations r
  WHERE auth.uid() IS NOT NULL
    AND r.start_at >= _from AND r.start_at <= _to
    AND NOT public.can_view_full(auth.uid(), r.created_by)
    AND public.can_view_owner(auth.uid(), r.created_by)
  ORDER BY r.start_at
$$;
REVOKE EXECUTE ON FUNCTION public.shared_reservations(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shared_reservations(timestamptz, timestamptz) TO authenticated;