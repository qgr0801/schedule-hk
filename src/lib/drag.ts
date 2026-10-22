/** Pure helpers for calendar drag & drop / resize (minutes are minutes from local midnight). */

export const HOUR_PX = 72;

export function snap(min: number, step: number): number {
  return Math.round(min / step) * step;
}

/** New start for a moved card: snapped, duration kept, clamped inside the visible day. */
export function moveStart(rawStart: number, dur: number, step: number, dayStart: number, dayEnd: number): number {
  const s = snap(rawStart, step);
  return Math.min(Math.max(s, dayStart), Math.max(dayStart, dayEnd - dur));
}

/** New end for a resized card: snapped, at least one step long, not past the visible day. */
export function resizeEnd(start: number, rawEnd: number, step: number, dayEnd: number): number {
  const e = snap(rawEnd, step);
  return Math.max(start + step, Math.min(e, dayEnd));
}

export function minutesOf(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function atMinutes(day: Date, min: number): Date {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(min);
  return d;
}

export type SlotRes = { id: string; start: Date; end: Date; staff: string; section: number | null; cancelled: boolean };

/**
 * Local overlap check mirroring the server rules: same treatment staff or same section,
 * cancelled bookings only count when cancelled slots are not reusable.
 */
export function findConflict(
  moving: { id: string; staff: string; section: number | null },
  start: Date,
  end: Date,
  others: SlotRes[],
  cancelledReusable: boolean,
): "staff" | "section" | null {
  for (const o of others) {
    if (o.id === moving.id) continue;
    if (o.cancelled && cancelledReusable) continue;
    if (!(o.start < end && start < o.end)) continue;
    if (o.staff === moving.staff) return "staff";
    if (moving.section != null && o.section === moving.section) return "section";
  }
  return null;
}

/** Side-by-side lanes for overlapping items in one column. */
export function layoutLanes<T>(items: T[], range: (i: T) => [number, number]): { item: T; lane: number; lanes: number }[] {
  const sorted = [...items].sort((a, b) => range(a)[0] - range(b)[0]);
  const out: { item: T; lane: number; lanes: number }[] = [];
  let cluster: { item: T; lane: number; lanes: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    for (const c of cluster) c.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const it of sorted) {
    const [s, e] = range(it);
    if (s >= clusterEnd) { flush(); clusterEnd = -Infinity; }
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(e); } else laneEnds[lane] = e;
    cluster.push({ item: it, lane, lanes: 0 });
    clusterEnd = Math.max(clusterEnd, e);
  }
  flush();
  return out;
}
