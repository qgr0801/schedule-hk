CREATE OR REPLACE FUNCTION public.limit_active_products() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.is_active AND (TG_OP='INSERT' OR NOT OLD.is_active) THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('active-product-limit',3));
  IF (SELECT count(*) FROM public.products WHERE is_active AND id<>NEW.id)>=30 THEN
   RAISE EXCEPTION '사용 중인 제품은 최대 30종까지 등록할 수 있습니다. 기존 제품을 사용 중지한 뒤 추가해 주세요.';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.limit_active_products() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER limit_active_products BEFORE INSERT OR UPDATE OF is_active ON public.products FOR EACH ROW EXECUTE FUNCTION public.limit_active_products();
CREATE OR REPLACE FUNCTION public.create_product_with_stock(_id uuid,_name text,_price numeric,_stock integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior public.products;
BEGIN
 IF NOT (public.is_active_staff(auth.uid()) AND public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION '최고관리자만 제품을 등록할 수 있습니다.' USING ERRCODE='42501'; END IF;
 IF _id IS NULL OR _name IS NULL OR char_length(btrim(_name)) NOT BETWEEN 1 AND 100 OR _price IS NULL OR _price<0 OR _price>999999999999 OR _price<>round(_price,2) OR _stock IS NULL OR _stock NOT BETWEEN 0 AND 100000000 THEN RAISE EXCEPTION '제품명, 판매가, 현재 보유 수량을 확인해 주세요.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_id::text,4));
 SELECT * INTO prior FROM public.products WHERE id=_id;
 IF FOUND THEN
  IF prior.name=btrim(_name) AND prior.price=_price AND (_stock=0 OR EXISTS(SELECT 1 FROM public.stock_movements m WHERE m.id=_id AND m.product_id=_id AND m.quantity=_stock AND m.reason='초기 재고' AND m.created_by=auth.uid())) THEN RETURN _id; END IF;
  RAISE EXCEPTION '이미 등록된 제품입니다. 새로고침해 주세요.';
 END IF;
 INSERT INTO public.products(id,name,price,stock) VALUES(_id,btrim(_name),_price,_stock);
 IF _stock>0 THEN INSERT INTO public.stock_movements(id,product_id,quantity,reason) VALUES(_id,_id,_stock,'초기 재고'); END IF;
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.create_product_with_stock(uuid,text,numeric,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_product_with_stock(uuid,text,numeric,integer) TO authenticated;
