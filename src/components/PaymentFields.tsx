import { useRef } from "react";
import { MoneyInput } from "@/components/MoneyInput";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { withReservationSales } from "@/lib/reservation-sales";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@tanstack/react-router";
import { MONEY_COLUMNS, PAYMENT_KINDS, productsQuery, type PaymentDraft } from "@/lib/payments";

export function PaymentFields({ value, onChange, disabled }: { value: PaymentDraft; onChange?: (v: PaymentDraft) => void; disabled?: boolean }) {
  const readonly = !onChange;
  const descriptions = useRef<Partial<Record<"service" | "care" | "art", HTMLInputElement | null>>>({});
  const quantities = useRef<(HTMLInputElement | null)[]>([]);
  function updateDescription(kind: "service" | "care" | "art", description: string) {
    onChange?.({ ...value, rows: value.rows.map(row => row.kind === kind ? { ...row, description } : row) });
  }
  function removeProduct(index: number) {
    onChange?.(withReservationSales(value, value.sales.filter((_, i) => i !== index)));
  }
  function focusField(input: HTMLInputElement | null | undefined) {
    input?.focus();
    input?.select();
  }
  const { data: products, error: productsError } = useQuery({ ...productsQuery, enabled: !readonly });
  const productInputs = <div className="space-y-2">
    {productsError && <p role="alert" className="text-xs text-destructive">제품 목록을 불러오지 못했습니다.</p>}
    {(value.sales.length ? value.sales : [{ product_id: "", quantity: 1, unit_price: 0 }]).map((sale, index) => <div key={index} className="space-y-1 rounded border p-2">
      <div className="flex items-end gap-2"><label className="min-w-0 flex-1 text-xs">제품 선택<select aria-label={`예약 판매 제품 ${index + 1}`} disabled={disabled} className="h-9 w-full min-w-0 rounded border bg-background px-2 text-sm" value={sale.product_id} onChange={(e) => {
        if (!e.target.value) { onChange?.(withReservationSales(value, value.sales.filter((_, i) => i !== index))); return; }
        const p = products?.find((p) => p.id === e.target.value);
        const next = { product_id: e.target.value, quantity: sale.quantity, name: p?.name ?? "", unit_price: p?.price ?? 0 };
        onChange?.(withReservationSales(value, value.sales.length ? value.sales.map((s, i) => i === index ? next : s) : [next]));
      }}><option value="">▼ 제품 선택</option>{sale.product_id && products && !products.some(p=>p.id===sale.product_id) && <option value={sale.product_id}>기존 제품 (삭제됨)</option>}{products?.filter((p) => p.is_active || p.id === sale.product_id).map((p) => <option value={p.id} key={p.id}>{p.name} · 재고 {p.stock}{p.unit}</option>)}</select></label><label className="w-20 shrink-0 text-xs">판매 수량<Input ref={input => { quantities.current[index] = input; }} aria-label={`예약 판매 수량 ${index + 1}`} type="number" inputMode="decimal" min="0.001" max={100000} step="0.001" className="h-9 w-full" value={sale.quantity} disabled={disabled} onChange={(e) => onChange?.(withReservationSales(value, value.sales.length ? value.sales.map((s, i) => i === index ? { ...s, quantity: Number(e.target.value) } : s) : [{ ...sale, quantity: Number(e.target.value) }]))} /></label></div>
      {value.sales.length > 0 && <div className="flex flex-wrap items-end gap-2">
        {sale.product_id && <label className="text-xs">판매단가(원)<MoneyInput aria-label={`예약 판매단가 ${index + 1}`} className="h-9 w-40" value={sale.unit_price ?? 0} disabled={!!disabled} onValueChange={(amount) => onChange?.(withReservationSales(value, value.sales.map((s, i) => i === index ? { ...s, unit_price: amount } : s)))} /></label>}
        <div className="flex gap-1">
          {sale.product_id && <Button type="button" size="sm" variant="outline" aria-label={`제품 ${index + 1} 수정`} disabled={disabled} onClick={() => focusField(quantities.current[index])}>수정</Button>}
          <Button type="button" size="sm" variant="outline" aria-label={`제품 ${index + 1} 삭제`} disabled={disabled} onClick={() => removeProduct(index)}>삭제</Button>
        </div>
      </div>}
    </div>)}
    <div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={disabled || !value.sales.length || value.sales.length >= 5 || value.sales.some(s=>!s.product_id)} onClick={() => { if(value.sales.length < 5) onChange?.({ ...value, sales: [...value.sales, { product_id: "", quantity: 1 }] }); }}>+ 제품 추가</Button><span className="text-xs text-muted-foreground">{Math.max(1,value.sales.length)} / 5종류</span></div>
    <Input aria-label="제품 내용" placeholder="제품 메모 (선택)" maxLength={300} disabled={disabled} value={value.rows.find((r) => r.kind === "product")?.description ?? ""} onChange={(e) => onChange?.({ ...value, rows: value.rows.map((r) => r.kind === "product" ? { ...r, description: e.target.value } : r) })} />
  </div>;
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-semibold text-primary">그날의 계산 내역</h3>
      <label className="block space-y-1 text-sm">결제일<Input aria-label="결제일" type="date" value={value.paid_on} disabled={disabled || readonly} onChange={(e) => onChange?.({ ...value, paid_on: e.target.value })} /></label>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted">
            <tr>
              <th rowSpan={2} scope="col" className="w-14 whitespace-nowrap p-2 text-left">구분</th>
              <th rowSpan={2} scope="col" className="min-w-[270px] p-2 text-left">내용</th>
              <th rowSpan={2} scope="col" className="p-2 text-right">{MONEY_COLUMNS[0][1]}</th>
              <th colSpan={MONEY_COLUMNS.length - 1} className="border-l p-2 text-left">수납 방법</th>
            </tr>
            <tr>{MONEY_COLUMNS.slice(1).map(([key, label]) => <th key={key} scope="col" className="p-2 text-right">{label}</th>)}</tr>
          </thead>
          <tbody>{PAYMENT_KINDS.map(([kind, label]) => {
            const row = value.rows.find((r) => r.kind === kind)!;
            return <tr key={kind} className="border-b"><th className="whitespace-nowrap p-2 text-left">{label}</th><td className="p-1">{readonly ? <div className="whitespace-pre-wrap">{row.description || (kind !== "product" || !value.sales.length ? "-" : "")}{kind === "product" && value.sales.map((sale) => <p key={sale.product_id}>{sale.name ?? "제품"} · {sale.quantity} · 단가 {Number(sale.unit_price ?? 0).toLocaleString("ko-KR")}원</p>)}</div> : kind === "product" ? productInputs : <div className="space-y-1">
              <Input ref={input => { descriptions.current[kind] = input; }} aria-label={`${label} 내용`} placeholder="내용 직접 입력" maxLength={300} disabled={disabled} value={row.description ?? ""} onChange={(e) => updateDescription(kind, e.target.value)} />
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="outline" aria-label={`${label} 내용 수정`} disabled={disabled} onClick={() => focusField(descriptions.current[kind])}>수정</Button>
                <Button type="button" size="sm" variant="outline" aria-label={`${label} 내용 삭제`} disabled={disabled || !row.description} onClick={() => updateDescription(kind, "")}>삭제</Button>
              </div>
            </div>}</td>{MONEY_COLUMNS.map(([key, title]) => <td key={key} className="min-w-[156px] p-1 text-right">
              {readonly ? row[key].toLocaleString("ko-KR", { maximumFractionDigits: 2 }) : <MoneyInput aria-label={`${label} ${title}`} disabled={!!disabled} value={row[key]} onValueChange={(amount) => onChange?.({ ...value, rows: value.rows.map((r) => r.kind === kind ? { ...r, [key]: amount } : r) })} />}
            </td>)}</tr>;
          })}</tbody>
        </table>
      </div>
      {!readonly && <p className="text-xs text-muted-foreground">제품을 선택하고 판매 수량(2개 이상 입력 가능)·단가를 입력한 뒤 예약을 저장하면 <Link to="/attendance" search={{ tab: "products" }} className="underline">WORK → 제품</Link>의 판매내역과 재고에 자동 반영됩니다.</p>}
      <label className="block space-y-1 text-sm">계산 메모<Textarea aria-label="계산 메모" value={value.memo} maxLength={1000} disabled={disabled || readonly} onChange={(e) => onChange?.({ ...value, memo: e.target.value })} /></label>
    </section>
  );
}
