import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ResStatus = Database["public"]["Enums"]["reservation_status"];
export type CalView = "day" | "week" | "month";
export type ColorMode = "status" | "staff";
export type StatusColor = { text_color: string; bg_color: string; border_color: string };
export type Category = Database["public"]["Tables"]["customer_categories"]["Row"];

export const STATUS_ORDER: ResStatus[] = ["pending", "confirmed", "completed", "no_show", "cancelled", "changed"];

export const DEFAULT_STATUS_COLORS: Record<ResStatus, StatusColor> = {
  pending: { text_color: "#B45309", bg_color: "#FEF3C7", border_color: "#F59E0B" },
  confirmed: { text_color: "#1D4ED8", bg_color: "#DBEAFE", border_color: "#2563EB" },
  completed: { text_color: "#15803D", bg_color: "#DCFCE7", border_color: "#16A34A" },
  no_show: { text_color: "#B91C1C", bg_color: "#FEE2E2", border_color: "#DC2626" },
  cancelled: { text_color: "#475569", bg_color: "#F1F5F9", border_color: "#64748B" },
  changed: { text_color: "#7E22CE", bg_color: "#F3E8FF", border_color: "#9333EA" },
};

export const DEFAULT_CATEGORIES = [
  { slot: 1, name: "신규 고객", color: "#2563EB" },
  { slot: 2, name: "기존 고객", color: "#16A34A" },
  { slot: 3, name: "VIP 고객", color: "#A855F7" },
  { slot: 4, name: "일본 고객", color: "#EC4899" },
  { slot: 5, name: "외국인 고객", color: "#06B6D4" },
  { slot: 6, name: "소개 고객", color: "#F59E0B" },
  { slot: 7, name: "기타 고객", color: "#64748B" },
];

export const STAFF_PALETTE = ["#7C3AED", "#0891B2", "#DB2777", "#EA580C", "#2563EB", "#16A34A", "#CA8A04", "#4F46E5", "#0D9488", "#BE123C"];
export const suggestStaffColor = (n: number): string => STAFF_PALETTE[((n % STAFF_PALETTE.length) + STAFF_PALETTE.length) % STAFF_PALETTE.length] ?? "#2563EB";

export const CARD_FIELDS = [
  { key: "time", label: "예약 시간" },
  { key: "customer", label: "고객명" },
  { key: "category", label: "고객 구분" },
  { key: "service", label: "시술 또는 상담 내용" },
  { key: "creator", label: "예약 등록자" },
  { key: "staff", label: "시술 담당자" },
  { key: "status", label: "예약 상태" },
  { key: "phone", label: "연락처 일부" },
  { key: "memo", label: "예약 메모" },
] as const;
export type CardField = (typeof CARD_FIELDS)[number]["key"];

export const DEFAULT_FIELDS: Record<CalView, CardField[]> = {
  day: ["time", "customer", "category", "service", "creator", "staff", "status"],
  week: ["time", "customer", "category", "service", "status"],
  month: ["time", "customer"],
};
export const VIEW_LABEL: Record<CalView, string> = { day: "일간", week: "주간", month: "월간" };

export const isHex = (v: string) => /^#[0-9A-Fa-f]{6}$/.test(v);

/** 010-1234-5678 → 010-****-5678 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.length < 7) return "****";
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
}

/** Hex color with alpha (0–1) as 8-digit hex. */
export function tint(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, "0");
  return `${hex}${a}`;
}

/**
 * Card colors: background = status (light), left stripe = treatment staff (strong),
 * in staff mode the background becomes a light staff tint and status moves to a badge.
 */
export function cardColors(mode: ColorMode, status: StatusColor, staffColor: string) {
  if (mode === "staff") {
    return { background: tint(staffColor, 0.14), color: "#0F172A", borderColor: tint(staffColor, 0.5), stripe: staffColor };
  }
  return { background: status.bg_color, color: status.text_color, borderColor: status.border_color, stripe: staffColor };
}

export const statusColorsQuery = queryOptions({
  queryKey: ["status_colors"],
  queryFn: async () => {
    const { data, error } = await supabase.from("reservation_status_settings").select("*");
    if (error) throw error;
    const map = { ...DEFAULT_STATUS_COLORS };
    for (const r of data) map[r.status] = { text_color: r.text_color, bg_color: r.bg_color, border_color: r.border_color };
    return map;
  },
});

export const staffColorsQuery = queryOptions({
  queryKey: ["staff_colors"],
  queryFn: async () => {
    const { data, error } = await supabase.from("staff_color_settings").select("*");
    if (error) throw error;
    return Object.fromEntries(data.map((r) => [r.user_id, r.color])) as Record<string, string>;
  },
});

export const categoriesQuery = queryOptions({
  queryKey: ["customer_categories"],
  queryFn: async () => {
    const { data, error } = await supabase.from("customer_categories").select("*").order("position").order("slot");
    if (error) throw error;
    return data;
  },
});

export const displayQuery = queryOptions({
  queryKey: ["calendar_display"],
  queryFn: async () => {
    const { data, error } = await supabase.from("calendar_display_settings").select("*");
    if (error) throw error;
    const out = {} as Record<CalView, { fields: CardField[]; color_mode: ColorMode }>;
    for (const v of ["day", "week", "month"] as CalView[]) {
      const row = data.find((r) => r.view === v);
      out[v] = { fields: (row?.fields as CardField[]) ?? DEFAULT_FIELDS[v], color_mode: (row?.color_mode as ColorMode) ?? "status" };
    }
    return out;
  },
});

export const customersQuery = queryOptions({
  queryKey: ["customers"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("*, customer_category_tags(category_id)")
      .order("name");
    if (error) throw error;
    return data;
  },
});
export type CustomerRow = Awaited<ReturnType<NonNullable<typeof customersQuery.queryFn>>>[number];

/** Lookup helpers shared by every calendar card. */
export function useCardLookups() {
  const { data: statusColors } = useQuery(statusColorsQuery);
  const { data: staffColors } = useQuery(staffColorsQuery);
  const { data: categories } = useQuery(categoriesQuery);
  const { data: display } = useQuery(displayQuery);
  return {
    statusColor: (s: ResStatus) => statusColors?.[s] ?? DEFAULT_STATUS_COLORS[s],
    staffColor: (id: string | null | undefined, idx = 0) => (id && staffColors?.[id]) || suggestStaffColor(idx),
    category: (id: string | null | undefined) => categories?.find((c) => c.id === id),
    categories: categories ?? [],
    display: (v: CalView) => display?.[v] ?? { fields: DEFAULT_FIELDS[v], color_mode: "status" as ColorMode },
  };
}
