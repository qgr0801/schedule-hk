import type { PaymentDraft } from "@/lib/payments";
export function addPaymentDescription(payment: PaymentDraft, kind: "service" | "care", text: string): PaymentDraft {
  const entry = text.trim();
  if (!entry) throw new Error("직접입력 내용을 먼저 작성해 주세요.");
  const row = payment.rows.find((r) => r.kind === kind);
  if (!row) throw new Error("계산 항목을 불러온 뒤 다시 등록해 주세요.");
  const existing = row.description?.trim() ?? "";
  if (existing === entry || existing.split(" / ").includes(entry)) return payment;
  const description = existing ? `${existing} / ${entry}` : entry;
  if (description.length > 300) throw new Error("계산 내역의 내용은 300자까지 등록할 수 있습니다.");
  return { ...payment, rows: payment.rows.map((r) => r.kind === kind ? { ...r, description } : r) };
}
