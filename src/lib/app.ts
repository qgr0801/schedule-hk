import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Role = Database["public"]["Enums"]["app_role"];
export type ResStatus = Database["public"]["Enums"]["reservation_status"];
export type Visibility = Database["public"]["Enums"]["schedule_visibility"];
export type Reservation = Database["public"]["Tables"]["reservations"]["Row"];
export type Schedule = Database["public"]["Tables"]["schedules"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "최고 관리자",
  internal: "내부 직원",
  external: "외부 직원",
};
export const STATUS_LABEL: Record<ResStatus, string> = {
  pending: "예약 대기",
  confirmed: "예약 확정",
  completed: "시술 완료",
  no_show: "노쇼",
  cancelled: "예약 취소",
  changed: "예약 변경",
};
export const VIS_LABEL: Record<Visibility, string> = {
  public: "전체 공개",
  selected: "지정 직원 공개",
  private: "비공개",
};
export const ACTION_LABEL: Record<string, string> = {
  created: "등록",
  updated: "수정",
  cancelled: "취소",
  status_changed: "상태 변경",
};
export const SERVICES = [
  "피부 상담",
  "레이저 토닝",
  "보톡스",
  "필러",
  "리프팅",
  "수분 관리",
  "여드름 관리",
  "제모",
];

export type Me = { id: string; email: string; name: string; role: Role };

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<Me | null> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
    ]);
    return {
      id: user.id,
      email: user.email ?? "",
      name: p?.full_name || user.email || "",
      role: (r?.role ?? "external") as Role,
    };
  },
});

export const profilesQuery = queryOptions({
  queryKey: ["profiles"],
  queryFn: async () => {
    const { data, error } = await supabase.from("profiles").select("*").order("full_name");
    if (error) throw error;
    return data;
  },
});

export type DaySection = Database["public"]["Tables"]["day_sections"]["Row"];
export const MAX_SECTIONS = 10;

/** All 10 section slots (active or not), ordered by position. */
export const sectionsQuery = queryOptions({
  queryKey: ["day_sections"],
  queryFn: async () => {
    const { data, error } = await supabase.from("day_sections").select("*").order("position");
    if (error) throw error;
    return data;
  },
});

export function dbErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string };
  if (err?.code === "23P01") return "같은 시간대에 이미 예약이 있습니다. 다른 시간을 선택해 주세요.";
  if (err?.code === "42501") return "이 작업을 수행할 권한이 없습니다.";
  if (err?.code === "23514") return "종료 시간은 시작 시간보다 늦어야 합니다.";
  return err?.message ?? "오류가 발생했습니다.";
}

export function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
