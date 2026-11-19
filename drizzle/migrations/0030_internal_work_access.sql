-- Expand only the valid menu keys, retaining the check in the same atomic ALTER.
ALTER TABLE public.staff_view_scopes
 DROP CONSTRAINT staff_menus_valid,
 ADD CONSTRAINT staff_menus_valid CHECK (menus <@ ARRAY['dashboard','calendar','reservation_new','my_reservations','attendance','customers','admin_reservations','admin_staff','admin_settings','admin_feedback']::text[]);
UPDATE public.staff_view_scopes s SET menus=array_append(s.menus,'attendance')
WHERE public.has_role(s.user_id,'internal') AND NOT ('attendance'=ANY(s.menus));

CREATE OR REPLACE FUNCTION public.register_inventory_product(_id uuid,_name text,_price numeric,_stock numeric,_unit text DEFAULT '개')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior public.products;
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '제품 등록 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _id IS NULL OR _name IS NULL OR char_length(btrim(_name)) NOT BETWEEN 1 AND 100 OR _price IS NULL OR _price<0 OR _price>999999999999 OR _price<>round(_price,2) OR _stock IS NULL OR _stock NOT BETWEEN 0 AND 100000000 OR _stock<>round(_stock,3) OR _unit IS NULL OR char_length(btrim(_unit)) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION '제품명, 판매가, 현재 보유 수량을 확인해 주세요.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_id::text,4));
 SELECT * INTO prior FROM public.products WHERE id=_id;
 IF FOUND THEN
  IF prior.name=btrim(_name) AND prior.price=_price AND prior.unit=btrim(_unit) AND (_stock=0 OR EXISTS(SELECT 1 FROM public.stock_movements m WHERE m.id=_id AND m.product_id=_id AND m.quantity=_stock AND m.reason='초기 재고' AND m.created_by=auth.uid())) THEN RETURN _id; END IF;
  RAISE EXCEPTION '이미 등록된 제품입니다. 새로고침해 주세요.';
 END IF;
 INSERT INTO public.products(id,name,price,stock,unit) VALUES(_id,btrim(_name),_price,_stock,btrim(_unit));
 IF _stock>0 THEN INSERT INTO public.stock_movements(id,product_id,quantity,reason,movement_kind) VALUES(_id,_id,_stock,'초기 재고','initial'); END IF;
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.register_inventory_product(uuid,text,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_inventory_product(uuid,text,numeric,numeric,text) TO authenticated;


NOTIFY pgrst, 'reload schema';
