CREATE OR REPLACE FUNCTION public.product_inventory_overview(_from date,_to date)
RETURNS TABLE(product_id uuid,received bigint,sold bigint,sales_amount numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_manage_sales() THEN RAISE EXCEPTION '제품 현황 열람 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to<_from THEN RAISE EXCEPTION '조회 기간을 확인해 주세요.'; END IF;
 RETURN QUERY WITH intake AS (
  SELECT m.product_id AS pid,sum(m.quantity) AS qty FROM public.stock_movements m
  WHERE m.quantity>0 AND m.reservation_id IS NULL
   AND m.created_at>=(_from::timestamp AT TIME ZONE 'Asia/Seoul')
   AND m.created_at<((_to+1)::timestamp AT TIME ZONE 'Asia/Seoul')
  GROUP BY m.product_id
 ), sales AS (
  SELECT s.product_id AS pid,s.quantity::bigint AS qty,s.quantity*s.unit_price AS amount
  FROM public.work_product_sales s WHERE s.paid_on BETWEEN _from AND _to
  UNION ALL
  SELECT (sale->>'product_id')::uuid,(sale->>'quantity')::bigint,(sale->>'quantity')::numeric*(sale->>'unit_price')::numeric
  FROM public.customer_payments cp CROSS JOIN LATERAL jsonb_array_elements(cp.sales) sale
  WHERE cp.paid_on BETWEEN _from AND _to
 ), totals AS (
  SELECT s.pid,sum(s.qty)::bigint AS qty,sum(s.amount) AS amount FROM sales s GROUP BY s.pid
 )
 SELECT p.id,coalesce(i.qty,0)::bigint,coalesce(t.qty,0),coalesce(t.amount,0)
 FROM public.products p LEFT JOIN intake i ON i.pid=p.id LEFT JOIN totals t ON t.pid=p.id;
END $$;
REVOKE ALL ON FUNCTION public.product_inventory_overview(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.product_inventory_overview(date,date) TO authenticated;
