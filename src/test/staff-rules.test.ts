import { describe, expect, it } from "vitest";
import { canDeleteAccount, inviteState } from "@/lib/staff-rules";

const now = new Date("2026-10-22T12:00:00Z").getTime();
const base = { bannedUntil: null, invitedAt: null, confirmedAt: null, passwordSet: false };

describe("staff account states", () => {
  it("an invite is waiting for 24 hours, then expires", () => {
    expect(inviteState({ ...base, invitedAt: "2026-10-22T00:00:00Z" }, now)).toBe("invited");
    expect(inviteState({ ...base, invitedAt: "2026-10-21T11:00:00Z" }, now)).toBe("expired");
  });

  it("opened link without a password is not yet accepted; saved password is accepted", () => {
    expect(inviteState({ ...base, invitedAt: "2026-10-22T00:00:00Z", confirmedAt: "2026-10-22T01:00:00Z" }, now)).toBe("pending");
    expect(inviteState({ ...base, invitedAt: "2026-10-01T00:00:00Z", confirmedAt: "2026-10-01T01:00:00Z", passwordSet: true }, now)).toBe("active");
  });

  it("a banned account is disabled whatever its invite state", () => {
    expect(inviteState({ ...base, bannedUntil: "2126-01-01T00:00:00Z", passwordSet: true }, now)).toBe("disabled");
  });
});

describe("permanent delete", () => {
  it("only accounts with no linked reservations, customers or records can be deleted", () => {
    expect(canDeleteAccount({ reservations: 0, customers: 0, history: 0, schedules: 0, feedback: 0, auditActions: 0 })).toBe(true);
    expect(canDeleteAccount({ reservations: 1, customers: 0, history: 0, schedules: 0, feedback: 0, auditActions: 0 })).toBe(false);
    expect(canDeleteAccount({ reservations: 0, customers: 0, history: 0, schedules: 0, feedback: 0, auditActions: 3 })).toBe(false);
    expect(canDeleteAccount(null)).toBe(false);
  });
});
