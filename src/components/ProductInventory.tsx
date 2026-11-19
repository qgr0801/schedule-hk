import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { meQuery, dbErrorMessage } from "@/lib/app";
import { productsQuery } from "@/lib/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProductInventory() {
  const qc = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const admin = me?.role === "admin";
  const [reportFrom, setReportFrom] = useState(format(new Date(), "yyyy-MM-dd"));
  const [reportTo, setReportTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const validReport = !!reportFrom && !!reportTo && reportFrom <= reportTo;
  const overview = useQuery({ queryKey: ["product-overview", reportFrom, reportTo], enabled: validReport, queryFn: async () => {
    const { data, error } = await supabase.rpc("product_inventory_overview", { _from: reportFrom, _to: reportTo });
    if (error) throw error; return data;
  } });
  const [saleId, setSaleId] = useState(() => crypto.randomUUID());
  const [saleProduct, setSaleProduct] = useState("");
  const [saleQuantity, setSaleQuantity] = useState("1");
  const [saleDate, setSaleDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saleMethod, setSaleMethod] = useState("krw");
  const [saleMemo, setSaleMemo] = useState("");
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [salesPage, setSalesPage] = useState(0);
  const [stockPage, setStockPage] = useState(0);
  const customerSearch = useQuery({
    queryKey: ["work-customer-search", search], enabled: search.trim().length >= 2 && !customer,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name,customer_no").ilike("name", `%${search.trim().replace(/[%_]/g, "")}%`).order("name").limit(20);
      if (error) throw error; return data;
    },
  });
  const sales = useQuery({ queryKey: ["work-sales", salesPage], queryFn: async () => {
    const { data, error } = await supabase.from("work_product_sales").select("*").order("paid_on", { ascending: false }).order("created_at", { ascending: false }).order("id").range(salesPage * 30, salesPage * 30 + 29);
    if (error) throw error; return data;
  } });
  const movements = useQuery({ queryKey: ["stock-movements", stockPage], queryFn: async () => {
    const { data, error } = await supabase.from("stock_movements").select("*").order("created_at", { ascending: false }).order("id").range(stockPage * 30, stockPage * 30 + 29);
    if (error) throw error; return data;
  } });
  const { data, error, isPending } = useQuery(productsQuery);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [adjustment, setAdjustment] = useState<{ id: string; event: string } | null>(null);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("입고");

  async function run(action: () => PromiseLike<{ error: unknown }>) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await action();
      if (result.error) throw result.error;
      await qc.invalidateQueries({ queryKey: productsQuery.queryKey });
      await qc.invalidateQueries({ queryKey: ["stock-movements"] });
      await qc.invalidateQueries({ queryKey: ["product-overview"] });
      toast.success("제품 정보를 저장했습니다.");
      setName(""); setPrice(""); setAdjustment(null); setQuantity("");
    } catch (err) { toast.error(dbErrorMessage(err)); }
    finally { setBusy(false); }
  }

  async function sell(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !saleProduct || !saleDate || !Number.isInteger(Number(saleQuantity)) || Number(saleQuantity) <= 0) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("record_work_product_sale", { _id: saleId, _product: saleProduct, _quantity: Number(saleQuantity), _paid_on: saleDate, _method: saleMethod, _memo: saleMemo, ...(customer ? { _customer: customer.id } : {}) });
      if (error) throw error;
      await Promise.all(["product-overview", "products", "work-sales", "stock-movements", "customer-products", "customer-work-products", "payment-summary"].map((key) => qc.invalidateQueries({ queryKey: [key] })));
      setSaleId(crypto.randomUUID()); setSaleProduct(""); setSaleQuantity("1"); setSaleMemo(""); setCustomer(null); setSearch(""); setSalesPage(0);
      toast.success("판매를 등록하고 재고를 차감했습니다.");
    } catch (err) { toast.error(dbErrorMessage(err)); }
    finally { setBusy(false); }
  }
  const selected = data?.find((p) => p.id === saleProduct);
  return <section className="space-y-4">
    <h3 className="font-semibold">제품 · 입고 · 판매 · 재고</h3>
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-sm">조회 시작일<Input aria-label="제품 조회 시작일" type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} /></label>
      <label className="text-sm">조회 종료일<Input aria-label="제품 조회 종료일" type="date" min={reportFrom} value={reportTo} onChange={(e) => setReportTo(e.target.value)} /></label>
      <Button variant="outline" onClick={() => { const today = format(new Date(), "yyyy-MM-dd"); setReportFrom(today); setReportTo(today); }}>오늘</Button>
    </div>
    {!validReport && <p role="alert">조회 기간을 확인해 주세요.</p>}
    {overview.error && <p role="alert">제품 현황을 불러오지 못했습니다.</p>}
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {[["입고·증가 수량", `${overview.data?.reduce((sum, r) => sum + Number(r.received), 0) ?? 0}개`], ["판매 수량", `${overview.data?.reduce((sum, r) => sum + Number(r.sold), 0) ?? 0}개`], ["제품 판매금액", `${(overview.data?.reduce((sum, r) => sum + Number(r.sales_amount), 0) ?? 0).toLocaleString("ko-KR")}원`], ["재고 부족 제품", `${data?.filter((p) => p.is_active && p.stock <= 3).length ?? 0}종`]].map(([label, value]) => <div key={label} className="rounded-lg bg-muted p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{(label === "재고 부족 제품" ? !data : overview.isPending || !validReport || overview.error) ? "—" : value}</p></div>)}
    </div>
    <p className="text-xs text-muted-foreground">입고·증가는 등록일(한국 시간), 판매는 판매일 기준입니다. 현재 재고는 조회 기간과 관계없는 최신 수량이며, 3개 이하는 부족으로 표시합니다. 판매금액은 제품별 등록 판매가 기준입니다.</p>
    {admin && <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void run(() => supabase.from("products").insert({ name: name.trim(), price: Number(price) || 0 })); }}>
      <Input aria-label="새 제품명" placeholder="제품명" maxLength={100} className="flex-1" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input aria-label="제품 판매가" placeholder="판매가(원)" className="w-36" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
      <Button disabled={busy || !name.trim()}>제품 등록</Button>
    </form>}
    {isPending && <p>제품을 불러오는 중입니다.</p>}
    {error && <p role="alert">제품 목록을 불러오지 못했습니다.</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead><tr><th className="text-left">제품</th><th>판매가(원)</th><th>입고·증가</th><th>판매 수량</th><th>판매금액(원)</th><th>현재 재고</th>{admin && <th>관리</th>}</tr></thead>
      <tbody>{data?.map((p) => <tr key={p.id} className="border-b"><td className="py-3">{p.name}{!p.is_active && " · 사용 중지"}</td><td className="text-right">{Number(p.price).toLocaleString("ko-KR")}</td><td className="text-center">{overview.data?.find((r) => r.product_id === p.id)?.received ?? "—"}</td><td className="text-center">{overview.data?.find((r) => r.product_id === p.id)?.sold ?? "—"}</td><td className="text-right">{overview.data ? Number(overview.data.find((r) => r.product_id === p.id)?.sales_amount ?? 0).toLocaleString("ko-KR") : "—"}</td><td className={`text-center font-bold ${p.stock === 0 ? "text-destructive" : p.stock <= 3 ? "text-amber-700" : ""}`}>{p.stock}개{p.is_active && p.stock <= 3 && <span className="ml-1 text-xs">{p.stock === 0 ? "품절" : "부족"}</span>}</td>{admin && <td className="flex flex-wrap justify-end gap-1 py-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setAdjustment({ id: p.id, event: crypto.randomUUID() }); setQuantity(""); }}>입고·재고 조정</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run(() => supabase.from("products").update({ is_active: !p.is_active }).eq("id", p.id))}>{p.is_active ? "사용 중지" : "다시 사용"}</Button>
      </td>}</tr>)}</tbody>
    </table></div>
    {admin && adjustment && <div className="space-y-2 rounded border p-3">
      <p className="text-sm font-semibold">{data?.find((p) => p.id === adjustment.id)?.name} · 입고·재고 조정</p>
      <label className="block text-sm">수량<Input aria-label="재고 조정 수량" type="number" step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="입고는 양수, 반품·감소는 음수" /></label>
      <Input aria-label="재고 조정 사유" placeholder="사유" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button disabled={busy || !Number.isInteger(Number(quantity)) || !Number(quantity) || !reason.trim()} onClick={() => run(() => supabase.rpc("adjust_product_stock", { _event: adjustment.event, _product: adjustment.id, _quantity: Number(quantity), _reason: reason.trim() }))}>재고 저장</Button>
      <Button variant="outline" disabled={busy} onClick={() => setAdjustment(null)}>닫기</Button>
    </div>}

    <form onSubmit={sell} className="space-y-3 rounded border p-3">
      <h4 className="font-semibold">제품 판매 등록</h4>
      <p className="text-xs text-muted-foreground">저장 시 재고가 차감되고 결제내역에 합산됩니다. 예약의 제품 행에는 설명만 적고 같은 판매 금액을 중복 입력하지 마세요.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">판매일<Input type="date" aria-label="제품 판매일" required disabled={busy} value={saleDate} onChange={(e) => setSaleDate(e.target.value)} /></label>
        <label className="text-sm">제품<select aria-label="판매 제품" className="h-10 w-full rounded border bg-background px-2" required disabled={busy} value={saleProduct} onChange={(e) => setSaleProduct(e.target.value)}><option value="">제품 선택</option>{data?.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name} · 재고 {p.stock}개</option>)}</select></label>
        <label className="text-sm">판매 수량<Input aria-label="판매 수량" type="number" required min={1} max={100000} step={1} disabled={busy} value={saleQuantity} onChange={(e) => setSaleQuantity(e.target.value)} /></label>
        <label className="text-sm">결제 방법<select aria-label="제품 결제 방법" className="h-10 w-full rounded border bg-background px-2" disabled={busy} value={saleMethod} onChange={(e) => setSaleMethod(e.target.value)}><option value="krw">원 (현금)</option><option value="card">카드 (원)</option></select></label>
      </div>
      <p className="text-sm font-semibold">판매금액: {((selected?.price ?? 0) * (Number(saleQuantity) || 0)).toLocaleString("ko-KR")}원</p>
      <label className="block text-sm">고객 연결 (선택)<Input aria-label="판매 고객 검색" placeholder="고객명 두 글자 이상 검색" disabled={busy} value={customer ? customer.name : search} onChange={(e) => { setCustomer(null); setSearch(e.target.value); }} /></label>
      {customerSearch.error && !customer && <p role="alert">고객 검색에 실패했습니다.</p>}
      {!customer && search.trim().length >= 2 && <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto">{customerSearch.data?.map((c) => <Button type="button" key={c.id} size="sm" variant="outline" disabled={busy} onClick={() => setCustomer(c)}>{c.name} · No.{c.customer_no}</Button>)}{customerSearch.data?.length === 0 && <p className="text-sm">검색된 고객이 없습니다.</p>}</div>}
      <Input aria-label="제품 판매 메모" placeholder="판매 내용·메모" maxLength={500} disabled={busy} value={saleMemo} onChange={(e) => setSaleMemo(e.target.value)} />
      <Button disabled={busy || !selected || Number(saleQuantity) <= 0}>판매 저장 · 재고 차감</Button>
    </form>
    <div className="space-y-2 border-t pt-3"><h4 className="font-semibold">판매 내역</h4>
      {sales.error && <p role="alert">판매 내역을 불러오지 못했습니다.</p>}{sales.isPending && <p>불러오는 중입니다.</p>}
      {sales.data?.map((s) => <div className="rounded border p-2 text-sm" key={s.id}>{s.paid_on} · {s.product_name} · {s.quantity}개 · {(s.quantity * Number(s.unit_price)).toLocaleString("ko-KR")}원 · {s.method === "card" ? "카드" : "현금"}{s.memo && <p>{s.memo}</p>}</div>)}
      {sales.data?.length === 0 && <p className="text-sm">등록된 판매가 없습니다.</p>}
      <div className="flex gap-2"><Button variant="outline" disabled={salesPage === 0} onClick={() => setSalesPage(salesPage - 1)}>이전</Button><Button variant="outline" disabled={sales.data?.length !== 30} onClick={() => setSalesPage(salesPage + 1)}>다음</Button></div>
    </div>
    <div className="space-y-2 border-t pt-3"><h4 className="font-semibold">입고·출고 기록</h4>
      {movements.error && <p role="alert">입출고 기록을 불러오지 못했습니다.</p>}{movements.isPending && <p>불러오는 중입니다.</p>}
      {movements.data?.map((m) => <div className="border-b py-2 text-sm" key={m.id}>{format(new Date(m.created_at), "yyyy.MM.dd HH:mm")} · {data?.find((p) => p.id === m.product_id)?.name ?? "제품"} · {m.quantity > 0 ? `+${m.quantity}` : m.quantity}개 · {m.reason}</div>)}
      {movements.data?.length === 0 && <p className="text-sm">입출고 기록이 없습니다.</p>}
      <div className="flex gap-2"><Button variant="outline" disabled={stockPage === 0} onClick={() => setStockPage(stockPage - 1)}>이전</Button><Button variant="outline" disabled={movements.data?.length !== 30} onClick={() => setStockPage(stockPage + 1)}>다음</Button></div>
    </div>
  </section>;
}
