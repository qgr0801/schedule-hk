-- 1) Trial mode switch + test-data flag on customers and reservations.
ALTER TABLE public.booking_settings ADD COLUMN trial_mode boolean NOT NULL DEFAULT false;

-- Every row that exists today is fake demo/QA data, so it is filled as test data (no UPDATE, no history noise).
ALTER TABLE public.customers ADD COLUMN is_test boolean NOT NULL DEFAULT true;
ALTER TABLE public.customers ALTER COLUMN is_test SET DEFAULT false;
ALTER TABLE public.reservations ADD COLUMN is_test boolean NOT NULL DEFAULT true;
ALTER TABLE public.reservations ALTER COLUMN is_test SET DEFAULT false;
COMMENT ON COLUMN public.customers.is_test IS 'true = fake trial/test data; stamped from booking_settings.trial_mode on insert, never changed afterwards';
COMMENT ON COLUMN public.reservations.is_test IS 'true = fake trial/test data; stamped from booking_settings.trial_mode on insert, never changed afterwards';

CREATE OR REPLACE FUNCTION public.stamp_is_test()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.is_test := COALESCE((SELECT b.trial_mode FROM public.booking_settings b WHERE b.id), false);
  ELSE
    NEW.is_test := OLD.is_test;
  END IF;
  RETURN NEW;
END
$$;
REVOKE EXECUTE ON FUNCTION public.stamp_is_test() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_customers_stamp_is_test BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.stamp_is_test();
CREATE TRIGGER trg_res_stamp_is_test BEFORE INSERT OR UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.stamp_is_test();

-- 2) Trial feedback log (admin only).
CREATE TABLE public.trial_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id),
  occurred_on date NOT NULL DEFAULT current_date,
  device text NOT NULL DEFAULT 'pc',
  menu text NOT NULL,
  content text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trial_feedback_device_chk CHECK (device IN ('pc', 'mobile', 'tablet')),
  CONSTRAINT trial_feedback_severity_chk CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  CONSTRAINT trial_feedback_status_chk CHECK (status IN ('open', 'in_progress', 'done', 'on_hold')),
  CONSTRAINT trial_feedback_menu_len CHECK (char_length(menu) BETWEEN 1 AND 50),
  CONSTRAINT trial_feedback_content_len CHECK (char_length(content) BETWEEN 1 AND 2000)
);
CREATE INDEX trial_feedback_occurred_idx ON public.trial_feedback (occurred_on DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trial_feedback TO authenticated;
GRANT ALL ON public.trial_feedback TO service_role;

ALTER TABLE public.trial_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feedback admin read" ON public.trial_feedback FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "feedback admin insert" ON public.trial_feedback FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) AND created_by = auth.uid());
CREATE POLICY "feedback admin update" ON public.trial_feedback FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "feedback admin delete" ON public.trial_feedback FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.trial_feedback_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.created_by := OLD.created_by;
  RETURN NEW;
END
$$;
REVOKE EXECUTE ON FUNCTION public.trial_feedback_touch() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_trial_feedback_touch BEFORE UPDATE ON public.trial_feedback
  FOR EACH ROW EXECUTE FUNCTION public.trial_feedback_touch();