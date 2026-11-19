import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MONEY_COLUMNS, PAYMENT_KINDS, productsQuery, type PaymentDraft } from "@/lib/payments";

export function PaymentFields({ value, onChange, disabled }: { value: PaymentDraft; onChange?: (v: PaymentDraft) => void; disabled?: boolean }) {
  const { data: products, error } = useQuery({ ...productsQuery, enabled: !!onChange });
  const readonly = !onChange;
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-semibold text-primary">그날의 계산 내역</h3>
      <label className="block space-y-1 text-sm">결제일<Input aria-label="결제일" type="date" value={value.paid_on} disabled={disabled || readonly} onChange={(e) => onChange?.({ ...value, paid_on: e.target.value })} /></label>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="bg-muted"><th className="p-2 text-left">내용</th>{MONEY_COLUMNS.map(([key, label]) => <th key={key} className="p-2 text-right">{label}</th>)}</tr></thead>
          <tbody>{PAYMENT_KINDS.map(([kind, label]) => {
            const row = value.rows.find((r) => r.kind === kind)!;
            return <tr key={kind} className="border-b"><th className="p-2 text-left">{label}</th>{MONEY_COLUMNS.map(([key, title]) => <td key={key} className="p-1 text-right">
              {readonly ? row[key].toLocaleString("ko-KR", { maximumFractionDigits: 2 }) : <Input aria-label={`${label} ${title}`} type="number" inputMode="decimal" min={0} max={999999999999} step="0.01" disabled={disabled} value={row[key] || ""} placeholder="0" onChange={(e) => onChange?.({ ...value, rows: value.rows.map((r) => r.kind === kind ? { ...r, [key]: Number(e.target.value) } : r) })} />}
            </td>)}</tr>;
          })}</tbody>
        </table>
      </div>
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">제품 판매</h4>
        {error && <p role="alert" className="text-sm text-destructive">제품 목록을 불러오지 못했습니다.</p>}
        {value.sales.map((sale, index) => <div key={sale.product_id || index} className="flex flex-wrap items-center gap-2">
          {readonly ? <span>{sale.name} · {sale.quantity}개</span> : <>
            <select aria-label={`판매 제품 ${index + 1}`} className="h-10 min-w-0 flex-1 rounded border bg-background px-2 text-sm" disabled={disabled} value={sale.product_id} onChange={(e) => onChange?.({ ...value, sales: value.sales.map((s, i) => i === index ? { ...s, product_id: e.target.value } : s) })}>
              <option value="">제품 선택</option>
              {products?.filter((p) => p.is_active || p.id === sale.product_id).map((p) => <option key={p.id} value={p.id}>{p.name} · 재고 {p.stock}개</option>)}
            </select>
            <Input aria-label={`판매 수량 ${index + 1}`} type="number" min={1} step={1} className="w-20" value={sale.quantity} disabled={disabled} onChange={(e) => onChange?.({ ...value, sales: value.sales.map((s, i) => i === index ? { ...s, quantity: Number(e.target.value) } : s) })} />
            <Button type="button" variant="outline" disabled={disabled} onClick={() => onChange?.({ ...value, sales: value.sales.filter((_, i) => i !== index) })}>빼기</Button>
          </>}
        </div>)}
        {!readonly && <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange?.({ ...value, sales: [...value.sales, { product_id: "", quantity: 1 }] })}>+ 판매 제품</Button>}
      </div>
      <label className="block space-y-1 text-sm">계산 메모<Textarea aria-label="계산 메모" value={value.memo} maxLength={1000} disabled={disabled || readonly} onChange={(e) => onChange?.({ ...value, memo: e.target.value })} /></label>
    </section>
  );
}
