import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const employeesQuery = queryOptions({
  queryKey: ["employees"],
  queryFn: async () => {
    const { data, error } = await supabase.from("employees").select("*").order("name").order("id");
    if (error) throw error;
    return data;
  },
});
