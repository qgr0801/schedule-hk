ALTER TABLE public.reservations
  DROP CONSTRAINT no_overlap_staff,
  DROP CONSTRAINT no_overlap_section;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.find_overlaps(_start timestamp with time zone, _end timestamp with time zone, _staff uuid, _section smallint, _exclude uuid)
 RETURNS TABLE(start_at timestamp with time zone, end_at timestamp with time zone, public_service text, status reservation_status, conflict text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT r.start_at, r.end_at, r.public_service, r.status,
    CASE WHEN COALESCE(r.staff_id, r.created_by) = _staff THEN 'staff' ELSE 'section' END
  FROM public.reservations r
  WHERE public.is_active_staff(auth.uid())
    AND r.id IS DISTINCT FROM _exclude
    AND tstzrange(r.start_at, r.end_at) && tstzrange(_start, _end)
    AND r.status = 'cancelled'
    AND NOT COALESCE((SELECT b.cancelled_slot_reusable FROM public.booking_settings b LIMIT 1), true)
    AND (COALESCE(r.staff_id, r.created_by) = _staff OR (_section IS NOT NULL AND r.section = _section))
  ORDER BY r.start_at
$function$;
