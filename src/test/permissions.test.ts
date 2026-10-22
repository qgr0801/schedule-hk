import { describe, expect, it } from "vitest";
import { canMenu, DEFAULT_PERMS, effectivePerms, menuForPath } from "@/lib/permissions";

describe("staff permission rules", () => {
  it("default staff template matches the requested settings", () => {
    expect(DEFAULT_PERMS.scope).toBe("own");
    expect(DEFAULT_PERMS.menus).toEqual(["dashboard", "calendar", "reservation_new", "my_reservations"]);
    expect(DEFAULT_PERMS.fields).toEqual(expect.arrayContaining(["block", "treatment", "status", "customer"]));
    for (const f of ["customerNo", "phone", "memo", "history"]) expect(DEFAULT_PERMS.fields).not.toContain(f);
  });

  it("blocks 고객 관리 for the default template", () => {
    expect(canMenu("internal", DEFAULT_PERMS, "customers")).toBe(false);
    expect(canMenu("internal", DEFAULT_PERMS, "calendar")).toBe(true);
  });

  it("admin-only menus are never opened by a checkbox", () => {
    const p = effectivePerms("internal", { menus: ["calendar", "admin_staff", "admin_settings", "admin_reservations"] });
    expect(p.menus).toEqual(["calendar"]);
    expect(canMenu("internal", { ...p, menus: ["admin_staff"] as never }, "admin_staff")).toBe(false);
  });

  it("external staff are fixed to own scope and never get customer info", () => {
    const p = effectivePerms("external", { scope: "all", fields: ["customer", "phone", "memo", "staff"] });
    expect(p.scope).toBe("own");
    expect(p.fields).not.toContain("customer");
    expect(p.fields).not.toContain("phone");
    expect(p.fields).toContain("staff");
  });

  it("admin always has every menu", () => {
    const p = effectivePerms("admin", { menus: [] });
    expect(canMenu("admin", p, "admin_staff")).toBe(true);
  });

  it("maps direct URLs to the menu that guards them", () => {
    expect(menuForPath("/customers")).toBe("customers");
    expect(menuForPath("/reservations/new")).toBe("reservation_new");
    expect(menuForPath("/admin/staff")).toBe("admin_staff");
  });
});
