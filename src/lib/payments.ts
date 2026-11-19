import { queryOptions } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export const MONEY_COLUMNS = [["cost", "비용(원)"], ["card", "카드(원)"], ["bank", "계좌(원)"], ["krw", "원"], ["jpy", "엔"], ["usd", "달러"], ["cny", "위엔"]] as const;
export const PAYMENT_KINDS = [["service", "시술"], ["care", "관리"], ["product", "제품"]] as const;
export type MoneyKey = typeof MONEY_COLUMNS[number][0];
export type PaymentLine = { kind: string; description?: string } & Record<MoneyKey, number>;
export type ProductSale = { product_id: string; quantity: number; name?: string; unit_price?: number };
export type PaymentDraft = { paid_on: string; rows: PaymentLine[]; sales: ProductSale[]; memo: string; version: number };
export type PaymentRecord = Database["public"]["Tables"]["customer_payments"]["Row"];
export const blankPayment = (day = format(new Date(), "yyyy-MM-dd")): PaymentDraft => ({
  paid_on: day, memo: "", sales: [], version: 0,
  rows: PAYMENT_KINDS.map(([kind]) => ({ kind, description: "", cost: 0, card: 0, bank: 0, krw: 0, jpy: 0, usd: 0, cny: 0 })),
});
export const paymentDraft = (row: PaymentRecord): PaymentDraft => ({
  paid_on: row.paid_on, rows: (row.rows as unknown as PaymentLine[]).map(line => ({ ...line, bank: Number(line.bank ?? 0) })), sales: row.sales as unknown as ProductSale[], memo: row.memo, version: row.version,
});
export const hasPayment = (p: PaymentDraft) => p.version > 0 || !!p.memo.trim() || p.sales.length > 0 || p.rows.some((r) => !!r.description?.trim() || MONEY_COLUMNS.some(([k]) => r[k] !== 0));
export const productsQuery = queryOptions({
  queryKey: ["products"],
  queryFn: async () => {
    const { data, error } = await supabase.from("products").select("*").order("name").order("id");
    if (error) throw error;
    return data;
  },
});
