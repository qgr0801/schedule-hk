import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
const number = (n: number) => Number(n).toLocaleString("ko-KR", { maximumFractionDigits: 3 });
const money = (n: number) => Number(n).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
export function ProductSalesReport({ from, to }: { from: string; to: string }) {
  const [page, setPage] = useState(0);
  const report = useQuery({ queryKey: ["product-sales-report", from, to, page], queryFn: async () => {
    const { data, error } = await supabase.rpc("product_sales_report", { _from: from, _to: to, _offset: page * 50 });
    if (error) throw error; return data;
  } });
  useEffect(() => { if (page > 0 && report.data?.length === 0) setPage(0); }, [page, report.data]);
  const totalCount = Number(report.data?.[0]?.total_count ?? 0);
  return <section className="space-y-3 rounded-lg border p-4">
    <h4 className="font-semibold">기간별 전체 제품 판매내역</h4>
    <p className="text-sm">{from} ~ {to}</p>
    {report.isPending && <p>판매내역을 불러오는 중입니다.</p>}
    {report.error && <p role="alert">제품 판매내역을 불러오지 못했습니다.</p>}
    {report.data && <div className="rounded bg-muted p-3 font-semibold">총 판매금액 {money(Number(report.data[0]?.total_amount ?? 0))}원 <span className="ml-3 text-sm font-normal">판매 항목 {number(totalCount)}건 · 조회 기간 전체 합계</span></div>}
    <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead className="bg-muted"><tr>{["날짜", "고객명", "제품명", "수량", "판매단가(원)", "판매금액(원)", "구분"].map((s) => <th key={s} className="whitespace-nowrap p-2 text-left">{s}</th>)}</tr></thead>
      <tbody>{report.data?.map((r) => <tr key={r.sale_key} className="border-b"><td className="whitespace-nowrap p-2">{r.paid_on}</td><td className="p-2 font-medium">{r.customer_name}</td><td className="p-2">{r.product_name}</td><td className="p-2 text-right">{number(r.quantity)}{r.unit}</td><td className="p-2 text-right">{money(r.unit_price)}</td><td className="p-2 text-right font-semibold">{money(r.sales_amount)}</td><td className="p-2">{r.reservation_id ? <Link className="underline" to="/reservations/new" search={{ id: r.reservation_id }}>{r.source}</Link> : r.source}</td></tr>)}</tbody>
    </table></div>
    {report.data?.length === 0 && <p className="text-sm">해당 기간의 제품 판매내역이 없습니다.</p>}
    <div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={page === 0 || report.isFetching} onClick={() => setPage(page - 1)}>이전</Button><span className="text-xs">{page + 1} / {Math.max(1, Math.ceil(totalCount / 50))}</span><Button size="sm" variant="outline" disabled={report.isFetching || (page + 1) * 50 >= totalCount} onClick={() => setPage(page + 1)}>다음</Button></div>
  </section>;
}
