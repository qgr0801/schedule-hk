ALTER TYPE public.reservation_status ADD VALUE IF NOT EXISTS 'arrived';
--> statement-breakpoint
ALTER TYPE public.reservation_status ADD VALUE IF NOT EXISTS 'paid';
