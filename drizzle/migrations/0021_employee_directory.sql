CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 50),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "active staff read employees" ON public.employees
FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "active admin register employees" ON public.employees
FOR INSERT TO authenticated WITH CHECK (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "active admin update employees" ON public.employees
FOR UPDATE TO authenticated USING (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(), 'admin'));
