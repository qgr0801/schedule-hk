CREATE TABLE public.product_routes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 30),
 sort_order integer NOT NULL DEFAULT 0,
 deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX product_routes_live_name ON public.product_routes(lower(btrim(name))) WHERE deleted_at IS NULL;
REVOKE ALL ON public.product_routes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.product_routes TO authenticated;
GRANT ALL ON public.product_routes TO service_role;
ALTER TABLE public.product_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read inventory routes" ON public.product_routes FOR SELECT TO authenticated USING((SELECT public.can_manage_sales()));
ALTER TABLE public.products ADD COLUMN route_id uuid REFERENCES public.product_routes(id), ADD COLUMN deleted_at timestamptz, ADD COLUMN stock_confirmed boolean NOT NULL DEFAULT true, ADD COLUMN import_key text UNIQUE;
CREATE INDEX products_route ON public.products(route_id);
CREATE TABLE public.product_catalog_history (
 id uuid PRIMARY KEY,
 product_id uuid NOT NULL REFERENCES public.products(id),
 action text NOT NULL,
 request jsonb NOT NULL,
 old_data jsonb NOT NULL,
 new_data jsonb NOT NULL,
 changed_by uuid NOT NULL DEFAULT auth.uid(),
 changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_catalog_history_product ON public.product_catalog_history(product_id,changed_at);
REVOKE ALL ON public.product_catalog_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.product_catalog_history TO authenticated;
GRANT ALL ON public.product_catalog_history TO service_role;
ALTER TABLE public.product_catalog_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read product changes" ON public.product_catalog_history FOR SELECT TO authenticated USING((SELECT public.can_manage_sales()));

CREATE FUNCTION public.limit_inventory_routes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.deleted_at IS NULL AND (TG_OP='INSERT' OR OLD.deleted_at IS NOT NULL) THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('inventory-route-limit',6));
  IF (SELECT count(*) FROM public.product_routes WHERE deleted_at IS NULL AND id<>NEW.id)>=10 THEN RAISE EXCEPTION '경로는 최대 10개까지 등록할 수 있습니다.'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.limit_inventory_routes() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER limit_inventory_routes BEFORE INSERT OR UPDATE ON public.product_routes FOR EACH ROW EXECUTE FUNCTION public.limit_inventory_routes();
