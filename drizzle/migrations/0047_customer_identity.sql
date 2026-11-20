ALTER TABLE public.customers
 ADD COLUMN birth_date date CHECK (birth_date >= DATE '1900-01-01' AND birth_date <= (now() AT TIME ZONE 'Asia/Seoul')::date),
 ADD COLUMN gender text CHECK (gender IN ('female','male','other'));

REVOKE UPDATE ON public.customers FROM authenticated;
GRANT UPDATE(name,phone,birth_date,gender,memo,category_id) ON public.customers TO authenticated;

CREATE POLICY "internal staff update customers" ON public.customers FOR UPDATE TO authenticated
 USING ((SELECT public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'internal')))
 WITH CHECK ((SELECT public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'internal')));

CREATE OR REPLACE FUNCTION public.can_edit_customer(_user uuid,_customer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_active_staff(_user) AND (
  public.has_role(_user,'admin') OR public.has_role(_user,'internal')
  OR EXISTS (SELECT FROM public.customers WHERE id=_customer AND created_by=_user))
$$;

CREATE INDEX customers_normalized_name_idx ON public.customers (lower(regexp_replace(btrim(name),'[[:space:]]+','','g')));

CREATE FUNCTION public.register_customer_checked(_name text,_phone text,_birth_date date,_gender text,_memo text,_category uuid,_confirm_same_name boolean DEFAULT false)
RETURNS TABLE (id uuid,customer_no bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=auth.uid(); normalized_name text; phone_digits text; full_access boolean; test_mode boolean;
BEGIN
 IF NOT coalesce(public.is_active_staff(actor),false) THEN RAISE EXCEPTION '고객 등록 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF char_length(btrim(coalesce(_name,''))) NOT BETWEEN 1 AND 50 OR char_length(coalesce(_phone,''))>20 OR char_length(coalesce(_memo,''))>500 THEN
  RAISE EXCEPTION '고객명, 연락처, 메모를 확인해 주세요.';
 END IF;
 full_access:=public.has_role(actor,'admin') OR public.has_role(actor,'internal');
 test_mode:=coalesce((SELECT b.trial_mode FROM public.booking_settings b WHERE b.id),false);
 normalized_name:=lower(regexp_replace(btrim(_name),'[[:space:]]+','','g'));
 phone_digits:=regexp_replace(coalesce(_phone,''),'[^0-9]','','g');
 PERFORM pg_advisory_xact_lock(hashtextextended(normalized_name,47));
 IF EXISTS (
  SELECT FROM public.customers c WHERE (full_access OR c.created_by=actor) AND c.is_test=test_mode
   AND lower(regexp_replace(btrim(c.name),'[[:space:]]+','','g'))=normalized_name
   AND ((length(phone_digits)>=7 AND regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')=phone_digits
      AND NOT (c.birth_date IS NOT NULL AND _birth_date IS NOT NULL AND c.birth_date<>_birth_date))
     OR (_birth_date IS NOT NULL AND _gender IS NOT NULL AND c.birth_date=_birth_date AND c.gender=_gender))
 ) THEN
  RAISE EXCEPTION '동일 고객으로 확인되는 기록이 있습니다. 기존 고객을 선택해 주세요.' USING ERRCODE='P4701';
 END IF;
 IF EXISTS (
  SELECT FROM public.customers c WHERE (full_access OR c.created_by=actor) AND c.is_test=test_mode
   AND lower(regexp_replace(btrim(c.name),'[[:space:]]+','','g'))=normalized_name
 ) AND (NOT coalesce(_confirm_same_name,false) OR _birth_date IS NULL OR _gender IS NULL OR length(phone_digits)<7) THEN
  RAISE EXCEPTION '같은 이름의 고객이 있습니다. 성별·생년월일·전화번호로 확인하고, 다른 사람인 경우에만 등록해 주세요.' USING ERRCODE='P4702';
 END IF;
 RETURN QUERY INSERT INTO public.customers AS c(name,phone,birth_date,gender,memo,category_id,created_by)
 VALUES(btrim(_name),nullif(btrim(_phone),''),_birth_date,_gender,nullif(btrim(_memo),''),_category,actor)
 RETURNING c.id,c.customer_no;
END $$;
REVOKE ALL ON FUNCTION public.register_customer_checked(text,text,date,text,text,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_customer_checked(text,text,date,text,text,uuid,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
