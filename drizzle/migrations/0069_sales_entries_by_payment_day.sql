-- Keep each report's authorization, filters, and payment calculations intact.
-- The detail rows aggregate by customer and payment day within the selected period.
DO $migration$
DECLARE
  report_function regprocedure;
  definition text;
BEGIN
  FOREACH report_function IN ARRAY ARRAY[
    'public.admin_sales_entries(date,date,text,text,uuid,boolean,text,integer)'::regprocedure,
    'public.admin_sales_entries(date,date,text,uuid,text,uuid,boolean,text,integer)'::regprocedure,
    'public.my_route_sales_entries(date,date,text,integer,uuid)'::regprocedure
  ]
  LOOP
    definition := pg_get_functiondef(report_function);
    IF strpos(definition, 'GROUP BY e.group_id' || chr(10)) = 0 THEN
      RAISE EXCEPTION 'Unexpected grouping in %', report_function;
    END IF;
    EXECUTE replace(definition, 'GROUP BY e.group_id' || chr(10),
      'GROUP BY e.group_id, e.paid_on' || chr(10));
  END LOOP;
END
$migration$;
