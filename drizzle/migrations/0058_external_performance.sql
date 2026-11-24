CREATE TABLE public.external_performance_routes (
  staff_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  route_id uuid NOT NULL UNIQUE REFERENCES public.booking_routes(id) ON DELETE CASCADE
);
ALTER TABLE public.external_performance_routes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.external_performance_routes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_performance_routes TO authenticated;
CREATE POLICY "admin manages external performance routes" ON public.external_performance_routes TO authenticated
  USING ((SELECT public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(), 'admin')))
  WITH CHECK ((SELECT public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(), 'admin'))
    AND public.has_role(staff_id, 'external'));

CREATE FUNCTION public.my_external_performance(_from date, _to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  own_route uuid;
  result jsonb;
BEGIN
  IF (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(), 'external')) IS NOT TRUE THEN
    RAISE EXCEPTION '외부 직원 본인만 조회할 수 있습니다.' USING ERRCODE='42501';
  END IF;
  IF _from IS NULL OR _to IS NULL OR _from > _to THEN
    RAISE EXCEPTION '조회 기간을 확인해 주세요.';
  END IF;
  SELECT route_id INTO own_route FROM public.external_performance_routes WHERE staff_id=auth.uid();
  IF own_route IS NULL THEN RETURN NULL; END IF;

  WITH entries AS (
    SELECT cp.paid_on, line->>'kind' AS kind, nullif(btrim(line->>'description'),'') AS description,
      coalesce((line->>'card')::numeric,0)+coalesce((line->>'bank')::numeric,0)+coalesce((line->>'krw')::numeric,0) AS krw,
      coalesce((line->>'jpy')::numeric,0) AS jpy, coalesce((line->>'usd')::numeric,0) AS usd, coalesce((line->>'cny')::numeric,0) AS cny
    FROM public.customer_payments cp
    JOIN public.reservations r ON r.id=cp.reservation_id
    CROSS JOIN LATERAL jsonb_array_elements(cp.rows) line
    WHERE r.booking_route_id=own_route AND cp.paid_on BETWEEN _from AND _to
      AND line->>'kind' IN ('service','care','art')
  ), settlements AS (
    SELECT kind, amount, completed_amount
    FROM public.admin_route_settlements
    WHERE route_id=own_route AND period_from=_from AND period_to=_to
  )
  SELECT jsonb_build_object(
    'entries', (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY paid_on DESC, kind, description),'[]') FROM entries e
      WHERE description IS NOT NULL OR krw<>0 OR jpy<>0 OR usd<>0 OR cny<>0),
    'settlements', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY kind),'[]') FROM settlements s)
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.my_external_performance(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_external_performance(date,date) TO authenticated;
