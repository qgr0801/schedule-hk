import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
const labels: Record<string, string> = { initial: "기초", receipt: "입고", sale: "판매", usage: "내부소진", internal: "사은품", adjustment: "조정" };
export function ProductStockDetail({ product, from, to, onClose }: { product: { id: string; name: string; unit: string }; from: string; to: string; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const entries = useQuery({ queryKey: ["product-ledger", product.id, from, to, page], queryFn: async () => {
    const { data, error } = await supabase.rpc("product_stock_ledger", { _product: product.id, _from: from, _to: to, _offset: page * 30 });
    if (error) throw error; return data;
  } });
  return <section className="space-y-3 rounded-lg border bg-background p-3 lg:sticky lg:top-4">
    <div className="flex items-center justify-between gap-2"><h4 className="font-semibold">{product.name} · 입고·내부소진·사은품·판매 이력</h4><Button size="sm" variant="outline" onClick={onClose}>닫기</Button></div>
    <p className="text-xs text-muted-foreground">{from} ~ {to} · 단위 {product.unit}</p>
    {entries.isPending && <p>내역을 불러오는 중입니다.</p>}{entries.error && <p role="alert">입출고 내역을 불러오지 못했습니다.</p>}
    <div className="max-h-[65vh] overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted"><tr><th className="p-2">날짜</th><th>구분</th><th>내용</th><th>수량</th></tr></thead><tbody>{entries.data?.map((r) => <tr key={r.id} className="border-b"><td className="whitespace-nowrap p-2 align-top">{r.effective_on}</td><td className="p-2 align-top">{labels[r.movement_kind] ?? r.movement_kind}</td><td className="min-w-32 break-words p-2">{r.customer_name && <p className="font-medium">{r.customer_name}</p>}<p>{r.reason}</p>{r.reservation_id && <Link className="text-xs underline" to="/reservations/new" search={{ id: r.reservation_id }}>예약·계산 보기</Link>}</td><td className="p-2 text-right align-top">{Number(r.quantity).toLocaleString("ko-KR", { maximumFractionDigits: 3 })}</td></tr>)}</tbody></table></div>
    {entries.data?.length === 0 && <p className="text-sm">해당 기간의 기록이 없습니다.</p>}
    <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>이전</Button><Button variant="outline" size="sm" disabled={entries.data?.length !== 30} onClick={() => setPage(page + 1)}>다음</Button></div>
  </section>;
}
