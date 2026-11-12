CREATE FUNCTION public.calendar_customer_id(_reservation uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT customer_id FROM public.reservations
  WHERE id = _reservation
    AND public.is_active_staff(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'internal'));
$$;
REVOKE EXECUTE ON FUNCTION public.calendar_customer_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calendar_customer_id(uuid) TO authenticated;
