import { describe, expect, it } from "vitest";
import { findConflict, layoutLanes, moveStart, resizeEnd } from "@/lib/drag";

const d = (h: number, m = 0) => new Date(2027, 0, 15, h, m);

describe("calendar drag rules", () => {
  it("moving keeps the duration and snaps to the 30-minute default", () => {
    const start = moveStart(14 * 60 + 10, 60, 30, 9 * 60, 22 * 60);
    expect(start).toBe(14 * 60);
  });

  it("snaps to the admin-selected 10/15/60-minute steps", () => {
    expect(moveStart(14 * 60 + 8, 30, 15, 0, 24 * 60)).toBe(14 * 60 + 15);
    expect(moveStart(14 * 60 + 7, 30, 10, 0, 24 * 60)).toBe(14 * 60 + 10);
    expect(moveStart(14 * 60 + 25, 30, 60, 0, 24 * 60)).toBe(14 * 60);
  });

  it("a moved card never leaves the visible day", () => {
    expect(moveStart(21 * 60 + 30, 60, 30, 9 * 60, 22 * 60)).toBe(21 * 60);
    expect(moveStart(8 * 60, 60, 30, 9 * 60, 22 * 60)).toBe(9 * 60);
  });

  it("resizing keeps at least one step (minimum booking time)", () => {
    expect(resizeEnd(10 * 60, 10 * 60 + 5, 30, 22 * 60)).toBe(10 * 60 + 30);
    expect(resizeEnd(10 * 60, 11 * 60 + 40, 30, 22 * 60)).toBe(11 * 60 + 30);
    expect(resizeEnd(10 * 60, 10 * 60 + 2, 10, 22 * 60)).toBe(10 * 60 + 10);
  });

  it("detects same staff or same section overlaps", () => {
    const others = [{ id: "b", start: d(10), end: d(11), staff: "s1", section: 2, cancelled: false }];
    expect(findConflict({ id: "a", staff: "s1", section: 5 }, d(10, 30), d(11, 30), others, true)).toBe("staff");
    expect(findConflict({ id: "a", staff: "s9", section: 2 }, d(10, 30), d(11, 30), others, true)).toBe("section");
    expect(findConflict({ id: "a", staff: "s9", section: 3 }, d(10, 30), d(11, 30), others, true)).toBeNull();
    expect(findConflict({ id: "a", staff: "s1", section: 2 }, d(11), d(12), others, true)).toBeNull();
  });

  it("cancelled bookings block the slot only when cancelled slots are not reusable", () => {
    const others = [{ id: "b", start: d(10), end: d(11), staff: "s1", section: 2, cancelled: true }];
    expect(findConflict({ id: "a", staff: "s1", section: 2 }, d(10), d(11), others, true)).toBeNull();
    expect(findConflict({ id: "a", staff: "s1", section: 2 }, d(10), d(11), others, false)).toBe("staff");
  });

  it("overlapping cards get side-by-side lanes", () => {
    const l = layoutLanes([[0, 60], [30, 90], [120, 150]] as [number, number][], (x) => x);
    expect(l.map((x) => [x.lane, x.lanes])).toEqual([[0, 2], [1, 2], [0, 1]]);
  });
});
