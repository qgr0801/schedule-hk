CREATE TABLE public.day_sections (
  position smallint PRIMARY KEY CHECK (position BETWEEN 1 AND 10),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 20),
  active boolean NOT NULL DEFAULT false
);
GRANT SELECT, UPDATE ON public.day_sections TO authenticated;
GRANT ALL ON public.day_sections TO service_role;
ALTER TABLE public.day_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sections read" ON public.day_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "sections admin update" ON public.day_sections FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.day_sections (position, name, active)
SELECT g, g || '번 룸', g <= 3 FROM generate_series(1, 10) g;

ALTER TABLE public.reservations ADD COLUMN section smallint REFERENCES public.day_sections(position);