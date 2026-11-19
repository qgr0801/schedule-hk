import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
export const bookingRoutesQuery = queryOptions({ queryKey: ["booking-routes"], queryFn: async () => {
 const {data,error}=await supabase.from("booking_routes").select("*").order("name").order("id"); if(error)throw error;return data;
}});
