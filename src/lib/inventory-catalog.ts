import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
export type InventoryProduct = Database["public"]["Tables"]["products"]["Row"];
export const inventoryRoutesQuery = queryOptions({ queryKey: ["inventory-routes"], queryFn: async () => {
  const { data, error } = await supabase.from("product_routes").select("*").order("sort_order").order("name");
  if (error) throw error; return data;
} });
