import { MENUS } from "@/lib/permissions";

export const DEVICE_LABEL = { pc: "PC", mobile: "모바일", tablet: "태블릿" } as const;
export const SEVERITY_LABEL = { critical: "긴급", high: "높음", medium: "보통", low: "낮음" } as const;
export const FB_STATUS_LABEL = { open: "접수", in_progress: "처리 중", done: "완료", on_hold: "보류" } as const;
export type Device = keyof typeof DEVICE_LABEL;
export type Severity = keyof typeof SEVERITY_LABEL;
export type FbStatus = keyof typeof FB_STATUS_LABEL;

/** Menus a problem can be reported against. */
export const FEEDBACK_MENUS = ["로그인", ...MENUS.map((m) => m.label), "기타"];

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

/** Open items first, then by severity, then newest date. */
export function sortFeedback<T extends { status: string; severity: string; occurred_on: string }>(rows: T[]): T[] {
  const open = (s: string) => (s === "done" ? 1 : 0);
  return [...rows].sort(
    (a, b) =>
      open(a.status) - open(b.status) ||
      SEVERITY_ORDER.indexOf(a.severity as Severity) - SEVERITY_ORDER.indexOf(b.severity as Severity) ||
      b.occurred_on.localeCompare(a.occurred_on),
  );
}
