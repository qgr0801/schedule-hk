import { meQuery } from "@/lib/app";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { PaymentHistory } from "@/components/PaymentHistory";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MONEY_COLUMNS, type PaymentLine, type ProductSale } from "@/lib/payments";

export function CustomerRecords({ customerId, children, basicInfo }: { customerId: string; children: ReactNode; basicInfo?: ReactNode }) {
  const { data: me } = useQuery(meQuery);
  const canViewSales = !!me?.active && (me.role === "admin" || me.role === "internal");
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
    queryKey: ["customer-products", me?.id, customerId],
    enabled: canViewSales,
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_payments").select("*").eq("customer_id", customerId).order("paid_on", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });
  const workPurchases = useQuery({
    queryKey: ["customer-work-products", me?.id, customerId],
    enabled: canViewSales,
    queryFn: async () => {
      const { data, error } = await supabase.from("work_product_sales").select("*").eq("customer_id", customerId).order("paid_on", { ascending: false }).order("id").limit(100);
      if (error) throw error; return data;
    },
  });
  return <Tabs defaultValue={basicInfo ? "basic" : "reservations"} className="border-t pt-4">
    <TabsList className="flex h-auto flex-wrap justify-start">
      {basicInfo && <TabsTrigger value="basic">기본정보</TabsTrigger>}
      <TabsTrigger value="services">서비스내역</TabsTrigger><TabsTrigger value="reservations">예약내역</TabsTrigger>{canViewSales && <><TabsTrigger value="products">제품구매</TabsTrigger><TabsTrigger value="payments">계산</TabsTrigger></>}
    </TabsList>
    {basicInfo && <TabsContent value="basic" className="space-y-3">{basicInfo}</TabsContent>}
    <TabsContent value="services">
      <p className="mb-2 text-xs text-muted-foreground">최근 완료된 예약 최대 100건</p>
      {services.error && <p role="alert">서비스 내역을 불러오지 못했습니다.</p>}
      {services.data?.length === 0 && <p className="text-sm">완료된 서비스 내역이 없습니다.</p>}
      {services.data?.map((r) => <div key={r.id} className="border-b py-2 text-sm"><Link to="/reservations/new" search={{ id: r.id }}>{format(new Date(r.start_at), "yyyy.MM.dd")} · {r.service}{r.service_detail && ` · ${r.service_detail}`}</Link></div>)}
    </TabsContent>
    <TabsContent value="reservations">{children}</TabsContent>
    {canViewSales && <><TabsContent value="products">
      <p className="mb-2 text-xs text-muted-foreground">예약 연결 판매와 WORK 판매 각각 최근 100건</p>
      {(purchases.error || workPurchases.error) && <p role="alert">제품구매 내역을 불러오지 못했습니다.</p>}
      {purchases.data?.every((p) => !(p.sales as unknown as ProductSale[]).length && !(p.rows as unknown as PaymentLine[]).some((r) => r.kind === "product" && (r.description || MONEY_COLUMNS.some(([key]) => r[key] > 0)))) && workPurchases.data?.length === 0 && <p className="text-sm">제품구매 내역이 없습니다.</p>}
      {purchases.data?.flatMap((p) => (p.sales as unknown as ProductSale[]).map((sale) => <div key={`${p.reservation_id}-${sale.product_id}`} className="border-b py-2 text-sm">{p.paid_on} · {sale.name} · {sale.quantity}개 · 개당 {Number(sale.unit_price ?? 0).toLocaleString("ko-KR")}원</div>))}
      {purchases.data?.flatMap((p) => (p.rows as unknown as PaymentLine[]).filter((r) => r.kind === "product" && (r.description || MONEY_COLUMNS.some(([key]) => r[key] > 0))).map((r) => <div key={`${p.reservation_id}-product-content`} className="border-b py-2 text-sm">{p.paid_on} · {r.description || "예약 제품판매"}<p className="text-xs text-muted-foreground">{MONEY_COLUMNS.filter(([key]) => r[key] > 0).map(([key, label]) => `${label} ${r[key].toLocaleString("ko-KR")}`).join(" · ")}</p></div>))}
      {workPurchases.data?.map((s) => <div key={s.id} className="border-b py-2 text-sm">{s.paid_on} · {s.product_name} · {s.quantity}개 · {(s.quantity * Number(s.unit_price)).toLocaleString("ko-KR")}원{s.memo && ` · ${s.memo}`}</div>)}
    </TabsContent>
    <TabsContent value="payments"><PaymentHistory customerId={customerId} /></TabsContent></>}
  </Tabs>;
}
