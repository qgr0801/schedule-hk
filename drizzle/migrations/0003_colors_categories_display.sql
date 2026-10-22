-- 1. Status colors
CREATE TABLE public.reservation_status_settings (
  status public.reservation_status PRIMARY KEY,
  text_color text NOT NULL CHECK (text_color ~ '^#[0-9A-Fa-f]{6}$'),
  bg_color text NOT NULL CHECK (bg_color ~ '^#[0-9A-Fa-f]{6}$'),
  border_color text NOT NULL CHECK (border_color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.reservation_status_settings TO authenticated;
GRANT ALL ON public.reservation_status_settings TO service_role;
ALTER TABLE public.reservation_status_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "status colors read" ON public.reservation_status_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "status colors admin update" ON public.reservation_status_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.reservation_status_settings(status, text_color, bg_color, border_color) VALUES
  ('pending','#B45309','#FEF3C7','#F59E0B'),
  ('confirmed','#1D4ED8','#DBEAFE','#2563EB'),
  ('completed','#15803D','#DCFCE7','#16A34A'),
  ('no_show','#B91C1C','#FEE2E2','#DC2626'),
  ('cancelled','#475569','#F1F5F9','#64748B'),
  ('changed','#7E22CE','#F3E8FF','#9333EA');

-- 2. Staff colors
CREATE TABLE public.staff_color_settings (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  color text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.staff_color_settings TO authenticated;
GRANT ALL ON public.staff_color_settings TO service_role;
ALTER TABLE public.staff_color_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff colors read" ON public.staff_color_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff colors admin insert" ON public.staff_color_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "staff colors admin update" ON public.staff_color_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.suggest_staff_color(_n integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (ARRAY['#7C3AED','#0891B2','#DB2777','#EA580C','#2563EB','#16A34A','#CA8A04','#4F46E5','#0D9488','#BE123C'])[(_n % 10) + 1]
$$;

CREATE OR REPLACE FUNCTION public.profiles_default_color()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.staff_color_settings(user_id, color)
  VALUES (NEW.id, public.suggest_staff_color((SELECT count(*)::int FROM public.staff_color_settings)))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.profiles_default_color() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_profiles_default_color AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_default_color();

INSERT INTO public.staff_color_settings(user_id, color)
SELECT id, public.suggest_staff_color((row_number() OVER (ORDER BY created_at))::int - 1) FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- 3. Customer categories (fixed 7 slots)
CREATE TABLE public.customer_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot smallint NOT NULL UNIQUE CHECK (slot BETWEEN 1 AND 7),
  position smallint NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 20),
  color text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.customer_categories TO authenticated;
GRANT ALL ON public.customer_categories TO service_role;
ALTER TABLE public.customer_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories read" ON public.customer_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "categories admin update" ON public.customer_categories FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.customer_categories(slot, position, name, color) VALUES
  (1,1,'신규 고객','#2563EB'),(2,2,'기존 고객','#16A34A'),(3,3,'VIP 고객','#A855F7'),
  (4,4,'일본 고객','#EC4899'),(5,5,'외국인 고객','#06B6D4'),(6,6,'소개 고객','#F59E0B'),(7,7,'기타 고객','#64748B');

-- 4. Customers
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
  phone text,
  category_id uuid REFERENCES public.customer_categories(id),
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_created_by_idx ON public.customers(created_by);
CREATE TABLE public.customer_category_tags (
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.customer_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (customer_id, category_id)
);
ALTER TABLE public.reservations ADD COLUMN customer_id uuid REFERENCES public.customers(id);
ALTER TABLE public.reservations ADD COLUMN staff_id uuid REFERENCES public.profiles(id);
CREATE INDEX reservations_customer_idx ON public.reservations(customer_id);
COMMENT ON COLUMN public.reservations.staff_id IS 'Treatment staff (시술 담당자); null means the creator.';

CREATE OR REPLACE FUNCTION public.can_view_customer(_viewer uuid, _customer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customers c WHERE c.id = _customer AND (
      public.can_view_owner(_viewer, c.created_by)
      OR EXISTS (SELECT 1 FROM public.reservations r WHERE r.customer_id = c.id AND public.can_view_owner(_viewer, r.created_by))))
$$;
CREATE OR REPLACE FUNCTION public.can_edit_customer(_user uuid, _customer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user,'admin') OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = _customer AND c.created_by = _user)
$$;

GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers read" ON public.customers FOR SELECT TO authenticated USING (public.can_view_customer(auth.uid(), id));
CREATE POLICY "customers insert own" ON public.customers FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "customers update own or admin" ON public.customers FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));

