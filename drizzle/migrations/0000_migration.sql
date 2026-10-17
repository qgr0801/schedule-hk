CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE public.app_role AS ENUM ('admin','internal','external');
CREATE TYPE public.reservation_status AS ENUM ('confirmed','completed','cancelled','no_show');
CREATE TYPE public.schedule_visibility AS ENUM ('public','selected','private');

-- profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text,
  department text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- view grants: viewer (internal staff) may view owner's reservations
CREATE TABLE public.reservation_view_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (viewer_id, owner_id),
  CHECK (viewer_id <> owner_id)
);
GRANT SELECT, INSERT, DELETE ON public.reservation_view_grants TO authenticated;
GRANT ALL ON public.reservation_view_grants TO service_role;
ALTER TABLE public.reservation_view_grants ENABLE ROW LEVEL SECURITY;

-- reservations
CREATE TABLE public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  customer_name text NOT NULL,
  customer_phone text,
  service text NOT NULL,
  room text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status public.reservation_status NOT NULL DEFAULT 'confirmed',
  memo text,
  cancel_reason text,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at),
  CONSTRAINT no_overlap EXCLUDE USING gist (
    created_by WITH =, tstzrange(start_at, end_at) WITH &&
  ) WHERE (status <> 'cancelled')
);
CREATE INDEX ON public.reservations (start_at);
GRANT SELECT, INSERT, UPDATE ON public.reservations TO authenticated;
GRANT ALL ON public.reservations TO service_role;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_owner(_viewer uuid, _owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _viewer = _owner
    OR public.has_role(_viewer, 'admin')
    OR (public.has_role(_viewer, 'internal') AND EXISTS (
      SELECT 1 FROM public.reservation_view_grants g WHERE g.viewer_id = _viewer AND g.owner_id = _owner))
$$;

-- history
CREATE TABLE public.reservation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  changed_by uuid,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reservation_history TO authenticated;
GRANT ALL ON public.reservation_history TO service_role;
ALTER TABLE public.reservation_history ENABLE ROW LEVEL SECURITY;

-- schedules
CREATE TABLE public.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL,
  memo text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  visibility public.schedule_visibility NOT NULL DEFAULT 'private',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedules TO authenticated;
GRANT ALL ON public.schedules TO service_role;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.schedule_shares (
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  PRIMARY KEY (schedule_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.schedule_shares TO authenticated;
GRANT ALL ON public.schedule_shares TO service_role;
ALTER TABLE public.schedule_shares ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_schedule_owner(_schedule uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.schedules WHERE id = _schedule AND owner_id = _user)
$$;
CREATE OR REPLACE FUNCTION public.is_schedule_shared(_schedule uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.schedule_shares WHERE schedule_id = _schedule AND user_id = _user)
$$;

-- POLICIES
CREATE POLICY "profiles read" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles update self or admin" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "roles read" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "roles admin insert" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "roles admin update" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "roles admin delete" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "grants read" ON public.reservation_view_grants FOR SELECT TO authenticated
  USING (viewer_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "grants admin insert" ON public.reservation_view_grants FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "grants admin delete" ON public.reservation_view_grants FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "reservations read" ON public.reservations FOR SELECT TO authenticated
  USING (public.can_view_owner(auth.uid(), created_by));
CREATE POLICY "reservations insert own" ON public.reservations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND status = 'confirmed');
CREATE POLICY "reservations update own or admin" ON public.reservations FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "history read" ON public.reservation_history FOR SELECT TO authenticated
  USING (public.can_view_owner(auth.uid(), owner_id));

CREATE POLICY "schedules read" ON public.schedules FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR visibility = 'public'
    OR (visibility = 'selected' AND public.is_schedule_shared(id, auth.uid())));
CREATE POLICY "schedules insert own" ON public.schedules FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "schedules update own" ON public.schedules FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "schedules delete own" ON public.schedules FOR DELETE TO authenticated USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "shares read" ON public.schedule_shares FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_schedule_owner(schedule_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "shares owner insert" ON public.schedule_shares FOR INSERT TO authenticated WITH CHECK (public.is_schedule_owner(schedule_id, auth.uid()));
CREATE POLICY "shares owner delete" ON public.schedule_shares FOR DELETE TO authenticated USING (public.is_schedule_owner(schedule_id, auth.uid()));

-- TRIGGERS
CREATE OR REPLACE FUNCTION public.reservations_before_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.created_by <> OLD.created_by THEN RAISE EXCEPTION '예약 작성자는 변경할 수 없습니다'; END IF;
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION '취소된 예약은 관리자만 복구할 수 있습니다';
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN NEW.cancelled_at := now(); END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_res_before_update BEFORE UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.reservations_before_update();

CREATE OR REPLACE FUNCTION public.reservations_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE act text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.reservation_history(reservation_id, owner_id, changed_by, action, new_data)
    VALUES (NEW.id, NEW.created_by, auth.uid(), 'created', to_jsonb(NEW));
  ELSE
    act := CASE WHEN NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN 'cancelled'
                WHEN NEW.status <> OLD.status THEN 'status_changed' ELSE 'updated' END;
    INSERT INTO public.reservation_history(reservation_id, owner_id, changed_by, action, old_data, new_data)
    VALUES (NEW.id, NEW.created_by, auth.uid(), act, to_jsonb(OLD), to_jsonb(NEW));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_res_log AFTER INSERT OR UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.reservations_log();

-- signup: profile + role (first user admin, else external)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), NEW.email);
  INSERT INTO public.user_roles(user_id, role)
  VALUES (NEW.id, CASE WHEN NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role='admin') THEN 'admin'::public.app_role ELSE 'external'::public.app_role END);
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reservations_log() FROM PUBLIC, anon, authenticated;