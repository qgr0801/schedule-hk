import { describe, expect, it } from "vitest";
import { sortFeedback } from "@/lib/feedback";
import { passwordProblem } from "@/lib/password";
import { canMenu, effectivePerms, menuForPath } from "@/lib/permissions";

describe("trial operation rules", () => {
  it("feedback screen is admin only, even if a staff row lists it", () => {
    expect(menuForPath("/admin/feedback")).toBe("admin_feedback");
    const p = effectivePerms("internal", { menus: ["calendar", "admin_feedback"] as never });
    expect(p.menus).not.toContain("admin_feedback");
    expect(canMenu("internal", p, "admin_feedback")).toBe(false);
    expect(canMenu("admin", effectivePerms("admin", null), "admin_feedback")).toBe(true);
  });

  it("staff passwords need 8+ characters with letters and digits, typed twice", () => {
    expect(passwordProblem("abc1234", "abc1234")).not.toBeNull();
    expect(passwordProblem("abcdefgh", "abcdefgh")).not.toBeNull();
    expect(passwordProblem("12345678", "12345678")).not.toBeNull();
    expect(passwordProblem("abcd1234", "abcd1235")).not.toBeNull();
    expect(passwordProblem("abcd1234", "abcd1234")).toBeNull();
  });

  it("open feedback comes before done, then by severity", () => {
    const rows = [
      { id: "a", status: "done", severity: "critical", occurred_on: "2026-10-24" },
      { id: "b", status: "open", severity: "low", occurred_on: "2026-10-25" },
      { id: "c", status: "in_progress", severity: "high", occurred_on: "2026-10-23" },
    ];
    expect(sortFeedback(rows).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});

describe("first login of an invited staff member", () => {
  it("new staff without saved permissions get dashboard, calendar, new reservation and my reservations", () => {
    for (const role of ["internal", "external"] as const) {
      const p = effectivePerms(role, null);
      expect(p.menus).toEqual(["dashboard", "calendar", "reservation_new", "my_reservations"]);
      expect(p.scope).toBe("own");
      for (const f of ["customerNo", "phone", "memo", "history"]) expect(p.fields).not.toContain(f);
    }
  });

  it("an empty or admin-only menu list never leaves a staff member with no menus", () => {
    expect(effectivePerms("internal", { menus: [] }).menus).toEqual(["dashboard", "calendar", "reservation_new", "my_reservations"]);
    expect(effectivePerms("external", { menus: ["admin_staff"] as never }).menus).toEqual(["dashboard", "calendar", "reservation_new", "my_reservations"]);
  });
});
