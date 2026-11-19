import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { endOfMonth, endOfWeek, endOfYear, format, startOfMonth, startOfWeek, startOfYear } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { meQuery } from "@/lib/app";
import { MONEY_COLUMNS, PAYMENT_KINDS, paymentDraft } from "@/lib/payments";
import { PaymentFields } from "@/components/PaymentFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PaymentHistory({ customerId, reservationId, global = false }: { customerId?: string; reservationId?: string; global?: boolean }) {
  const { data: me } = useQuery(meQuery);
  const allowed = me?.role === "admin" || me?.role === "internal";
  const [period, setPeriod] = useState("all");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [page, setPage] = useState(0);
  const d = new Date(`${date}T12:00`);
  const validDate = !Number.isNaN(d.getTime());
  const selectedPeriod = me?.role === "internal" && period === "all" ? "day" : period;
  const from = selectedPeriod === "day" ? d : selectedPeriod === "week" ? startOfWeek(d, { weekStartsOn: 1 }) : selectedPeriod === "month" ? startOfMonth(d) : selectedPeriod === "year" ? startOfYear(d) : null;
  const to = selectedPeriod === "day" ? d : selectedPeriod === "week" ? endOfWeek(d, { weekStartsOn: 1 }) : selectedPeriod === "month" ? endOfMonth(d) : selectedPeriod === "year" ? endOfYear(d) : null;
  const fromText = validDate && from ? format(from, "yyyy-MM-dd") : undefined;
  const toText = validDate && to ? format(to, "yyyy-MM-dd") : undefined;
  const entries = useQuery({
    queryKey: ["payments", customerId, reservationId, fromText, toText, page],
    enabled: !!allowed && validDate,
    queryFn: async () => {
      let q = supabase.from("customer_payments").select("*").order("paid_on", { ascending: false }).order("reservation_id");
      if (customerId) q = q.eq("customer_id", customerId);
      if (reservationId) q = q.eq("reservation_id", reservationId);
      if (fromText) q = q.gte("paid_on", fromText);
      if (toText) q = q.lte("paid_on", toText);
      const { data, error } = await q.range(page * 20, page * 20 + 19);
      if (error) throw error;
      return data;
    },
  });
  const workSales = useQuery({
    queryKey: ["work-sales", "payments", customerId, fromText, toText, page], enabled: !!allowed && !reservationId && validDate,
    queryFn: async () => {
      let q = supabase.from("work_product_sales").select("*").order("paid_on", { ascending: false }).order("id");
      if (customerId) q = q.eq("customer_id", customerId);
      if (fromText) q = q.gte("paid_on", fromText);
      if (toText) q = q.lte("paid_on", toText);
      const { data, error } = await q.range(page * 20, page * 20 + 19);
      if (error) throw error; return data;
    },
  });
  const summary = useQuery({
    queryKey: ["payment-summary", me?.role, customerId, fromText, toText],
    enabled: !!allowed && !reservationId && validDate,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(me?.role === "admin" ? "payment_summary" : "product_payment_summary", { ...(customerId ? { _customer: customerId } : {}), ...(fromText ? { _from: fromText } : {}), ...(toText ? { _to: toText } : {}) });
      if (error) throw error;
      return data;
    },
  });
  if (!allowed) return null;
  return <section className="space-y-3 border-t pt-4">
    <h3 className="font-semibold text-primary">{reservationId ? "이 예약의 계산 내역" : global ? "전체 계산 내역" : "고객 계산 내역"}</h3>
    {!reservationId && <div className="flex flex-wrap gap-2">
      <select aria-label="계산 조회 기간" className="h-10 rounded border bg-background px-2 text-sm" value={selectedPeriod} onChange={(e) => { setPeriod(e.target.value); setPage(0); }}>
        {me?.role === "admin" && <option value="all">전체 내역</option>}<option value="day">일별</option><option value="week">주간</option><option value="month">월별</option>{me?.role === "admin" && <option value="year">연별</option>}
      </select>
      {selectedPeriod !== "all" && <Input aria-label="계산 조회 기준일" type="date" className="w-44" value={date} onChange={(e) => { setDate(e.target.value); setPage(0); }} />}
    </div>}
    {!reservationId && allowed && <div className="overflow-x-auto rounded border p-3">
      <h4 className="mb-2 text-sm font-semibold">{me?.role === "internal" ? "제품판매 합계" : customerId && period === "all" ? "고객 누적 합계" : "조회 기간 총 수납 합계"} · 통화별</h4>
      {summary.error && <p role="alert">합계를 불러오지 못했습니다.</p>}
      {summary.isPending && <p>합계를 불러오는 중입니다.</p>}
      <table className="w-full min-w-[520px] text-sm"><thead><tr><th className="text-left">내용</th>{MONEY_COLUMNS.map(([k, label]) => <th key={k} className="text-right">{label}</th>)}</tr></thead>
        <tbody>{(me?.role === "admin" ? [...PAYMENT_KINDS, ["total", "합계"] as const] : [["product", "제품판매 합계"] as const]).map(([kind, label]) => <tr key={kind}><th className="text-left">{label}</th>{MONEY_COLUMNS.map(([k]) => <td key={k} className="text-right">{Number(summary.data?.find((r) => r.kind === kind)?.[k] ?? 0).toLocaleString("ko-KR")}</td>)}</tr>)}</tbody>
      </table>
    </div>}
    {entries.isPending && <p>계산 내역을 불러오는 중입니다.</p>}
    {entries.error && <p role="alert" className="text-sm text-destructive">계산 내역을 불러오지 못했습니다.</p>}
    {entries.data?.length === 0 && (reservationId || workSales.data?.length === 0) && <p className="text-sm text-muted-foreground">등록된 계산 내역이 없습니다.</p>}
    {entries.data?.map((entry) => <details key={entry.reservation_id} className="rounded border p-3">
      <summary className="cursor-pointer text-sm font-medium">{entry.paid_on} · 계산 내역</summary>
      <PaymentFields value={paymentDraft(entry)} />
      {!reservationId && <Button asChild size="sm" variant="outline" className="mt-2"><Link to="/reservations/new" search={{ id: entry.reservation_id }}>연결된 예약·계산 수정</Link></Button>}
    </details>)}
    {!reservationId && workSales.error && <p role="alert">WORK 제품판매 내역을 불러오지 못했습니다.</p>}
    {!reservationId && workSales.data?.map((sale) => <div key={sale.id} className="rounded border p-3 text-sm">{sale.paid_on} · WORK 제품판매 · {sale.product_name} {sale.quantity}개 · {(sale.quantity * Number(sale.unit_price)).toLocaleString("ko-KR")}원 · {sale.method === "card" ? "카드" : "현금"}{sale.memo && <p>{sale.memo}</p>}</div>)}
    {!reservationId && <div className="flex gap-2"><Button type="button" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>이전</Button><Button type="button" variant="outline" disabled={entries.data?.length !== 20 && workSales.data?.length !== 20} onClick={() => setPage(page + 1)}>다음</Button></div>}
  </section>;
}
