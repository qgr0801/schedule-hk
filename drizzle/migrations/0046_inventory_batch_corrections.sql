CREATE TABLE public.inventory_movement_corrections (
 id uuid PRIMARY KEY,
 movement_id uuid NOT NULL,
 before_record jsonb NOT NULL,
 after_record jsonb,
 changed_by uuid NOT NULL DEFAULT auth.uid(),
 changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.inventory_movement_corrections(movement_id);
ALTER TABLE public.inventory_movement_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_movement_corrections FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.record_inventory_batch(_rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item record;
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '재고 기록 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION '입력 내역을 확인해 주세요.'; END IF;
 IF jsonb_array_length(_rows) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION '한 번에 1~100줄을 등록할 수 있습니다.'; END IF;
 IF (SELECT count(DISTINCT event) FROM jsonb_to_recordset(_rows) AS t(event uuid))<>jsonb_array_length(_rows) THEN
  RAISE EXCEPTION '입력 행을 확인해 주세요.';
 END IF;
 FOR item IN SELECT t.* FROM jsonb_array_elements(_rows) WITH ORDINALITY AS a(row_data,position) CROSS JOIN LATERAL jsonb_to_record(a.row_data) AS t(event uuid,product uuid,kind text,quantity numeric,day date,note text) ORDER BY t.product,a.position LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(item.event::text,5));
  IF EXISTS (SELECT FROM public.inventory_movement_corrections WHERE movement_id=item.event) THEN
   RAISE EXCEPTION '이미 정정된 기록입니다. 최신 내역을 확인해 주세요.';
  END IF;
  PERFORM public.record_product_movement(item.event,item.product,item.kind,item.quantity,item.day,item.note);
 END LOOP;
END $$;

CREATE FUNCTION public.correct_inventory_movement(_id uuid,_event uuid,_expected_quantity numeric,_expected_date date,_expected_note text,_quantity numeric,_date date,_note text,_cancel boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE original public.stock_movements; current_stock numeric; replacement numeric; updated jsonb;
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '재고 정정 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _id IS NULL OR _event IS NULL OR _cancel IS NULL THEN RAISE EXCEPTION '정정 정보를 확인해 주세요.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_id::text,5));
 IF EXISTS (SELECT FROM public.inventory_movement_corrections WHERE id=_event AND movement_id=_id AND changed_by=auth.uid()) THEN RETURN; END IF;
 SELECT * INTO original FROM public.stock_movements WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR original.reservation_id IS NOT NULL OR original.movement_kind NOT IN ('receipt','usage','internal','adjustment') THEN
  RAISE EXCEPTION '정정 또는 취소할 수 있는 재고 기록을 선택해 주세요.';
 END IF;
 IF original.quantity IS DISTINCT FROM _expected_quantity OR original.effective_on IS DISTINCT FROM _expected_date OR original.reason IS DISTINCT FROM _expected_note THEN
  RAISE EXCEPTION '기록이 변경됐습니다. 내역을 새로고침해 주세요.';
 END IF;
 IF NOT _cancel AND (_quantity IS NULL OR _quantity=0 OR abs(_quantity)>100000000 OR _quantity<>round(_quantity,3)
  OR (original.movement_kind<>'adjustment' AND _quantity<0) OR _date IS NULL OR char_length(btrim(coalesce(_note,''))) NOT BETWEEN 1 AND 200) THEN
  RAISE EXCEPTION '수량, 날짜, 메모를 확인해 주세요.';
 END IF;
 replacement:=CASE WHEN _cancel THEN 0 WHEN original.movement_kind IN ('usage','internal') THEN -_quantity ELSE _quantity END;
 SELECT stock INTO current_stock FROM public.products WHERE id=original.product_id FOR UPDATE;
 IF current_stock+replacement-original.quantity<0 THEN
  RAISE EXCEPTION '정정 후 재고가 0보다 작아집니다. 이후 출고 기록을 확인해 주세요.';
 END IF;
 UPDATE public.products SET stock=stock+replacement-original.quantity WHERE id=original.product_id;
 IF _cancel THEN
  DELETE FROM public.stock_movements WHERE id=_id;
 ELSE
  UPDATE public.stock_movements SET quantity=replacement,effective_on=_date,reason=btrim(_note) WHERE id=_id;
  SELECT to_jsonb(m) INTO updated FROM public.stock_movements m WHERE m.id=_id;
 END IF;
 INSERT INTO public.inventory_movement_corrections(id,movement_id,before_record,after_record)
 VALUES(_event,_id,to_jsonb(original),updated);
END $$;
REVOKE ALL ON FUNCTION public.record_inventory_batch(jsonb), public.correct_inventory_movement(uuid,uuid,numeric,date,text,numeric,date,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_inventory_batch(jsonb), public.correct_inventory_movement(uuid,uuid,numeric,date,text,numeric,date,text,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
