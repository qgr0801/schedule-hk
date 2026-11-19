import type { PaymentDraft, ProductSale } from "@/lib/payments";
const total = (sales: ProductSale[]) => Math.round(sales.reduce((sum, s) => sum + s.quantity * Number(s.unit_price ?? 0), 0) * 100) / 100;
export function withReservationSales(value: PaymentDraft, sales: ProductSale[]): PaymentDraft {
  const previous = total(value.sales), next = total(sales);
  return { ...value, sales, rows: value.rows.map((r) => {
    if (r.kind !== "product") return r;
    const changed = { ...r, cost: r.cost === 0 || r.cost === previous ? next : r.cost };
    const noForeign = !r.jpy && !r.usd && !r.cny;
    if (noForeign && !r.bank && !r.card && (r.krw === 0 || r.krw === previous)) changed.krw = next;
    else if (noForeign && !r.bank && !r.krw && r.card === previous) changed.card = next;
    else if (noForeign && !r.card && !r.krw && r.bank === previous) changed.bank = next;
    return changed;
  }) };
}
export function saleValidation(sales: ProductSale[]): string | null {
  if (sales.some((s) => !s.product_id || !Number.isFinite(s.quantity) || s.quantity < 0.001 || s.quantity > 100000 || Math.abs(s.quantity * 1000 - Math.round(s.quantity * 1000)) > 0.000001)) return "판매 제품과 수량을 확인해 주세요. 수량은 소수점 3자리까지 가능합니다.";
  if (sales.some((s) => s.unit_price !== undefined && (!Number.isFinite(s.unit_price) || s.unit_price < 0 || Math.abs(s.unit_price * 100 - Math.round(s.unit_price * 100)) > 0.000001))) return "판매단가는 0 이상, 소수점 2자리까지 입력해 주세요.";
  if (new Set(sales.map((s) => s.product_id)).size !== sales.length) return "같은 제품은 한 줄에서 수량을 합쳐 주세요.";
  return null;
}