GRANT SELECT, INSERT, DELETE ON public.customer_category_tags TO authenticated;
GRANT ALL ON public.customer_category_tags TO service_role;
ALTER TABLE public.customer_category_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags read" ON public.customer_category_tags FOR SELECT TO authenticated USING (public.can_view_customer(auth.uid(), customer_id));
CREATE POLICY "tags insert" ON public.customer_category_tags FOR INSERT TO authenticated WITH CHECK (public.can_edit_customer(auth.uid(), customer_id));
CREATE POLICY "tags delete" ON public.customer_category_tags FOR DELETE TO authenticated USING (public.can_edit_customer(auth.uid(), customer_id));

CREATE OR REPLACE FUNCTION public.customers_before_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.created_by <> OLD.created_by THEN RAISE EXCEPTION '고객 등록자는 변경할 수 없습니다'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_customers_before_update BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.customers_before_update();

-- Backfill: one customer per (creator, name, phone) from existing reservations, linked without touching reservation history
INSERT INTO public.customers(created_by, name, phone, category_id)
SELECT DISTINCT r.created_by, r.customer_name, r.customer_phone, (SELECT id FROM public.customer_categories WHERE slot = 2)
FROM public.reservations r;
ALTER TABLE public.reservations DISABLE TRIGGER trg_res_before_update;
ALTER TABLE public.reservations DISABLE TRIGGER trg_res_log;
UPDATE public.reservations r SET customer_id = c.id
FROM public.customers c
WHERE c.created_by = r.created_by AND c.name = r.customer_name AND c.phone IS NOT DISTINCT FROM r.customer_phone AND r.customer_id IS NULL;
ALTER TABLE public.reservations ENABLE TRIGGER trg_res_before_update;
ALTER TABLE public.reservations ENABLE TRIGGER trg_res_log;

-- Linking a reservation to a customer requires being able to see that customer
CREATE OR REPLACE FUNCTION public.reservations_check_customer()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.customer_id IS DISTINCT FROM OLD.customer_id)
     AND NOT public.can_view_customer(auth.uid(), NEW.customer_id) THEN
    RAISE EXCEPTION '선택한 고객을 사용할 권한이 없습니다' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_res_check_customer BEFORE INSERT OR UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.reservations_check_customer();

-- 5. Card display settings per view
CREATE TABLE public.calendar_display_settings (
  view text PRIMARY KEY CHECK (view IN ('day','week','month')),
  fields text[] NOT NULL DEFAULT '{}',
  color_mode text NOT NULL DEFAULT 'status' CHECK (color_mode IN ('status','staff')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.calendar_display_settings TO authenticated;
GRANT ALL ON public.calendar_display_settings TO service_role;
ALTER TABLE public.calendar_display_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "display read" ON public.calendar_display_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "display admin update" ON public.calendar_display_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.calendar_display_settings(view, fields) VALUES
  ('day', ARRAY['time','customer','category','service','creator','staff','status']),
  ('week', ARRAY['time','customer','category','service','status']),
  ('month', ARRAY['time','customer']);

-- 6. Status change history
CREATE TABLE public.reservation_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id),
  owner_id uuid NOT NULL,
  changed_by uuid,
  from_status public.reservation_status,
  to_status public.reservation_status NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rsh_reservation_idx ON public.reservation_status_history(reservation_id);
GRANT SELECT ON public.reservation_status_history TO authenticated;
GRANT ALL ON public.reservation_status_history TO service_role;
ALTER TABLE public.reservation_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "status history read" ON public.reservation_status_history FOR SELECT TO authenticated USING (public.can_view_owner(auth.uid(), owner_id));

CREATE OR REPLACE FUNCTION public.reservations_status_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.reservation_status_history(reservation_id, owner_id, changed_by, from_status, to_status)
    VALUES (NEW.id, NEW.created_by, auth.uid(), NULL, NEW.status);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.reservation_status_history(reservation_id, owner_id, changed_by, from_status, to_status, reason)
    VALUES (NEW.id, NEW.created_by, auth.uid(), OLD.status, NEW.status, CASE WHEN NEW.status = 'cancelled' THEN NEW.cancel_reason END);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.reservations_status_log() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_res_status_log AFTER INSERT OR UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.reservations_status_log();

-- 7. New reservations may start as pending or confirmed
DROP POLICY "reservations insert own" ON public.reservations;
CREATE POLICY "reservations insert own" ON public.reservations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND status IN ('confirmed','pending'));