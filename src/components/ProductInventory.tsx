import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { dbErrorMessage } from "@/lib/app";
import { productsQuery } from "@/lib/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProductInventory() {
  const qc = useQueryClient();
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
      toast.success("제품 정보를 저장했습니다.");
      setName(""); setPrice(""); setAdjustment(null); setQuantity("");
    } catch (err) { toast.error(dbErrorMessage(err)); }
    finally { setBusy(false); }
  }

  return <section className="space-y-4">
    <h3 className="font-semibold">제품 등록 · 재고</h3>
    <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void run(() => supabase.from("products").insert({ name: name.trim(), price: Number(price) || 0 })); }}>
      <Input aria-label="새 제품명" placeholder="제품명" maxLength={100} className="flex-1" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input aria-label="제품 판매가" placeholder="판매가(원)" className="w-36" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
      <Button disabled={busy || !name.trim()}>제품 등록</Button>
    </form>
    {isPending && <p>제품을 불러오는 중입니다.</p>}
    {error && <p role="alert">제품 목록을 불러오지 못했습니다.</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-sm"><thead><tr><th className="text-left">제품</th><th>판매가(원)</th><th>현재 재고</th><th>관리</th></tr></thead>
      <tbody>{data?.map((p) => <tr key={p.id} className="border-b"><td className="py-3">{p.name}{!p.is_active && " · 사용 중지"}</td><td className="text-right">{Number(p.price).toLocaleString("ko-KR")}</td><td className={`text-center font-bold ${p.stock === 0 ? "text-destructive" : ""}`}>{p.stock}개</td><td className="flex flex-wrap justify-end gap-1 py-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setAdjustment({ id: p.id, event: crypto.randomUUID() }); setQuantity(""); }}>입고·재고 조정</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run(() => supabase.from("products").update({ is_active: !p.is_active }).eq("id", p.id))}>{p.is_active ? "사용 중지" : "다시 사용"}</Button>
      </td></tr>)}</tbody>
    </table></div>
    {adjustment && <div className="space-y-2 rounded border p-3">
      <p className="text-sm font-semibold">{data?.find((p) => p.id === adjustment.id)?.name} · 입고·재고 조정</p>
      <label className="block text-sm">수량<Input aria-label="재고 조정 수량" type="number" step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="입고는 양수, 반품·감소는 음수" /></label>
      <Input aria-label="재고 조정 사유" placeholder="사유" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button disabled={busy || !Number.isInteger(Number(quantity)) || !Number(quantity) || !reason.trim()} onClick={() => run(() => supabase.rpc("adjust_product_stock", { _event: adjustment.event, _product: adjustment.id, _quantity: Number(quantity), _reason: reason.trim() }))}>재고 저장</Button>
      <Button variant="outline" disabled={busy} onClick={() => setAdjustment(null)}>닫기</Button>
    </div>}
  </section>;
}
