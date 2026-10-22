import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Ban, GripHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ReservationCard, type ResWithCustomer } from "@/components/ReservationCard";
import type { Schedule } from "@/lib/app";
import { atMinutes, HOUR_PX, layoutLanes, minutesOf, moveStart, resizeEnd } from "@/lib/drag";
import type { CalView } from "@/lib/display";
import { cn } from "@/lib/utils";

export type GridItem = { kind: "res"; r: ResWithCustomer } | { kind: "sch"; s: Schedule };
export type GridCol = {
  key: string;
  label: ReactNode;
  date: Date;
  /** Section a reservation gets when dropped here. */
  sectionFor: (r: ResWithCustomer) => number | null;
  droppable: boolean;
  items: GridItem[];
  highlight?: boolean;
};
export type MoveTarget = { r: ResWithCustomer; start: Date; end: Date; section: number | null; colLabel: string };

type Drag = {
  r: ResWithCustomer;
  mode: "move" | "resize";
  pointerId: number;
  touch: boolean;
  x0: number;
  y0: number;
  grabMin: number;
  dur: number;
  origStart: number;
  origCol: string;
  active: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};
type Ghost = { colKey: string; start: number; end: number; valid: boolean; reason: string | null };

const LONG_PRESS_MS = 400;

export function TimeGrid({
  cols, firstH, lastH, step, view, colMinWidth, name, canDrag, conflict, onRes, onSch, onEmpty, onDrop, colLabelText,
}: {
  cols: GridCol[];
  firstH: number;
  lastH: number;
  step: number;
  view: CalView;
  colMinWidth: number;
  name: (id: string) => string;
  canDrag: (r: ResWithCustomer) => boolean;
  /** Reason the slot is taken, or null. */
  conflict: (r: ResWithCustomer, start: Date, end: Date, section: number | null) => string | null;
  onRes: (r: ResWithCustomer) => void;
  onSch: (s: Schedule) => void;
  onEmpty?: ((col: GridCol, minutes: number) => void) | undefined;
  onDrop: (t: MoveTarget) => void;
  colLabelText: (col: GridCol) => string;
}) {
  const dayStart = firstH * 60;
  const dayEnd = (lastH + 1) * 60;
  const height = (lastH - firstH + 1) * HOUR_PX;
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const latest = useRef({ cols, conflict, onDrop, step, colLabelText });
  latest.current = { cols, conflict, onDrop, step, colLabelText };

  const yToMin = (y: number, top: number) => dayStart + ((y - top) / HOUR_PX) * 60;
  const pxOf = (min: number) => ((min - dayStart) / 60) * HOUR_PX;

  // Block page scrolling on touch devices only while a long-press drag is active.
  useEffect(() => {
    const stop = (e: TouchEvent) => { if (drag.current?.active) e.preventDefault(); };
    window.addEventListener("touchmove", stop, { passive: false });
    return () => window.removeEventListener("touchmove", stop);
  }, []);

  function compute(x: number, y: number): Ghost | null {
    const d = drag.current;
    if (!d) return null;
    const { cols: cs, conflict: cf, step: st } = latest.current;
    let colKey = d.origCol;
    let top: number | null = null;
    if (d.mode === "move") {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-col]");
      if (el?.dataset["col"]) colKey = el.dataset["col"];
      const colEl = el ?? document.querySelector<HTMLElement>(`[data-col="${CSS.escape(d.origCol)}"]`);
      top = colEl?.getBoundingClientRect().top ?? null;
    } else {
      top = document.querySelector<HTMLElement>(`[data-col="${CSS.escape(d.origCol)}"]`)?.getBoundingClientRect().top ?? null;
    }
    if (top == null) return null;
    const col = cs.find((c) => c.key === colKey);
    if (!col) return null;
    const raw = yToMin(y, top);
    const start = d.mode === "move" ? moveStart(raw - d.grabMin, d.dur, st, dayStart, dayEnd) : d.origStart;
    const end = d.mode === "move" ? start + d.dur : resizeEnd(d.origStart, raw, st, dayEnd);
    if (!col.droppable) return { colKey, start, end, valid: false, reason: "예약을 둘 수 없는 칸입니다" };
    const reason = cf(d.r, atMinutes(col.date, start), atMinutes(col.date, end), col.sectionFor(d.r));
    return { colKey, start, end, valid: !reason, reason };
  }

  function activate() {
    const d = drag.current;
    if (!d) return;
    d.active = true;
    setDraggingId(d.r.id);
    navigator.vibrate?.(15);
    setGhost(compute(d.x0, d.y0));
  }

  function cleanup() {
    const d = drag.current;
    if (d?.timer) clearTimeout(d.timer);
    drag.current = null;
    setGhost(null);
    setDraggingId(null);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
  }

  function onMove(e: PointerEvent) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
    if (!d.active) {
      if (d.touch) { if (dist > 8) cleanup(); return; } // finger moved early: it's a scroll
      if (dist > 4) activate();
      else return;
    }
    setGhost(compute(e.clientX, e.clientY));
  }

  function onUp(e: PointerEvent) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.active) { cleanup(); return; }
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 50);
    const g = compute(e.clientX, e.clientY);
    const { cols: cs, onDrop: drop, colLabelText: lbl } = latest.current;
    const col = cs.find((c) => c.key === g?.colKey);
    const r = d.r;
    const same = g && col && g.colKey === d.origCol && g.start === d.origStart && g.end === d.origStart + d.dur;
    cleanup();
    if (!g || !col || same) return;
    if (!g.valid) { toast.error(`이동할 수 없습니다: ${g.reason}`); return; }
    drop({ r, start: atMinutes(col.date, g.start), end: atMinutes(col.date, g.end), section: col.sectionFor(r), colLabel: lbl(col) });
  }

  function onCancel() { cleanup(); }

  function begin(e: React.PointerEvent, r: ResWithCustomer, mode: "move" | "resize", colKey: string) {
    if (!canDrag(r)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    const s = minutesOf(new Date(r.start_at));
    const en = minutesOf(new Date(r.end_at)) || 24 * 60;
    const top = (e.currentTarget.closest("[data-col]") as HTMLElement | null)?.getBoundingClientRect().top ?? 0;
    const touch = e.pointerType !== "mouse";
    drag.current = {
      r, mode, pointerId: e.pointerId, touch, x0: e.clientX, y0: e.clientY,
      grabMin: yToMin(e.clientY, top) - s, dur: en - s, origStart: s, origCol: colKey, active: false,
      timer: touch ? setTimeout(activate, LONG_PRESS_MS) : null,
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  useEffect(() => () => cleanup(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const gridStyle = { gridTemplateColumns: `56px repeat(${Math.max(cols.length, 1)}, minmax(${colMinWidth}px, 1fr))` };
  const HOURS = Array.from({ length: lastH - firstH + 1 }, (_, k) => k + firstH);
  const dragging = !!draggingId;

  return (
    <div className="min-w-fit select-none">
      <div className="sticky top-0 z-20 grid border-b bg-card" style={gridStyle}>
        <div className="border-r py-2 text-center text-xs text-muted-foreground">시간</div>
        {cols.map((c) => (
          <div key={c.key} className={cn("truncate border-r px-2 py-2 text-center text-sm font-semibold text-primary last:border-r-0", c.highlight && "bg-accent")}>
            {c.label}
          </div>
        ))}
      </div>
      <div className="grid" style={gridStyle}>
        <div className="relative border-r" style={{ height }}>
          {HOURS.map((h) => (
            <div key={h} className="absolute inset-x-0 px-1 pt-1 text-center text-xs text-muted-foreground" style={{ top: (h - firstH) * HOUR_PX }}>
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {cols.map((c) => {
          const placed = layoutLanes(c.items, (i) => {
            const s = minutesOf(new Date(i.kind === "res" ? i.r.start_at : i.s.start_at));
            const e = minutesOf(new Date(i.kind === "res" ? i.r.end_at : i.s.end_at)) || 24 * 60;
            return [s, Math.max(e, s + 15)];
          });
          const g = ghost?.colKey === c.key ? ghost : null;
          return (
            <div
              key={c.key}
              data-col={c.key}
              className={cn(
                "relative border-r last:border-r-0",
                dragging && (c.droppable ? "bg-accent/30" : "cursor-not-allowed bg-muted/70"),
                !dragging && onEmpty && c.droppable && "cursor-cell",
              )}
              style={{ height }}
              onClick={(e) => {
                if (suppressClick.current || !onEmpty || !c.droppable || e.target !== e.currentTarget) return;
                const top = e.currentTarget.getBoundingClientRect().top;
                onEmpty(c, Math.floor(yToMin(e.clientY, top) / step) * step);
              }}
            >
              {HOURS.map((h) => (
                <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-border/70" style={{ top: (h - firstH) * HOUR_PX }}>
                  <div className="absolute inset-x-0 border-t border-dashed border-border/40" style={{ top: HOUR_PX / 2 }} />
                </div>
              ))}
              {placed.map(({ item: i, lane, lanes }) => {
                const s = minutesOf(new Date(i.kind === "res" ? i.r.start_at : i.s.start_at));
                const e = minutesOf(new Date(i.kind === "res" ? i.r.end_at : i.s.end_at)) || 24 * 60;
                const style = {
                  top: pxOf(Math.max(s, dayStart)),
                  height: Math.max(pxOf(Math.min(e, dayEnd)) - pxOf(Math.max(s, dayStart)), 26),
                  left: `calc(${(lane / lanes) * 100}% + 2px)`,
                  width: `calc(${100 / lanes}% - 4px)`,
                };
                if (i.kind === "sch") {
                  return (
                    <button key={`s${i.s.id}`} onClick={() => onSch(i.s)} style={style} className="absolute z-[1] overflow-hidden rounded-md border border-primary/30 bg-accent px-2 py-1 text-left text-xs text-accent-foreground">
                      <span className="block opacity-70">{format(new Date(i.s.start_at), "HH:mm")}–{format(new Date(i.s.end_at), "HH:mm")} · 일정</span>
                      <span className="block truncate font-semibold">{i.s.title}</span>
                      <span className="block truncate opacity-70">{name(i.s.owner_id)}</span>
                    </button>
                  );
                }
                const movable = canDrag(i.r);
                return (
                  <div
                    key={i.r.id}
                    style={{ ...style, touchAction: movable ? "pan-x pan-y" : undefined, WebkitTouchCallout: "none" } as React.CSSProperties}
                    className={cn("group/card absolute z-[2]", movable && "cursor-grab active:cursor-grabbing", draggingId === i.r.id && "opacity-40")}
                    onPointerDown={(ev) => begin(ev, i.r, "move", c.key)}
                    onContextMenu={(ev) => movable && ev.preventDefault()}
                    title={movable ? "끌어서 이동 · 아래 가장자리를 끌어 길이 조절" : undefined}
                  >
                    <ReservationCard
                      r={i.r}
                      view={view}
                      name={name}
                      className="h-full"
                      onClick={() => { if (!suppressClick.current) onRes(i.r); }}
                    />
                    {movable && (
                      <div
                        role="separator"
                        aria-label="예약 길이 조절"
                        onPointerDown={(ev) => begin(ev, i.r, "resize", c.key)}
                        className="absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize items-center justify-center opacity-0 transition-opacity group-hover/card:opacity-100"
                      >
                        <GripHorizontal className="h-3 w-3 text-foreground/60" />
                      </div>
                    )}
                  </div>
                );
              })}
              {g && (
                <div
                  className={cn(
                    "pointer-events-none absolute inset-x-1 z-10 rounded-md border-2 border-dashed",
                    g.valid ? "border-primary bg-primary/15" : "border-destructive bg-destructive/15",
                  )}
                  style={{ top: pxOf(g.start), height: Math.max(pxOf(g.end) - pxOf(g.start), 20) }}
                >
                  <div className={cn("absolute -top-7 left-0 whitespace-nowrap rounded px-2 py-1 text-[11px] font-semibold shadow-card", g.valid ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground")}>
                    {!g.valid && <Ban className="mr-1 inline h-3 w-3" />}
                    {format(c.date, "M월 d일 (EEE)", { locale: ko })} {fmt(g.start)}~{fmt(g.end)}
                    {!g.valid && g.reason ? ` · ${g.reason}` : ""}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
