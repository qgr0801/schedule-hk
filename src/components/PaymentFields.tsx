import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { withReservationSales } from "@/lib/reservation-sales";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@tanstack/react-router";
import { MONEY_COLUMNS, PAYMENT_KINDS, productsQuery, type PaymentDraft } from "@/lib/payments";

export function PaymentFields({ value, onChange, disabled }: { value: PaymentDraft; onChange?: (v: PaymentDraft) => void; disabled?: boolean }) {
  const readonly = !onChange;
  const { data: products, error: productsError } = useQuery({ ...productsQuery, enabled: !readonly });
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
      {readonly ? (value.sales.length > 0 && <div className="text-sm">{value.sales.map((sale) => <p key={sale.product_id}>{sale.name ?? "제품"} · {sale.quantity} · 개당 {Number(sale.unit_price ?? 0).toLocaleString("ko-KR")}원</p>)}</div>) : <details className="rounded border p-3">
        <summary className="cursor-pointer text-sm font-semibold">제품 판매 연결 {value.sales.length > 0 ? `· ${value.sales.length}종` : "+ 추가"}</summary>
        <p className="my-2 text-xs text-muted-foreground">제품·수량·판매단가(원)를 입력하고 예약을 저장하면 WORK에 판매와 재고가 자동 반영됩니다. 결제 금액은 제품 행에서 확인·수정하세요.</p>
        {productsError && <p role="alert">제품 목록을 불러오지 못했습니다. 새로고침해 주세요.</p>}
        <div className="space-y-2">{value.sales.map((sale, index) => <div key={index} className="flex flex-wrap items-center gap-2">
          <select aria-label={`예약 판매 제품 ${index + 1}`} disabled={disabled} className="h-10 min-w-40 flex-1 rounded border bg-background px-2 text-sm" value={sale.product_id} onChange={(e) => {
            const p = products?.find((p) => p.id === e.target.value);
            onChange?.(withReservationSales(value, value.sales.map((s, i) => i === index ? { product_id: e.target.value, quantity: s.quantity, name: p?.name ?? "", unit_price: p?.price ?? 0 } : s)));
          }}><option value="">제품 선택</option>{products?.filter((p) => p.is_active || p.id === sale.product_id).map((p) => <option value={p.id} key={p.id}>{p.name} · 재고 {p.stock}{p.unit}</option>)}</select>
          <Input aria-label={`예약 판매 수량 ${index + 1}`} type="number" inputMode="decimal" min="0.001" max={100000} step="0.001" className="w-24" value={sale.quantity} disabled={disabled} onChange={(e) => onChange?.(withReservationSales(value, value.sales.map((s, i) => i === index ? { ...s, quantity: Number(e.target.value) } : s)))} />
          <Input aria-label={`예약 판매단가 ${index + 1}`} title="판매단가(원)" placeholder="판매단가(원)" type="number" inputMode="decimal" min={0} max={999999999999} step="0.01" className="w-32" value={sale.unit_price ?? 0} disabled={disabled} onChange={(e) => onChange?.(withReservationSales(value, value.sales.map((s, i) => i === index ? { ...s, unit_price: Number(e.target.value) } : s)))} />
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onChange?.(withReservationSales(value, value.sales.filter((_, i) => i !== index)))}>삭제</Button>
        </div>)}</div>
        <Button type="button" className="mt-2" variant="outline" size="sm" disabled={disabled} onClick={() => onChange?.({ ...value, sales: [...value.sales, { product_id: "", quantity: 1 }] })}>+ 제품</Button>
      </details>}
      {!readonly && <p className="text-xs text-muted-foreground">판매 연결 없이 내용만 적은 경우에는 재고가 변하지 않습니다. <Link to="/attendance" search={{ tab: "products" }} className="underline">WORK → 제품</Link>에서 제품을 먼저 등록해 주세요.</p>}
      <label className="block space-y-1 text-sm">계산 메모<Textarea aria-label="계산 메모" value={value.memo} maxLength={1000} disabled={disabled || readonly} onChange={(e) => onChange?.({ ...value, memo: e.target.value })} /></label>
    </section>
  );
}
