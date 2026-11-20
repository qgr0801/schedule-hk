import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InventoryRoutes } from "@/components/InventoryRoutes";
import { InventoryCatalogManager } from "@/components/InventoryCatalogManager";
import { InventoryProductEditor } from "@/components/InventoryProductEditor";
import { inventoryRoutesQuery, type InventoryProduct } from "@/lib/inventory-catalog";
import { ProductSalesReport } from "@/components/ProductSalesReport";
import { ProductStockDetail } from "@/components/ProductStockDetail";
import { format, startOfMonth } from "date-fns";
import { meQuery, dbErrorMessage } from "@/lib/app";
import { productsQuery } from "@/lib/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProductInventory() {
  const qc = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const admin = me?.role === "admin";
  const [reportFrom, setReportFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [reportTo, setReportTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const validReport = !!reportFrom && !!reportTo && reportFrom <= reportTo;
  const overview = useQuery({ queryKey: ["product-overview", reportFrom, reportTo], enabled: admin && validReport, queryFn: async () => {
    const { data, error } = await supabase.rpc("inventory_balance_report", { _from: reportFrom, _to: reportTo });
    if (error) throw error; return data;
  } });
  const [saleId, setSaleId] = useState(() => crypto.randomUUID());
  const [saleProduct, setSaleProduct] = useState("");
  const [saleQuantity, setSaleQuantity] = useState("1");
  const [saleDate, setSaleDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saleMethod, setSaleMethod] = useState("krw");
  const [salePrice, setSalePrice] = useState("");
  const [saleMemo, setSaleMemo] = useState("");
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [salesPage, setSalesPage] = useState(0);
  const [detailId, setDetailId] = useState("");
  const customerSearch = useQuery({
    queryKey: ["work-customer-search", search], enabled: search.trim().length >= 2 && !customer,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name,customer_no").ilike("name", `%${search.trim().replace(/[%_]/g, "")}%`).order("name").limit(20);
      if (error) throw error; return data;
    },
  });
  const sales = useQuery({ queryKey: ["work-sales", salesPage], enabled: admin, queryFn: async () => {
    const { data, error } = await supabase.from("work_product_sales").select("*").order("paid_on", { ascending: false }).order("created_at", { ascending: false }).order("id").range(salesPage * 30, salesPage * 30 + 29);
    if (error) throw error; return data;
  } });
  const { data: allProducts, error, isPending } = useQuery(productsQuery);
  const routesQuery = useQuery(inventoryRoutesQuery);
  const routes = routesQuery.data?.filter(r => !r.deleted_at) ?? [];
  const routeName = (id: string | null) => routesQuery.data?.find(r => r.id === id)?.name ?? "미지정";
  const data = allProducts?.filter(p => !p.deleted_at).sort((a,b) => (routes.find(r=>r.id===a.route_id)?.sort_order ?? 999) - (routes.find(r=>r.id===b.route_id)?.sort_order ?? 999) || a.name.localeCompare(b.name,"ko"));
  const [routeId, setRouteId] = useState("");
  const [editingProduct, setEditingProduct] = useState<InventoryProduct | null>(null);
  const [productId, setProductId] = useState(() => crypto.randomUUID());
  const [unit, setUnit] = useState("개");
  const [movementKind, setMovementKind] = useState("receipt");
  const [movementDate, setMovementDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [initialStock, setInitialStock] = useState("0");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [adjustment, setAdjustment] = useState<{ id: string; event: string } | null>(null);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  async function run(action: () => PromiseLike<{ error: unknown }>) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await action();
      if (result.error) throw result.error;
      await qc.invalidateQueries({ queryKey: productsQuery.queryKey });
      await qc.invalidateQueries({ queryKey: ["product-ledger"] });
      await qc.invalidateQueries({ queryKey: ["product-overview"] });
      toast.success("제품 정보를 저장했습니다.");
      setName(""); setPrice(""); setUnit("개"); setInitialStock("0"); setProductId(crypto.randomUUID()); setAdjustment(null); setQuantity(""); setReason("");
    } catch (err) { toast.error(dbErrorMessage(err)); }
    finally { setBusy(false); }
  }

  async function sell(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !saleProduct || !saleDate || !Number.isFinite(Number(saleQuantity)) || Number(saleQuantity) <= 0) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("record_product_sale", { _id: saleId, _product: saleProduct, _quantity: Number(saleQuantity), _paid_on: saleDate, _method: saleMethod, _memo: saleMemo, ...(salePrice !== "" ? { _unit_price: Number(salePrice) } : {}), ...(customer ? { _customer: customer.id } : {}) });
      if (error) throw error;
      await Promise.all(["product-sales-report", "product-overview", "products", "work-sales", "product-ledger", "customer-products", "customer-work-products", "payment-summary"].map((key) => qc.invalidateQueries({ queryKey: [key] })));
      setSaleId(crypto.randomUUID()); setSaleProduct(""); setSaleQuantity("1"); setSalePrice(""); setSaleMemo(""); setCustomer(null); setSearch(""); setSalesPage(0);
      toast.success("판매를 등록하고 재고를 차감했습니다.");
    } catch (err) { toast.error(dbErrorMessage(err)); }
    finally { setBusy(false); }
  }
  const selected = data?.find((p) => p.id === saleProduct);
  const detailProduct = data?.find((p) => p.id === detailId);
  const fmt = (value: number | undefined) => value === undefined ? "—" : Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 3 });
  const unitsTotal = (key: "received" | "sold") => {
    const totals: Record<string, number> = {};
    for (const r of overview.data ?? []) { const u = allProducts?.find((p) => p.id === r.product_id)?.unit ?? "개"; totals[u] = (totals[u] ?? 0) + Number(r[key]); }
    return Object.entries(totals).filter(([, n]) => n !== 0).map(([u, n]) => `${fmt(n)}${u}`).join(" · ") || "0";
  };
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-semibold">제품 · 재고 관리</h3><p className="text-sm">사용 중인 제품 {data?.filter((p) => p.is_active).length ?? 0} / 60종</p></div>
    <div className={admin?"grid items-start gap-4 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.4fr)]":"grid gap-4"}>
      {admin && <section className="min-w-0 rounded-lg border bg-background">
        <h4 className="border-b px-3 py-3 font-semibold">전체 제품 재고</h4>
        {isPending && <p className="p-3">제품을 불러오는 중입니다.</p>}
        {error && <p role="alert" className="p-3">제품 목록을 불러오지 못했습니다.</p>}
        {routesQuery.error && <p role="alert" className="p-3">경로를 불러오지 못했습니다.</p>}
        {data?.some(p=>!p.stock_confirmed) && <p className="px-3 py-2 text-xs text-muted-foreground">초기 재고 미확인 제품은 실제 수량 확인 후 제품 수정에서 입력해 주세요.</p>}
        <div className="max-h-[75vh] overflow-y-auto"><table aria-label="경로 제품명 현재 재고" className="w-full table-fixed text-sm">
          <thead className="sticky top-0 z-10 bg-muted"><tr><th className="w-[18%] px-2 py-2 text-left">경로</th><th className="w-[57%] px-3 py-2 text-left">제품명</th><th className="px-3 py-2 text-right">현재 재고</th></tr></thead>
          <tbody>{data?.map((p) => <tr key={p.id} className={`border-t ${detailId === p.id ? "bg-accent" : ""}`}>
            <td className="break-words px-2 py-2 text-xs">{routeName(p.route_id)}</td><td className="break-words px-3 py-2"><button className="w-full text-left font-medium underline-offset-2 hover:underline" onClick={() => setDetailId(p.id)}>{p.name}{!p.is_active && <span className="ml-1 text-xs text-muted-foreground">중지</span>}</button></td>
            <td className={`px-3 py-2 text-right font-semibold ${p.stock_confirmed && p.stock === 0 ? "text-destructive" : p.stock_confirmed && p.stock <= 3 ? "text-amber-800" : ""}`}>{p.stock_confirmed ? <>{fmt(p.stock)}<span className="ml-1 text-xs font-normal">{p.unit}</span></> : <span className="text-xs font-normal text-muted-foreground">{p.stock ? `${fmt(p.stock)}${p.unit} · ` : ""}초기 미확인</span>}</td>
          </tr>)}</tbody>
        </table></div>
        {data?.length === 0 && <p className="p-3 text-sm text-muted-foreground">제품을 등록하면 이 표에 재고가 표시됩니다.</p>}
      </section>}
      <div className="min-w-0 space-y-4">
    <form id="inventory-entry" onSubmit={(e) => {
      e.preventDefault();
      if (!adjustment || busy) return;
      const fallback = movementKind === "receipt" ? "제품 입고" : movementKind === "usage" ? "내부소진" : movementKind === "internal" ? "사은품" : "재고 조정";
      void run(() => supabase.rpc("record_product_movement", { _event: adjustment.event, _product: adjustment.id, _kind: movementKind, _quantity: Number(quantity), _date: movementDate, _reason: reason.trim() || fallback }));
    }} className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2 ">
      <h4 className="font-semibold sm:col-span-2">입고·내부소진·사은품 등록</h4>
      <label className="text-sm sm:col-span-2">제품<select aria-label="입출고 제품 선택" required disabled={busy} className="h-10 w-full rounded border bg-background px-2" value={adjustment?.id ?? ""} onChange={(e) => { setAdjustment(e.target.value ? { id: e.target.value, event: crypto.randomUUID() } : null); }}><option value="">▼ 등록된 제품 선택</option>{data?.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{routeName(p.route_id)} · {p.name} · {p.stock_confirmed ? `현재 ${fmt(p.stock)}${p.unit}` : "초기 재고 미확인"}</option>)}</select></label>
      <label className="text-sm">구분<select aria-label="재고 기록 구분" disabled={busy} className="h-10 w-full rounded border bg-background px-2" value={movementKind} onChange={(e) => setMovementKind(e.target.value)}><option value="receipt">입고 (+)</option><option value="usage">내부소진 (−)</option><option value="internal">사은품 (−)</option>{admin && movementKind === "adjustment" && <option value="adjustment">재고 조정 (증감)</option>}</select></label>
      <label className="text-sm">날짜<Input aria-label="재고 기록 날짜" disabled={busy} required type="date" value={movementDate} onChange={(e) => setMovementDate(e.target.value)} /></label>
      <label className="text-sm">수량 {adjustment && `(${data?.find((p) => p.id === adjustment.id)?.unit ?? "개"})`}<Input aria-label="재고 기록 수량" disabled={busy} required type="number" inputMode="decimal" min={movementKind === "adjustment" ? -100000000 : 0.001} max={100000000} step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder={movementKind === "adjustment" ? "증가 + / 감소 −" : "예: 1 또는 0.2"} /></label>
      <label className="text-sm sm:col-span-2">메모 (선택)<Input aria-label="재고 기록 내용" disabled={busy} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 납품처, 사용 목적, 사은품 수령 고객" /></label>
      <div className="flex items-end gap-2"><Button disabled={busy || !adjustment || !Number(quantity)}>등록</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setAdjustment(null); setQuantity(""); setReason(""); }}>초기화</Button></div>
      <p className="text-xs text-muted-foreground sm:col-span-2">저장하면 재고에 반영됩니다. 예약의 제품구매는 자동 연결되므로 이곳에서 같은 판매를 다시 입력할 필요가 없습니다. {admin&&"제품명을 클릭하면 입고·출고·판매 이력을 확인할 수 있습니다."}</p>
    </form>

    {admin && <>
    <InventoryRoutes />
    <details className="space-y-3 rounded-lg border p-4" open={data?.length === 0 || undefined}><summary className="cursor-pointer font-semibold">제품 · 초기 재고 등록 (최대 60종)</summary><form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void run(() => supabase.rpc("register_routed_product", { _id: productId, _name: name.trim(), _price: Number(price) || 0, _stock: Number(initialStock), _unit: unit.trim(), ...(routeId ? { _route: routeId } : {}) })); }}>
      <label className="w-full text-sm">경로<select aria-label="신규 제품 경로" className="h-10 w-full rounded border bg-background px-2" value={routeId} onChange={e=>setRouteId(e.target.value)}><option value="">미지정</option>{routes.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label className="min-w-40 flex-1 text-sm">제품명<Input aria-label="새 제품명" placeholder="제품명" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} required /></label>
      <label className="text-sm">판매가(원)<Input aria-label="제품 판매가" placeholder="판매가(원)" className="w-36" type="number" min={0} max={999999999999} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
      <label className="text-sm">현재 보유 수량<Input aria-label="현재 보유 수량" className="w-36" type="number" min={0} max={100000000} step="0.001" required value={initialStock} onChange={(e) => setInitialStock(e.target.value)} /></label>
      <label className="text-sm">단위<Input aria-label="제품 단위" className="w-24" maxLength={20} required placeholder="개 / box / ml" value={unit} onChange={(e) => setUnit(e.target.value)} /></label>
      <Button disabled={busy || !name.trim() || (data?.filter((p) => p.is_active).length ?? 60) >= 60}>제품 · 초기 재고 등록</Button>
    </form></details>

    <InventoryCatalogManager />
    </>}
        <details className="rounded border p-3"><summary className="cursor-pointer text-sm font-semibold">{admin?"예약 외 판매 등록·내역":"예약 외 판매 등록"}</summary><div className="mt-3 space-y-3">    <details className="rounded border p-3"><summary className="cursor-pointer text-sm font-semibold">+ 예약 외 제품 판매 등록</summary><form onSubmit={sell} className="space-y-3 rounded border p-3">
      <h4 className="font-semibold">제품 판매 등록</h4>
      <p className="text-xs text-muted-foreground">예약에서 제품판매를 연결한 경우 이미 자동 반영됩니다. 여기에는 예약 없이 판매한 제품만 등록해 주세요.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">판매일<Input type="date" aria-label="제품 판매일" required disabled={busy} value={saleDate} onChange={(e) => setSaleDate(e.target.value)} /></label>
        <label className="text-sm">제품<select aria-label="판매 제품" className="h-10 w-full rounded border bg-background px-2" required disabled={busy} value={saleProduct} onChange={(e) => { setSaleProduct(e.target.value); setSalePrice(""); }}><option value="">제품 선택</option>{data?.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{routeName(p.route_id)} · {p.name} · 재고 {p.stock}{p.unit}</option>)}</select></label>
        <label className="text-sm">판매 수량<Input aria-label="판매 수량" type="number" required min="0.001" max={100000} step="0.001" disabled={busy} value={saleQuantity} onChange={(e) => setSaleQuantity(e.target.value)} /></label>
        <label className="text-sm">결제 방법<select aria-label="제품 결제 방법" className="h-10 w-full rounded border bg-background px-2" disabled={busy} value={saleMethod} onChange={(e) => setSaleMethod(e.target.value)}><option value="krw">원 (현금)</option><option value="card">카드 (원)</option><option value="bank">계좌 (원)</option></select></label>
      </div>
      <label className="block text-sm">판매단가(원)<Input aria-label="예약 외 판매단가" type="number" min={0} max={999999999999} step="0.01" placeholder={String(selected?.price ?? 0)} value={salePrice} onChange={(e) => setSalePrice(e.target.value)} /></label>
      <p className="text-sm font-semibold">판매금액: {((salePrice !== "" ? Number(salePrice) : selected?.price ?? 0) * (Number(saleQuantity) || 0)).toLocaleString("ko-KR")}원</p>
      <label className="block text-sm">고객 연결 (선택)<Input aria-label="판매 고객 검색" placeholder="고객명 두 글자 이상 검색" disabled={busy} value={customer ? customer.name : search} onChange={(e) => { setCustomer(null); setSearch(e.target.value); }} /></label>
      {customerSearch.error && !customer && <p role="alert">고객 검색에 실패했습니다.</p>}
      {!customer && search.trim().length >= 2 && <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto">{customerSearch.data?.map((c) => <Button type="button" key={c.id} size="sm" variant="outline" disabled={busy} onClick={() => setCustomer(c)}>{c.name} · No.{c.customer_no}</Button>)}{customerSearch.data?.length === 0 && <p className="text-sm">검색된 고객이 없습니다.</p>}</div>}
      <Input aria-label="제품 판매 메모" placeholder="판매 내용·메모" maxLength={500} disabled={busy} value={saleMemo} onChange={(e) => setSaleMemo(e.target.value)} />
      <Button disabled={busy || !selected || Number(saleQuantity) <= 0}>판매 저장 · 재고 차감</Button>
    </form></details>
    {admin && <details className="space-y-2 rounded border p-3"><summary className="cursor-pointer font-semibold">예약 외 판매 내역</summary>
      {sales.error && <p role="alert">판매 내역을 불러오지 못했습니다.</p>}{sales.isPending && <p>불러오는 중입니다.</p>}
      {sales.data?.map((s) => <div className="rounded border p-2 text-sm" key={s.id}>{s.paid_on} · {s.product_name} · {s.quantity}개 · {(s.quantity * Number(s.unit_price)).toLocaleString("ko-KR")}원 · {s.method === "card" ? "카드" : s.method === "bank" ? "계좌" : "현금"}{s.memo && <p>{s.memo}</p>}</div>)}
      {sales.data?.length === 0 && <p className="text-sm">등록된 판매가 없습니다.</p>}
      <div className="flex gap-2"><Button variant="outline" disabled={salesPage === 0} onClick={() => setSalesPage(salesPage - 1)}>이전</Button><Button variant="outline" disabled={sales.data?.length !== 30} onClick={() => setSalesPage(salesPage + 1)}>다음</Button></div>
    </details>}
</div></details>
      </div>
    </div>
    {detailProduct && validReport && <Dialog open onOpenChange={(open) => !open && setDetailId("")}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>{detailProduct.name} · 이력</DialogTitle></DialogHeader><ProductStockDetail key={`${detailProduct.id}-${reportFrom}-${reportTo}`} product={detailProduct} from={reportFrom} to={reportTo} onClose={() => setDetailId("")} /><Button type="button" variant="outline" onClick={()=>{setEditingProduct(detailProduct);setDetailId("");}}>제품 수정·삭제</Button></DialogContent></Dialog>}
    {editingProduct && <InventoryProductEditor key={editingProduct.id} product={editingProduct} onClose={()=>setEditingProduct(null)} />}
    {admin && <section className="space-y-3 rounded-lg border p-4"><h4 className="font-semibold">기간별 판매·재고 조회</h4>
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-sm">조회 시작일<Input aria-label="제품 조회 시작일" type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} /></label>
      <label className="text-sm">조회 종료일<Input aria-label="제품 조회 종료일" type="date" min={reportFrom} value={reportTo} onChange={(e) => setReportTo(e.target.value)} /></label>
      <Button variant="outline" onClick={() => { setReportFrom(format(startOfMonth(new Date()), "yyyy-MM-dd")); setReportTo(format(new Date(), "yyyy-MM-dd")); }}>이번 달</Button>
      <Button variant="outline" onClick={() => { const today = format(new Date(), "yyyy-MM-dd"); setReportFrom(today); setReportTo(today); }}>오늘</Button>
    </div>

      {!validReport && <p role="alert">조회 기간을 확인해 주세요.</p>}
      {validReport && <ProductSalesReport key={`${reportFrom}-${reportTo}`} from={reportFrom} to={reportTo} />}
      <details className="space-y-3 rounded border p-3"><summary className="cursor-pointer text-sm font-semibold">상세 재고·입출고 통계</summary>
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {[["입고 수량", unitsTotal("received")], ["판매 수량", unitsTotal("sold")], ["제품 판매금액", `${(overview.data?.reduce((sum, r) => sum + Number(r.sales_amount), 0) ?? 0).toLocaleString("ko-KR")}원`], ["재고 부족 제품", `${data?.filter((p) => p.is_active && p.stock_confirmed && p.stock <= 3).length ?? 0}종`]].map(([label, value]) => <div key={label} className="rounded-lg bg-muted p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{(label === "재고 부족 제품" ? !data : overview.isPending || !validReport || overview.error) ? "—" : value}</p></div>)}
    </div>
    <p className="text-xs text-muted-foreground">기초 + 입고 − 내부소진 − 사은품 − 판매 + 조정 = 종료일 재고. 기초에는 조회 기간에 등록한 초기 재고도 포함됩니다. 판매금액은 저장된 판매단가(원) 기준이며, 예약 판매는 자동 반영됩니다.</p>

      <div className="min-w-0 overflow-x-auto rounded border"><table className="w-full min-w-[1180px] text-sm">
        <thead className="bg-emerald-50 text-primary"><tr>{["제품명", "단위", "기초", "입고", "합계", "내부소진", "사은품", "판매", "조정", `${reportTo.slice(5)} 재고`, "판매금액(원)", "비고", "관리"].map((title, i) => <th key={i} className={`whitespace-nowrap border-b p-2 ${i === 0 ? "sticky left-0 z-10 min-w-40 bg-emerald-50 text-left" : "text-center"}`}>{title}</th>)}</tr></thead>
        <tbody>{data?.map((p) => {
          const r = overview.data?.find((r) => r.product_id === p.id);
          return <tr key={p.id} className={`border-b ${detailId === p.id ? "bg-accent" : "bg-background"}`}>
            <th className="sticky left-0 z-10 border-r bg-inherit px-2 py-2 text-left font-medium"><button className="text-left underline-offset-2 hover:underline" onClick={() => setDetailId(p.id)}>{p.name}{!p.is_active && " · 중지"}</button></th>
            <td className="px-2 text-center">{p.unit}</td><td className="px-2 text-right">{fmt(r?.opening_stock)}</td><td className="bg-orange-50 px-2 text-right">{fmt(r?.received)}</td><td className="bg-orange-50 px-2 text-right">{r ? fmt(Number(r.opening_stock) + Number(r.received)) : "—"}</td>
            <td className="px-2 text-right">{fmt(r?.used)}</td><td className="px-2 text-right">{fmt(r?.internal_used)}</td><td className="px-2 text-right">{fmt(r?.sold)}</td><td className="px-2 text-right">{fmt(r?.adjustment)}</td>
            <td className="bg-sky-100 px-2 text-right font-semibold">{fmt(r?.closing_stock)}{r && Number(r.closing_stock) !== Number(p.stock) && <p className="text-xs font-normal">현재 {fmt(p.stock)}</p>}{p.is_active && p.stock_confirmed && p.stock <= 3 && <p className={p.stock === 0 ? "text-xs text-destructive" : "text-xs text-amber-800"}>{p.stock === 0 ? "품절" : "부족"}</p>}</td>
            <td className="px-2 text-right">{r ? Number(r.sales_amount).toLocaleString("ko-KR", { maximumFractionDigits: 2 }) : "—"}</td><td className="max-w-64 break-words p-2 text-xs">{r?.notes || "—"}</td>
            <td className="p-1"><div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => setDetailId(p.id)}>내역</Button>{admin && <Button size="sm" variant="outline" disabled={busy} onClick={() => { setAdjustment({ id: p.id, event: crypto.randomUUID() }); setMovementKind("adjustment"); setQuantity(""); setReason(""); document.getElementById("inventory-entry")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>조정</Button>}{admin && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => supabase.from("products").update({ is_active: !p.is_active }).eq("id", p.id))}>{p.is_active ? "중지" : "재사용"}</Button>}</div></td>
          </tr>;
        })}</tbody>
      </table></div>

      </details>
    </section>}
  </section>;
}
