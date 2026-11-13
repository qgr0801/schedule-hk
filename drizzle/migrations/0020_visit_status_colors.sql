INSERT INTO public.reservation_status_settings (status, text_color, bg_color, border_color)
VALUES
  ('arrived', '#0E5261', '#A9D5DD', '#26768A'),
  ('paid', '#6B345F', '#EBD4ED', '#A45C9D')
ON CONFLICT (status) DO NOTHING;