CREATE FUNCTION public.save_inventory_route(_id uuid,_name text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '경로 관리 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _id IS NULL OR char_length(btrim(coalesce(_name,''))) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION '경로명은 1~30자로 입력해 주세요.'; END IF;
 INSERT INTO public.product_routes(id,name,sort_order) VALUES(_id,btrim(_name),coalesce((SELECT max(sort_order)+1 FROM public.product_routes),0))
 ON CONFLICT(id) DO UPDATE SET name=excluded.name,deleted_at=NULL;
 RETURN _id;
END $$;
CREATE FUNCTION public.delete_inventory_route(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '경로 관리 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.product_routes WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '경로를 찾을 수 없습니다.'; END IF;
 IF EXISTS(SELECT 1 FROM public.products WHERE route_id=_id AND deleted_at IS NULL) THEN RAISE EXCEPTION '이 경로의 제품을 다른 경로로 옮기거나 삭제한 뒤 경로를 삭제해 주세요.'; END IF;
 UPDATE public.product_routes SET deleted_at=coalesce(deleted_at,now()) WHERE id=_id;
END $$;
CREATE FUNCTION public.protect_product_catalog() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.deleted_at IS NOT NULL THEN NEW.is_active:=false; RETURN NEW; END IF;
 IF NEW.route_id IS NOT NULL THEN
  PERFORM 1 FROM public.product_routes WHERE id=NEW.route_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '사용 중인 경로를 선택해 주세요.'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_product_catalog() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER protect_product_catalog BEFORE INSERT OR UPDATE OF route_id,is_active,deleted_at ON public.products FOR EACH ROW EXECUTE FUNCTION public.protect_product_catalog();
CREATE FUNCTION public.register_routed_product(_id uuid,_name text,_price numeric,_stock numeric,_unit text,_route uuid DEFAULT NULL,_stock_confirmed boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products;
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '제품 등록 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_id::text,4));
 SELECT * INTO p FROM public.products WHERE id=_id FOR UPDATE;
 IF FOUND AND (p.deleted_at IS NOT NULL OR p.route_id IS DISTINCT FROM _route) THEN RAISE EXCEPTION '이미 등록된 제품입니다. 제품 수정에서 변경해 주세요.'; END IF;
 IF _route IS NOT NULL THEN
  PERFORM 1 FROM public.product_routes WHERE id=_route AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '경로를 확인해 주세요.'; END IF;
 END IF;
 PERFORM public.register_inventory_product(_id,_name,_price,_stock,_unit);
 IF p.id IS NULL THEN UPDATE public.products SET route_id=_route,stock_confirmed=coalesce(_stock_confirmed,true) WHERE id=_id; END IF;
 RETURN _id;
END $$;
CREATE FUNCTION public.edit_inventory_product(_id uuid,_event uuid,_name text,_price numeric,_unit text,_route uuid DEFAULT NULL,_initial_stock numeric DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products; prior public.product_catalog_history; payload jsonb; delta numeric; kind text;
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '제품 수정 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _event IS NULL OR char_length(btrim(coalesce(_name,''))) NOT BETWEEN 1 AND 100 OR _price IS NULL OR _price NOT BETWEEN 0 AND 999999999999 OR _price<>round(_price,2) OR char_length(btrim(coalesce(_unit,''))) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION '제품명·판매가·단위를 확인해 주세요.'; END IF;
 IF _initial_stock IS NOT NULL AND (_initial_stock NOT BETWEEN 0 AND 100000000 OR _initial_stock<>round(_initial_stock,3)) THEN RAISE EXCEPTION '초기 수량은 0 이상, 소수점 3자리까지 입력해 주세요.'; END IF;
 payload:=jsonb_build_object('name',btrim(_name),'price',_price,'unit',btrim(_unit),'route',_route,'initial_stock',_initial_stock);
 PERFORM pg_advisory_xact_lock(hashtextextended(_event::text,7));
 SELECT * INTO prior FROM public.product_catalog_history WHERE id=_event;
 IF FOUND THEN
  IF prior.product_id=_id AND prior.changed_by=auth.uid() AND prior.request=payload THEN RETURN _id; END IF;
  RAISE EXCEPTION '이미 처리한 수정 요청입니다. 새로고침해 주세요.';
 END IF;
 SELECT * INTO p FROM public.products WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR p.deleted_at IS NOT NULL THEN RAISE EXCEPTION '수정할 제품을 찾을 수 없습니다.'; END IF;
 IF _initial_stock IS NOT NULL AND p.stock_confirmed THEN RAISE EXCEPTION '이미 확인된 재고입니다. 수량 변경은 입출고 기록을 이용해 주세요.'; END IF;
 UPDATE public.products SET name=btrim(_name),price=_price,unit=btrim(_unit),route_id=_route WHERE id=_id;
 IF _initial_stock IS NOT NULL THEN
  delta:=_initial_stock-p.stock;
  IF delta<>0 THEN
   kind:=CASE WHEN EXISTS(SELECT 1 FROM public.stock_movements WHERE product_id=_id) THEN 'adjustment' ELSE 'initial' END;
   INSERT INTO public.stock_movements(id,product_id,quantity,reason,movement_kind) VALUES(_event,_id,delta,'초기 재고 확인',kind);
  END IF;
  UPDATE public.products SET stock=_initial_stock,stock_confirmed=true WHERE id=_id;
 END IF;
 INSERT INTO public.product_catalog_history(id,product_id,action,request,old_data,new_data) SELECT _event,_id,'edit',payload,to_jsonb(p),to_jsonb(n) FROM public.products n WHERE n.id=_id;
 RETURN _id;
END $$;
CREATE FUNCTION public.set_inventory_product_deleted(_id uuid,_event uuid,_deleted boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products; prior public.product_catalog_history; payload jsonb;
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '제품 관리 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _event IS NULL OR _deleted IS NULL THEN RAISE EXCEPTION '제품 상태를 확인해 주세요.'; END IF;
 payload:=jsonb_build_object('deleted',_deleted);
 PERFORM pg_advisory_xact_lock(hashtextextended(_event::text,7));
 SELECT * INTO prior FROM public.product_catalog_history WHERE id=_event;
 IF FOUND THEN
  IF prior.product_id=_id AND prior.changed_by=auth.uid() AND prior.request=payload THEN RETURN _id; END IF;
  RAISE EXCEPTION '이미 처리된 요청입니다.';
 END IF;
 SELECT * INTO p FROM public.products WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '제품을 찾을 수 없습니다.'; END IF;
 UPDATE public.products SET deleted_at=CASE WHEN _deleted THEN coalesce(deleted_at,now()) ELSE NULL END,is_active=NOT _deleted,
 route_id=CASE WHEN NOT _deleted AND EXISTS(SELECT 1 FROM public.product_routes WHERE id=p.route_id AND deleted_at IS NOT NULL) THEN NULL ELSE route_id END WHERE id=_id;
 INSERT INTO public.product_catalog_history(id,product_id,action,request,old_data,new_data) SELECT _event,_id,CASE WHEN _deleted THEN 'delete' ELSE 'restore' END,payload,to_jsonb(p),to_jsonb(n) FROM public.products n WHERE n.id=_id;
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.save_inventory_route(uuid,text),public.delete_inventory_route(uuid),public.register_routed_product(uuid,text,numeric,numeric,text,uuid,boolean),public.edit_inventory_product(uuid,uuid,text,numeric,text,uuid,numeric),public.set_inventory_product_deleted(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_inventory_route(uuid,text),public.delete_inventory_route(uuid),public.register_routed_product(uuid,text,numeric,numeric,text,uuid,boolean),public.edit_inventory_product(uuid,uuid,text,numeric,text,uuid,numeric),public.set_inventory_product_deleted(uuid,uuid,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
