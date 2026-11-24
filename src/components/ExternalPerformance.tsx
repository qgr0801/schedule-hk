import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PAYMENT_KINDS } from "@/lib/payments";
import { won } from "@/lib/admin-review";

type Report = {
  entries: { paid_on: string; kind: string; description: string | null; krw: number; jpy: number; usd: number; cny: number }[];
  settlements: { kind: string; amount: number; completed_amount: number }[];
};
const amounts = [["krw", "원"], ["jpy", "엔"], ["usd", "달러"], ["cny", "위안"]] as const;
const label = (kind: string) => PAYMENT_KINDS.find(([key]) => key === kind)?.[1];

export function ExternalPerformance({ staffId }: { staffId: string }) {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", dateStyle: "short" }).format(new Date());
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [period, setPeriod] = useState({ from, to });
  const report = useQuery({
    queryKey: ["my-external-performance", staffId, period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_external_performance", { _from: period.from, _to: period.to });
      if (error) throw error;
      return data as Report | null;
    },
  });
  const entries = report.data?.entries ?? [];
  const settlements = report.data?.settlements ?? [];
  return <section className="space-y-4">
    <h2 className="text-xl font-semibold">내 성과</h2>
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => {
      event.preventDefault();
      if (from && to && from <= to) setPeriod({ from, to });
    }}>
      <label className="grid gap-1 text-sm">시작일<Input type="date" required value={from} max={to} onChange={e => setFrom(e.target.value)} /></label>
      <label className="grid gap-1 text-sm">종료일<Input type="date" required value={to} min={from} onChange={e => setTo(e.target.value)} /></label>
      <Button type="submit" disabled={!from || !to || from > to}>기간 조회</Button>
    </form>
    {report.isPending && <p role="status">성과를 불러오는 중입니다.</p>}
    {report.error && <p role="alert">성과를 불러오지 못했습니다.</p>}
    {report.data === null && <p>연결된 정산 경로가 없습니다. 관리자에게 문의해 주세요.</p>}
    {report.data && <>
      <p className="text-sm text-muted-foreground">{period.from} ~ {period.to} · 결제일 기준</p>
      <p className="font-semibold">수납 합계 {amounts.map(([key, unit]) => [entries.reduce((sum, row) => sum + row[key], 0), unit] as const).filter(([amount, unit]) => amount || unit === "원").map(([amount, unit]) => `${won(amount)}${unit}`).join(" · ")}</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-sm">
        <thead className="bg-muted"><tr>{["결제일", "구분", "내용", "수납"].map(title => <th key={title} scope="col" className="p-2 text-left">{title}</th>)}</tr></thead>
        <tbody>{entries.map((row, index) => <tr key={index} className="border-b">
          <td className="whitespace-nowrap p-2">{row.paid_on}</td><td className="p-2">{label(row.kind)}</td>
          <td className="whitespace-pre-wrap p-2">{row.description || "—"}</td>
          <td className="p-2">{amounts.filter(([key]) => row[key]).map(([key, unit]) => `${won(row[key])}${unit}`).join(" · ") || "—"}</td>
        </tr>)}</tbody>
      </table></div>
      {!entries.length && <p className="text-sm">조회 기간에 실적이 없습니다.</p>}
      <h3 className="font-semibold">정산 내역</h3>
      <p className="text-sm text-muted-foreground">관리자가 같은 시작일·종료일로 저장한 정산이 표시됩니다.</p>
      {settlements.length ? <table className="w-full text-sm">
        <thead className="bg-muted"><tr>{["구분", "정산(원)", "정산완료(원)"].map(title => <th key={title} scope="col" className="p-2 text-left">{title}</th>)}</tr></thead>
        <tbody>{settlements.map(row => <tr key={row.kind} className="border-b"><td className="p-2">{label(row.kind)}</td><td className="p-2">{won(row.amount)}</td><td className="p-2">{won(row.completed_amount)}</td></tr>)}</tbody>
        <tfoot><tr className="bg-muted font-semibold"><th scope="row" className="p-2 text-left">정산 합계</th><td className="p-2">{won(settlements.reduce((sum, row) => sum + row.amount, 0))}</td><td className="p-2">{won(settlements.reduce((sum, row) => sum + row.completed_amount, 0))}</td></tr></tfoot>
      </table> : <p className="text-sm">이 기간에 등록된 정산이 없습니다.</p>}
    </>}
  </section>;
}
