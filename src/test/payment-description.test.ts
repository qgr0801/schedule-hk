import { describe, expect, it } from "vitest";
import { addPaymentDescription } from "@/lib/payment-description";
import type { PaymentDraft } from "@/lib/payments";
const draft = (): PaymentDraft => ({ paid_on: "2099-01-01", sales: [{ product_id: "p", quantity: 2 }], memo: "계산메모", version: 3, rows: ["service", "care", "product"].map((kind) => ({ kind, description: "", cost: 500, card: 100, krw: 400, jpy: 0, usd: 0, cny: 0 })) });
describe("direct entry to payment content", () => {
 it("adds to only the selected category while preserving money, sale links and receipt version", () => {
   const initial = draft();
   const added = addPaymentDescription(initial, "care", "  진정관리  ");
   expect(added.rows.find((r) => r.kind === "care")).toMatchObject({ description: "진정관리", cost: 500, card: 100, krw: 400 });
   expect(added.rows.find((r) => r.kind === "service")?.description).toBe("");
   expect(added.sales).toBe(initial.sales);
   expect(added.version).toBe(3);
   expect(initial.rows[1]?.description).toBe("");
 });
 it("appends multiple names and does not duplicate a repeated registration", () => {
   const first = addPaymentDescription(draft(), "service", "울쎄라");
   const second = addPaymentDescription(first, "service", "보톡스");
   expect(second.rows[0]?.description).toBe("울쎄라 / 보톡스");
   expect(addPaymentDescription(second, "service", "울쎄라")).toBe(second);
 });
 it("rejects empty content and overflow without altering the current receipt", () => {
   const initial = draft();
   expect(() => addPaymentDescription(initial, "service", "  ")).toThrow("먼저 작성");
   initial.rows[0]!.description = "가".repeat(299);
   expect(() => addPaymentDescription(initial, "service", "관리")).toThrow("300자");
   expect(initial.rows[0]?.description).toHaveLength(299);
 });
});
