import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { profilesQuery, ROLE_LABEL, staffEmailsQuery, type Role } from "@/lib/app";
import { describePerms, ROLE_CODE, type Perms } from "@/lib/permissions";
import { staffAccounts } from "@/lib/staff.functions";
import type { Database } from "@/integrations/supabase/types";

/** Admin-only full staff rows (profiles RLS: self or admin; e-mail comes from staff_emails()). */
export type StaffRow = { id: string; full_name: string; department: string | null; is_active: boolean; is_test: boolean; created_at: string };
export const staffProfilesQuery = queryOptions({
  queryKey: ["staff_profiles"],
  queryFn: async (): Promise<StaffRow[]> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, department, is_active, is_test, created_at")
      .order("created_at");
    if (error) throw error;
    return data;
  },
});

export const rolesQuery = queryOptions({
  queryKey: ["roles"],
  queryFn: async () => (await supabase.from("user_roles").select("*")).data ?? [],
});
export const grantsQuery = queryOptions({
  queryKey: ["grants"],
  queryFn: async () => (await supabase.from("reservation_view_grants").select("*")).data ?? [],
});
export const scopesQuery = queryOptions({
  queryKey: ["scopes"],
  queryFn: async () => (await supabase.from("staff_view_scopes").select("*")).data ?? [],
});
export const permissionLogQuery = queryOptions({
  queryKey: ["permission_log"],
  queryFn: async () => {
    const { data, error } = await supabase.from("staff_permission_log").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) throw error;
    return data;
  },
});
export const accountsQuery = queryOptions({
  queryKey: ["staff_accounts"],
  queryFn: () => staffAccounts(),
});

export type LogRow = Database["public"]["Tables"]["staff_permission_log"]["Row"];

/** Refresh everything the staff screen shows after a change. */
export function refreshStaff(qc: QueryClient) {
  for (const k of [staffProfilesQuery.queryKey, profilesQuery.queryKey, rolesQuery.queryKey, scopesQuery.queryKey, grantsQuery.queryKey, permissionLogQuery.queryKey, accountsQuery.queryKey, staffEmailsQuery.queryKey, ["me"]])
    qc.invalidateQueries({ queryKey: k });
}

/** One-line Korean description of a staff audit-log row. */
export function describeLog(l: LogRow, nameOf: (id: string | null) => string): { title: string; detail?: string } {
  const o = l.old_data as Record<string, unknown> | null;
  const n = l.new_data as Record<string, unknown> | null;
  const roleTxt = (v: unknown) => (v ? `${ROLE_CODE[v as Role]} (${ROLE_LABEL[v as Role]})` : "없음");
  if (l.kind === "role") return { title: `역할 ${roleTxt(o?.["role"])} → ${roleTxt(n?.["role"])}` };
  if (l.kind === "grant") return { title: `${nameOf(String((n ?? o)?.["owner_id"] ?? ""))} 예약 상세 열람 ${n ? "허용" : "해제"}` };
  if (l.kind === "account") {
    const action = n?.["action"];
    if (action === "invited") return { title: `초대 메일 발송 · ${roleTxt(n?.["role"])}`, detail: String(n?.["email"] ?? "") };
    if (action === "resent") return { title: "설정 메일 다시 보냄" };
    if (action === "deleted") return { title: `계정 삭제 · ${String(o?.["full_name"] ?? "")}`, detail: String(o?.["email"] ?? "") };
    if (n && "is_active" in n) return { title: n["is_active"] ? "계정 활성화" : "계정 비활성화 (로그인·데이터 접근 차단)" };
    const parts: string[] = [];
    if (o?.["full_name"] !== n?.["full_name"]) parts.push(`이름 '${String(o?.["full_name"] ?? "")}' → '${String(n?.["full_name"] ?? "")}'`);
    if ((o?.["department"] ?? null) !== (n?.["department"] ?? null)) parts.push(`부서·직책 '${String(o?.["department"] ?? "없음")}' → '${String(n?.["department"] ?? "없음")}'`);
    if (o?.["is_test"] !== n?.["is_test"]) parts.push(n?.["is_test"] ? "테스트 계정으로 표시" : "테스트 계정 표시 해제");
    return { title: "직원 정보 수정", detail: parts.join(" / ") };
  }
  return { title: "권한 변경", detail: `이전: ${describePerms(o as Partial<Perms> | null)}\n변경: ${describePerms(n as Partial<Perms> | null)}` };
}
