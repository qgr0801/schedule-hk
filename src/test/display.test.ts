import { describe, expect, it } from "vitest";
import { cardColors, DEFAULT_CATEGORIES, DEFAULT_STATUS_COLORS, maskPhone, STATUS_ORDER } from "@/lib/display";
import { allowedFields } from "@/components/ReservationCard";

describe("display rules", () => {
  it("masks the middle of a phone number", () => {
    expect(maskPhone("010-1234-5678")).toBe("010-****-5678");
  });

  it("uses the requested default status border colors", () => {
    expect(DEFAULT_STATUS_COLORS.pending.border_color).toBe("#F59E0B");
    expect(DEFAULT_STATUS_COLORS.confirmed.border_color).toBe("#2563EB");
    expect(DEFAULT_STATUS_COLORS.completed.border_color).toBe("#16A34A");
    expect(DEFAULT_STATUS_COLORS.no_show.border_color).toBe("#DC2626");
    expect(DEFAULT_STATUS_COLORS.cancelled.border_color).toBe("#64748B");
    expect(DEFAULT_STATUS_COLORS.changed.border_color).toBe("#9333EA");
    expect(STATUS_ORDER).toHaveLength(6);
  });

  it("has seven default customer categories", () => {
    expect(DEFAULT_CATEGORIES.map((c) => c.name)).toEqual(["신규 고객", "기존 고객", "VIP 고객", "일본 고객", "외국인 고객", "소개 고객", "기타 고객"]);
  });

  it("status mode: background is the status color, stripe is the staff color", () => {
    const c = cardColors("status", DEFAULT_STATUS_COLORS.no_show, "#7C3AED");
    expect(c.background).toBe("#FEE2E2");
    expect(c.stripe).toBe("#7C3AED");
  });

  it("staff mode: background is a light staff tint", () => {
    const c = cardColors("staff", DEFAULT_STATUS_COLORS.confirmed, "#0891B2");
    expect(c.background.startsWith("#0891B2")).toBe(true);
    expect(c.background).not.toBe(DEFAULT_STATUS_COLORS.confirmed.bg_color);
  });

  it("block view of other staff's reservations never shows customer, phone or memo without permission", () => {
    const all = ["time", "customer", "category", "service", "creator", "staff", "status", "phone", "memo"] as const;
    const block = allowedFields("block", [...all]);
    expect(block).not.toContain("customer");
    expect(block).not.toContain("phone");
    expect(block).not.toContain("memo");
    expect(block).not.toContain("category");
    expect(block).not.toContain("staff");
    expect(block).toContain("service");
    expect(block).toContain("status");
    expect(block).toContain("creator");
  });

  it("customer name shows on another staff's block only when granted", () => {
    const block = allowedFields("block", ["time", "customer", "phone", "service", "status"], ["customer", "staff"]);
    expect(block).toContain("customer");
    expect(block).not.toContain("phone");
  });

  it("detail access still hides personal info", () => {
    const detail = allowedFields("detail", ["time", "customer", "phone", "memo", "service", "category"]);
    expect(detail).toEqual(["time", "service", "category", "creator"]);
  });
});
