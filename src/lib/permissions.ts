import type { Role } from "@/lib/app";

/** Sidebar menus. adminOnly menus never open for non-admins, whatever is checked. */
export const MENUS = [
  { key: "dashboard", label: "대시보드", path: "/dashboard", adminOnly: false },
  { key: "calendar", label: "캘린더", path: "/calendar", adminOnly: false },
  { key: "reservation_new", label: "예약 등록", path: "/reservations/new", adminOnly: false },
  { key: "my_reservations", label: "내 예약", path: "/my-reservations", adminOnly: false },
  { key: "customers", label: "고객 관리", path: "/customers", adminOnly: false },
  { key: "admin_reservations", label: "전체 예약", path: "/admin/reservations", adminOnly: true },
  { key: "admin_staff", label: "직원 권한", path: "/admin/staff", adminOnly: true },
  { key: "admin_settings", label: "색상·표시 설정", path: "/admin/settings", adminOnly: true },
  { key: "admin_feedback", label: "시범 운영 피드백", path: "/admin/feedback", adminOnly: true },
] as const;
export type MenuKey = (typeof MENUS)[number]["key"];

/**
 * Information about other staff members' reservations.
 * fixed = always shown to everyone; pii = customer info, internal staff only.
 */
export const FIELDS = [
  { key: "block", label: "예약 블록 및 시간", fixed: true, pii: false },
  { key: "status", label: "예약 상태", fixed: true, pii: false },
  { key: "treatment", label: "공개용 시술 항목", fixed: true, pii: false },
  { key: "creator", label: "예약 등록자 이름", fixed: true, pii: false },
  { key: "staff", label: "담당자 이름", fixed: false, pii: false },
  { key: "customer", label: "고객명", fixed: false, pii: true },
  { key: "customerNo", label: "고객번호", fixed: false, pii: true },
  { key: "phone", label: "연락처", fixed: false, pii: true },
  { key: "memo", label: "상담 메모", fixed: false, pii: true },
  { key: "history", label: "고객 방문 이력", fixed: false, pii: true },
] as const;
export type FieldKey = (typeof FIELDS)[number]["key"];

export type Scope = "all" | "own" | "selected";
export const SCOPE_LABEL: Record<Scope, string> = { all: "전체", own: "본인", selected: "선택 직원" };
export const ROLE_CODE: Record<Role, string> = { admin: "ADMIN", internal: "STAFF", external: "EXTERNAL" };

export type Perms = { scope: Scope; menus: MenuKey[]; fields: FieldKey[] };

export const TEMPLATES: { key: string; label: string; desc: string; perms: Perms }[] = [
  {
    key: "default",
    label: "기본 직원",
    desc: "본인 예약 상세 · 메뉴 4개 · 다른 직원 예약은 블록·시술·상태·고객명",
    perms: {
      scope: "own",
      menus: ["dashboard", "calendar", "reservation_new", "my_reservations"],
      fields: ["block", "status", "treatment", "staff", "creator", "customer"],
    },
  },
  {
    key: "minimal",
    label: "최소 공개",
    desc: "본인 예약 상세 · 다른 직원 예약은 블록·시술·상태만",
    perms: {
      scope: "own",
      menus: ["dashboard", "calendar", "reservation_new", "my_reservations"],
      fields: ["block", "status", "treatment", "creator"],
    },
  },
  {
    key: "front",
    label: "상담실장 (내부 전체)",
    desc: "모든 예약 상세 · 고객 관리 포함 · 고객 정보 전체",
    perms: {
      scope: "all",
      menus: ["dashboard", "calendar", "reservation_new", "my_reservations", "customers"],
      fields: ["block", "status", "treatment", "staff", "creator", "customer", "customerNo", "phone", "memo", "history"],
    },
  },
];
export const DEFAULT_PERMS: Perms = TEMPLATES[0]!.perms;

/** Normalize a saved permission row for a role (mirrors the server rules). */
export function effectivePerms(role: Role, saved: Partial<Perms> | null | undefined): Perms {
  if (role === "admin") {
    return { scope: "all", menus: MENUS.map((m) => m.key), fields: FIELDS.map((f) => f.key) };
  }
  const base = { ...DEFAULT_PERMS, ...(saved ?? {}) };
  const fixed = FIELDS.filter((f) => f.fixed).map((f) => f.key);
  const menus = (base.menus ?? []).filter((k) => !MENUS.find((m) => m.key === k)?.adminOnly);
  return {
    scope: role === "external" ? "own" : base.scope,
    // A staff member with no menus left would see an empty app; fall back to the default four.
    menus: menus.length ? menus : DEFAULT_PERMS.menus,
    fields: [...new Set([...fixed, ...base.fields])].filter((k) => role === "internal" || !FIELDS.find((f) => f.key === k)?.pii),
  };
}

export function canMenu(role: Role, perms: Perms, key: MenuKey): boolean {
  if (role === "admin") return true;
  if (MENUS.find((m) => m.key === key)?.adminOnly) return false;
  return perms.menus.includes(key);
}

/** Which menu guards a pathname (longest matching prefix). */
export function menuForPath(path: string): MenuKey | null {
  const hit = [...MENUS].sort((a, b) => b.path.length - a.path.length).find((m) => path === m.path || path.startsWith(`${m.path}/`));
  return hit?.key ?? null;
}

/** Human-readable summary of a permission snapshot for the change log. */
export function describePerms(p: Partial<Perms> | null | undefined): string {
  if (!p) return "없음";
  const parts: string[] = [];
  if (p.scope) parts.push(`범위 ${SCOPE_LABEL[p.scope]}`);
  if (p.menus) parts.push(`메뉴 ${p.menus.map((k) => MENUS.find((m) => m.key === k)?.label ?? k).join("·") || "없음"}`);
  if (p.fields) parts.push(`항목 ${p.fields.map((k) => FIELDS.find((f) => f.key === k)?.label ?? k).join("·") || "없음"}`);
  return parts.join(" / ");
}
