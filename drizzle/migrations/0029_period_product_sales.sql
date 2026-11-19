CREATE FUNCTION public.product_sales_report(_from date,_to date,_offset integer DEFAULT 0)
RETURNS TABLE(sale_key text,paid_on date,customer_name text,product_name text,quantity numeric,unit text,unit_price numeric,sales_amount numeric,reservation_id uuid,source text,total_count bigint,total_amount numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '제품 판매내역 열람 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to<_from THEN RAISE EXCEPTION '조회 기간을 확인해 주세요.'; END IF;
 RETURN QUERY WITH sales AS (
  SELECT cp.reservation_id::text||':'||(v->>'product_id') AS sale_key,cp.paid_on,
   coalesce(nullif(r.customer_name,''),c.name,'고객 미지정') AS customer_name,
   coalesce(nullif(v->>'name',''),p.name,'제품') AS product_name,(v->>'quantity')::numeric AS quantity,
   coalesce(p.unit,'개') AS unit,(v->>'unit_price')::numeric AS unit_price,
   round((v->>'quantity')::numeric*(v->>'unit_price')::numeric,2) AS sales_amount,cp.reservation_id,'예약 구매'::text AS source
  FROM public.customer_payments cp CROSS JOIN LATERAL jsonb_array_elements(cp.sales) v
  LEFT JOIN public.reservations r ON r.id=cp.reservation_id LEFT JOIN public.customers c ON c.id=cp.customer_id
  LEFT JOIN public.products p ON p.id=(v->>'product_id')::uuid
  WHERE cp.paid_on BETWEEN _from AND _to
  UNION ALL
  SELECT w.id::text,w.paid_on,coalesce(c.name,'고객 미지정'),w.product_name,w.quantity,coalesce(p.unit,'개'),w.unit_price,round(w.quantity*w.unit_price,2),NULL::uuid,'예약 외 판매'::text
  FROM public.work_product_sales w LEFT JOIN public.customers c ON c.id=w.customer_id LEFT JOIN public.products p ON p.id=w.product_id
  WHERE w.paid_on BETWEEN _from AND _to
 )
 SELECT s.sale_key,s.paid_on,s.customer_name,s.product_name,s.quantity,s.unit,s.unit_price,s.sales_amount,s.reservation_id,s.source,count(*) OVER(),sum(s.sales_amount) OVER()
 FROM sales s ORDER BY s.paid_on DESC,s.sale_key LIMIT 50 OFFSET greatest(coalesce(_offset,0),0);
END $$;
REVOKE ALL ON FUNCTION public.product_sales_report(date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.product_sales_report(date,date,integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
