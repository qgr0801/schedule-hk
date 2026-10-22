ALTER TYPE public.reservation_status ADD VALUE IF NOT EXISTS 'pending' BEFORE 'confirmed';
ALTER TYPE public.reservation_status ADD VALUE IF NOT EXISTS 'changed';