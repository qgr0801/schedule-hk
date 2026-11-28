CREATE FUNCTION public.my_linked_route_reservations()
RETURNS TABLE (
  id uuid, start_at timestamptz, end_at timestamptz, status public.reservation_status,
  customer_name text, customer_no bigint, service text, route_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT r.id, r.start_at, r.end_at, r.status,
    coalesce(c.name, r.customer_name)::text, c.customer_no,
    coalesce(nullif(r.public_service, ''), '예약')::text, b.name::text
  FROM public.external_performance_routes l
  JOIN public.booking_routes b ON b.id = l.route_id
  JOIN public.reservations r ON r.booking_route_id = l.route_id
  LEFT JOIN public.customers c ON c.id = r.customer_id
  WHERE l.staff_id = (SELECT auth.uid())
    AND (SELECT public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(), 'external'))
    AND r.created_by <> l.staff_id;
$$;
REVOKE ALL ON FUNCTION public.my_linked_route_reservations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_linked_route_reservations() TO authenticated;
