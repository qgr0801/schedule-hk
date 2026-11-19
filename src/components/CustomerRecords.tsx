import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { PaymentHistory } from "@/components/PaymentHistory";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProductSale } from "@/lib/payments";

export function CustomerRecords({ customerId, children }: { customerId: string; children: ReactNode }) {
  const services = useQuery({
    queryKey: ["customer-services", customerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("reservations").select("id,start_at,service,service_detail")
        .eq("customer_id", customerId).in("status", ["completed", "paid"]).order("start_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });
  const purchases = useQuery({
    queryKey: ["customer-products", customerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_payments").select("*").eq("customer_id", customerId).order("paid_on", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });
  return <Tabs defaultValue="reservations" className="border-t pt-4">
    <TabsList className="flex h-auto flex-wrap justify-start">
      <TabsTrigger value="services">서비스내역</TabsTrigger><TabsTrigger value="reservations">예약내역</TabsTrigger><TabsTrigger value="products">제품구매</TabsTrigger><TabsTrigger value="payments">계산</TabsTrigger>
    </TabsList>
    <TabsContent value="services">
      <p className="mb-2 text-xs text-muted-foreground">최근 완료된 예약 최대 100건</p>
      {services.error && <p role="alert">서비스 내역을 불러오지 못했습니다.</p>}
      {services.data?.length === 0 && <p className="text-sm">완료된 서비스 내역이 없습니다.</p>}
      {services.data?.map((r) => <div key={r.id} className="border-b py-2 text-sm"><Link to="/reservations/new" search={{ id: r.id }}>{format(new Date(r.start_at), "yyyy.MM.dd")} · {r.service}{r.service_detail && ` · ${r.service_detail}`}</Link></div>)}
    </TabsContent>
    <TabsContent value="reservations">{children}</TabsContent>
    <TabsContent value="products">
      <p className="mb-2 text-xs text-muted-foreground">최근 계산 내역 최대 100건의 제품 판매</p>
      {purchases.error && <p role="alert">제품구매 내역을 불러오지 못했습니다.</p>}
      {purchases.data?.every((p) => !(p.sales as unknown as ProductSale[]).length) && <p className="text-sm">제품구매 내역이 없습니다.</p>}
      {purchases.data?.flatMap((p) => (p.sales as unknown as ProductSale[]).map((sale) => <div key={`${p.reservation_id}-${sale.product_id}`} className="border-b py-2 text-sm">{p.paid_on} · {sale.name} · {sale.quantity}개 · 개당 {Number(sale.unit_price ?? 0).toLocaleString("ko-KR")}원</div>))}
    </TabsContent>
    <TabsContent value="payments"><PaymentHistory customerId={customerId} /></TabsContent>
  </Tabs>;
}
