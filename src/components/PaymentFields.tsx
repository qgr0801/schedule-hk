import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@tanstack/react-router";
import { MONEY_COLUMNS, PAYMENT_KINDS, type PaymentDraft } from "@/lib/payments";

export function PaymentFields({ value, onChange, disabled }: { value: PaymentDraft; onChange?: (v: PaymentDraft) => void; disabled?: boolean }) {
  const readonly = !onChange;
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-semibold text-primary">그날의 계산 내역</h3>
      <label className="block space-y-1 text-sm">결제일<Input aria-label="결제일" type="date" value={value.paid_on} disabled={disabled || readonly} onChange={(e) => onChange?.({ ...value, paid_on: e.target.value })} /></label>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead><tr className="bg-muted"><th className="w-14 whitespace-nowrap p-2 text-left">구분</th><th className="min-w-[200px] p-2 text-left">내용</th>{MONEY_COLUMNS.map(([key, label]) => <th key={key} className="p-2 text-right">{label}</th>)}</tr></thead>
          <tbody>{PAYMENT_KINDS.map(([kind, label]) => {
            const row = value.rows.find((r) => r.kind === kind)!;
            return <tr key={kind} className="border-b"><th className="whitespace-nowrap p-2 text-left">{label}</th><td className="p-1">{readonly ? <span className="whitespace-pre-wrap">{row.description || "-"}</span> : <Input aria-label={`${label} 내용`} placeholder={kind === "product" ? "제품 판매 내용" : "내용 직접 입력"} maxLength={300} disabled={disabled} value={row.description ?? ""} onChange={(e) => onChange?.({ ...value, rows: value.rows.map((r) => r.kind === kind ? { ...r, description: e.target.value } : r) })} />}</td>{MONEY_COLUMNS.map(([key, title]) => <td key={key} className="p-1 text-right">
              {readonly ? row[key].toLocaleString("ko-KR", { maximumFractionDigits: 2 }) : <Input aria-label={`${label} ${title}`} type="number" inputMode="decimal" min={0} max={999999999999} step="0.01" disabled={disabled} value={row[key] || ""} placeholder="0" onChange={(e) => onChange?.({ ...value, rows: value.rows.map((r) => r.kind === kind ? { ...r, [key]: Number(e.target.value) } : r) })} />}
            </td>)}</tr>;
          })}</tbody>
        </table>
      </div>
      {value.sales.length > 0 && <p className="text-sm">기존 연결 판매: {value.sales.map((s) => `${s.name ?? "제품"} ${s.quantity}개`).join(", ")}</p>}
      {!readonly && <p className="text-xs text-muted-foreground">제품 판매 내용은 위 제품 행에 기록하세요. 입고·판매 수량과 재고는 <Link to="/attendance" search={{ tab: "products" }} className="font-semibold underline">WORK → 제품</Link>에서 관리합니다. 내용 입력만으로 재고가 차감되지는 않습니다.</p>}
      <label className="block space-y-1 text-sm">계산 메모<Textarea aria-label="계산 메모" value={value.memo} maxLength={1000} disabled={disabled || readonly} onChange={(e) => onChange?.({ ...value, memo: e.target.value })} /></label>
    </section>
  );
}
