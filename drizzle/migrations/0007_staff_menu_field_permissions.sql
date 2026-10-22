-- Per-staff menu access and field-level view permissions
ALTER TABLE public.staff_view_scopes
  ADD COLUMN menus text[] NOT NULL DEFAULT '{dashboard,calendar,reservation_new,my_reservations}',
  ADD COLUMN fields text[] NOT NULL DEFAULT '{block,status,treatment,staff,creator,customer}';
ALTER TABLE public.staff_view_scopes ALTER COLUMN scope SET DEFAULT 'own';
ALTER TABLE public.staff_view_scopes ADD CONSTRAINT staff_menus_valid CHECK (menus <@ ARRAY['dashboard','calendar','reservation_new','my_reservations','customers','admin_reservations','admin_staff','admin_settings']::text[]);
ALTER TABLE public.staff_view_scopes ADD CONSTRAINT staff_fields_valid CHECK (fields <@ ARRAY['block','status','treatment','staff','creator','customer','customerNo','phone','memo','history']::text[]);
COMMENT ON COLUMN public.staff_view_scopes.can_view_pii IS 'DEPRECATED: replaced by fields (customer/customerNo/phone/memo/history)';

-- Calendar drag & drop / resize step (admin setting)
ALTER TABLE public.booking_settings ADD COLUMN slot_minutes smallint NOT NULL DEFAULT 30;
ALTER TABLE public.booking_settings ADD CONSTRAINT slot_minutes_valid CHECK (slot_minutes IN (10,15,30,60));

-- Permission change log (written only by trigger, readable by admin)
CREATE TABLE public.staff_permission_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  changed_by uuid,
  kind text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staff_permission_log TO authenticated;
GRANT ALL ON public.staff_permission_log TO service_role;
ALTER TABLE public.staff_permission_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permission log admin read" ON public.staff_permission_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX staff_permission_log_created_idx ON public.staff_permission_log(created_at DESC);

CREATE OR REPLACE FUNCTION public.log_staff_permission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o jsonb; n jsonb; target uuid; k text;
BEGIN
  IF TG_TABLE_NAME = 'staff_view_scopes' THEN
    k := 'permissions';
    target := COALESCE(NEW.user_id, OLD.user_id);
    o := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE jsonb_build_object('scope', OLD.scope, 'menus', to_jsonb(OLD.menus), 'fields', to_jsonb(OLD.fields)) END;
    n := jsonb_build_object('scope', NEW.scope, 'menus', to_jsonb(NEW.menus), 'fields', to_jsonb(NEW.fields));
  ELSIF TG_TABLE_NAME = 'user_roles' THEN
    k := 'role';
    target := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
    o := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE jsonb_build_object('role', OLD.role) END;
    n := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE jsonb_build_object('role', NEW.role) END;
  ELSE
    k := 'grant';
    target := CASE WHEN TG_OP = 'DELETE' THEN OLD.viewer_id ELSE NEW.viewer_id END;
    o := CASE WHEN TG_OP = 'DELETE' THEN jsonb_build_object('owner_id', OLD.owner_id) END;
    n := CASE WHEN TG_OP = 'INSERT' THEN jsonb_build_object('owner_id', NEW.owner_id) END;
  END IF;
  IF o IS NOT DISTINCT FROM n THEN RETURN NULL; END IF;
  INSERT INTO public.staff_permission_log(user_id, changed_by, kind, old_data, new_data) VALUES (target, auth.uid(), k, o, n);
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.log_staff_permission() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_scope_log AFTER INSERT OR UPDATE ON public.staff_view_scopes FOR EACH ROW EXECUTE FUNCTION public.log_staff_permission();
CREATE TRIGGER trg_role_log AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.log_staff_permission();
CREATE TRIGGER trg_grant_log AFTER INSERT OR DELETE ON public.reservation_view_grants FOR EACH ROW EXECUTE FUNCTION public.log_staff_permission();

