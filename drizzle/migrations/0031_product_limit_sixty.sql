CREATE OR REPLACE FUNCTION public.limit_active_products() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.is_active AND (TG_OP='INSERT' OR NOT OLD.is_active) THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('active-product-limit',3));
  IF (SELECT count(*) FROM public.products WHERE is_active AND id<>NEW.id)>=60 THEN
   RAISE EXCEPTION '사용 중인 제품은 최대 60종까지 등록할 수 있습니다. 기존 제품을 사용 중지한 뒤 추가해 주세요.';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.limit_active_products() FROM PUBLIC,anon,authenticated;

NOTIFY pgrst, 'reload schema';
