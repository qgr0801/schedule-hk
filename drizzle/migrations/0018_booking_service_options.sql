ALTER TABLE public.booking_settings
  ADD COLUMN IF NOT EXISTS services text[] NOT NULL DEFAULT ARRAY['피부 상담', '레이저 토닝', '보톡스', '필러', '리프팅', '수분 관리', '여드름 관리', '제모'] CHECK (cardinality(services) > 0),
  ADD COLUMN IF NOT EXISTS public_services text[] NOT NULL DEFAULT ARRAY['시술', '피부상담', '성형상담', '피부관리', '바디관리'] CHECK (cardinality(public_services) > 0);