-- Field permission check: admin always; block/status/treatment/creator for everyone;
-- customer info fields only for internal staff who were granted them.
CREATE OR REPLACE FUNCTION public.staff_has_field(_user uuid, _field text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user IS NOT NULL AND (
    public.has_role(_user, 'admin')
    OR _field IN ('block','status','treatment','creator')
    OR (_field = ANY (COALESCE((SELECT s.fields FROM public.staff_view_scopes s WHERE s.user_id = _user), '{block,status,treatment,staff,creator,customer}'::text[]))
        AND (_field NOT IN ('customer','customerNo','phone','memo','history') OR public.has_role(_user, 'internal'))))
$$;
REVOKE EXECUTE ON FUNCTION public.staff_has_field(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_has_field(uuid, text) TO authenticated;

-- Missing scope now means 'own'
CREATE OR REPLACE FUNCTION public.can_view_owner(_viewer uuid, _owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _viewer = _owner
    OR public.has_role(_viewer, 'admin')
    OR (public.has_role(_viewer, 'internal') AND (
      COALESCE((SELECT s.scope FROM public.staff_view_scopes s WHERE s.user_id = _viewer), 'own') = 'all'
      OR (COALESCE((SELECT s.scope FROM public.staff_view_scopes s WHERE s.user_id = _viewer), 'own') = 'selected'
          AND EXISTS (SELECT 1 FROM public.reservation_view_grants g WHERE g.viewer_id = _viewer AND g.owner_id = _owner))))
$$;

-- Calendar read model with per-field permissions
DROP FUNCTION public.calendar_reservations(timestamptz, timestamptz);
CREATE FUNCTION public.calendar_reservations(_from timestamptz, _to timestamptz)
RETURNS TABLE (
  id uuid, created_by uuid, staff_id uuid, status public.reservation_status, section smallint, room text,
  start_at timestamptz, end_at timestamptz, public_service text, service text, category_id uuid,
  customer_name text, customer_phone text, memo text, customer_no bigint, access text, visible text[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT auth.uid() AS uid,
      public.staff_has_field(auth.uid(),'staff') AS f_staff,
      public.staff_has_field(auth.uid(),'customer') AS f_cust,
      public.staff_has_field(auth.uid(),'customerNo') AS f_no,
      public.staff_has_field(auth.uid(),'phone') AS f_phone,
      public.staff_has_field(auth.uid(),'memo') AS f_memo,
      public.staff_has_field(auth.uid(),'history') AS f_hist
  )
  SELECT r.id, r.created_by,
    CASE WHEN me.f_staff THEN r.staff_id END,
    r.status, r.section, r.room, r.start_at, r.end_at, r.public_service,
    CASE WHEN x.d THEN r.service END,
    CASE WHEN x.d THEN c.category_id END,
    CASE WHEN me.f_cust THEN r.customer_name END,
    CASE WHEN me.f_phone THEN r.customer_phone END,
    CASE WHEN me.f_memo THEN r.memo END,
    CASE WHEN me.f_no THEN c.customer_no END,
    CASE WHEN x.d THEN 'detail' ELSE 'block' END,
    array_remove(ARRAY[
      CASE WHEN me.f_staff THEN 'staff' END, CASE WHEN me.f_cust THEN 'customer' END,
      CASE WHEN me.f_no THEN 'customerNo' END, CASE WHEN me.f_phone THEN 'phone' END,
      CASE WHEN me.f_memo THEN 'memo' END, CASE WHEN me.f_hist AND r.customer_id IS NOT NULL THEN 'history' END
    ], NULL)
  FROM public.reservations r
  CROSS JOIN me
  LEFT JOIN public.customers c ON c.id = r.customer_id
  CROSS JOIN LATERAL (SELECT public.can_view_owner(me.uid, r.created_by) AS d) x
  WHERE me.uid IS NOT NULL
    AND r.start_at >= _from AND r.start_at <= _to
    AND NOT public.can_view_full(me.uid, r.created_by)
  ORDER BY r.start_at
$$;
REVOKE EXECUTE ON FUNCTION public.calendar_reservations(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calendar_reservations(timestamptz, timestamptz) TO authenticated;

-- Customer visit history (block-level) for a reservation, only with permission
CREATE OR REPLACE FUNCTION public.customer_visit_history(_reservation uuid)
RETURNS TABLE (start_at timestamptz, end_at timestamptz, public_service text, status public.reservation_status)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r2.start_at, r2.end_at, r2.public_service, r2.status
  FROM public.reservations r
  JOIN public.reservations r2 ON r2.customer_id = r.customer_id
  WHERE r.id = _reservation AND r.customer_id IS NOT NULL AND auth.uid() IS NOT NULL
    AND (public.can_view_full(auth.uid(), r.created_by) OR public.staff_has_field(auth.uid(), 'history'))
  ORDER BY r2.start_at DESC
  LIMIT 50
$$;
REVOKE EXECUTE ON FUNCTION public.customer_visit_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_visit_history(uuid) TO authenticated;

-- New staff get a permission row with the default template
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), NEW.email);
  INSERT INTO public.user_roles(user_id, role)
  VALUES (NEW.id, CASE WHEN NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role='admin') THEN 'admin'::public.app_role ELSE 'external'::public.app_role END);
  INSERT INTO public.staff_view_scopes(user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;

-- Backfill: apply the default template to every non-admin staff member (logged as system change)
INSERT INTO public.staff_view_scopes(user_id)
  SELECT p.id FROM public.profiles p WHERE NOT public.has_role(p.id, 'admin')
  ON CONFLICT (user_id) DO NOTHING;
UPDATE public.staff_view_scopes s
  SET scope = 'own', menus = '{dashboard,calendar,reservation_new,my_reservations}', fields = '{block,status,treatment,staff,creator,customer}',
      can_view_pii = false, updated_at = now()
  WHERE NOT public.has_role(s.user_id, 'admin');