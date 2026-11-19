import { describe, expect, it } from "vitest";
import type { PaymentDraft } from "@/lib/payments";
import { saleValidation, withReservationSales } from "@/lib/reservation-sales";
const draft = (): PaymentDraft => ({ paid_on: "2099-01-01", sales: [], memo: "", version: 0, rows: [{ kind: "product", cost: 0, card: 0, bank: 0, krw: 0, jpy: 0, usd: 0, cny: 0 }] });
describe("reservation product sales", () => {
 it("fills product cost and cash for a selection and applies fractional quantity edits", () => {
   const added = withReservationSales(draft(), [{ product_id: "p", quantity: 2, unit_price: 1000 }]);
   expect(added.rows[0]).toMatchObject({ cost: 2000, krw: 2000 });
   expect(withReservationSales(added, [{ product_id: "p", quantity: 2, unit_price: 900 }]).rows[0]).toMatchObject({ cost: 1800, krw: 1800 });
   const edited = withReservationSales(added, [{ product_id: "p", quantity: .2, unit_price: 1000 }]);
   expect(edited.rows[0]).toMatchObject({ cost: 200, krw: 200 });
   expect(withReservationSales(edited, []).rows[0]).toMatchObject({ cost: 0, krw: 0 });
 });
 it("updates a card sale without adding cash and preserves manually discounted/mixed currency amounts", () => {
   const added = withReservationSales(draft(), [{ product_id: "p", quantity: 1, unit_price: 1000 }]);
   added.rows[0]!.krw = 0; added.rows[0]!.card = 1000;
   expect(withReservationSales(added, [{ product_id: "p", quantity: 2, unit_price: 1000 }]).rows[0]).toMatchObject({ card: 2000, krw: 0 });
   added.rows[0]!.cost = 900; added.rows[0]!.card = 500; added.rows[0]!.jpy = 400;
   expect(withReservationSales(added, [{ product_id: "p", quantity: 2, unit_price: 1000 }]).rows[0]).toMatchObject({ cost: 900, card: 500, jpy: 400, krw: 0 });
 });
 it("updates an account-transfer sale without duplicating cash or card", () => {
   const added = withReservationSales(draft(), [{ product_id: "p", quantity: 1, unit_price: 1200 }]);
   added.rows[0]!.krw=0; added.rows[0]!.bank=1200;
   expect(withReservationSales(added,[{ product_id: "p", quantity: 3, unit_price: 1200 }]).rows[0]).toMatchObject({cost:3600,bank:3600,card:0,krw:0});
 });
 it("rejects incomplete, duplicate and overprecision selections before saving the customer", () => {
   expect(saleValidation([{ product_id: "", quantity: 1 }])).toBeTruthy();
   expect(saleValidation([{ product_id: "p", quantity: .0001 }])).toBeTruthy();
   expect(saleValidation([{ product_id: "p", quantity: 1 }, { product_id: "p", quantity: 1 }])).toBeTruthy();
   expect(saleValidation([{ product_id: "p", quantity: .2 }])).toBeNull();
 });
});
