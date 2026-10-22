import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfDay, endOfMonth, endOfWeek, format,
  isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek,
} from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Lock, Users, Globe, Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/PageHeader";
import { ReservationCard, type ResWithCustomer } from "@/components/ReservationCard";
import { ReservationDialog } from "@/components/ReservationDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TimeGrid, type GridCol, type MoveTarget } from "@/components/TimeGrid";
import { findConflict, type SlotRes } from "@/lib/drag";
import {
  bookingSettingsQuery, dbErrorMessage, MAX_SECTIONS, meQuery, profilesQuery, sectionsQuery, VIS_LABEL,
  type Schedule, type Visibility,
} from "@/lib/app";
import { cn } from "@/lib/utils";
import { useSwipe } from "@/hooks/use-swipe";
import { displayQuery, useCardLookups, type ColorMode } from "@/lib/display";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [{ title: "예약 캘린더 | Schedule HK" }] }),
  component: CalendarPage,
});

type View = "month" | "week" | "day";
type Item = { kind: "res"; r: ResWithCustomer } | { kind: "sch"; s: Schedule };

function CalendarPage() {
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(new Date());
  const [sel, setSel] = useState<ResWithCustomer | null>(null);
  const [schOpen, setSchOpen] = useState(false);
  const [schView, setSchView] = useState<Schedule | null>(null);
  const [secOpen, setSecOpen] = useState(false);
  const [staff, setStaff] = useState("");
  const [sectionF, setSectionF] = useState("");
  const [catF, setCatF] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const qc = useQueryClient();
  const L = useCardLookups();
  const { data: allSections } = useQuery(sectionsQuery);
  const { data: me } = useQuery(meQuery);
  const { data: profiles } = useQuery(profilesQuery);
  const { data: booking } = useQuery(bookingSettingsQuery);
  const navigate = useNavigate();
  const [move, setMove] = useState<MoveTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const slotStep = booking?.slot_minutes ?? 30;

  const range =
    view === "month"
      ? { from: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), to: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) }
      : view === "week"
        ? { from: startOfWeek(cursor, { weekStartsOn: 1 }), to: endOfWeek(cursor, { weekStartsOn: 1 }) }
        : { from: startOfDay(cursor), to: endOfDay(cursor) };

  const { data } = useQuery({
    queryKey: ["calendar", range.from.toISOString(), range.to.toISOString()],
    queryFn: async () => {
      const [r, s, sh] = await Promise.all([
        supabase.from("reservations").select("*, customer:customers(category_id, customer_category_tags(category_id))").gte("start_at", range.from.toISOString()).lte("start_at", range.to.toISOString()).order("start_at"),
        supabase.from("schedules").select("*").gte("start_at", range.from.toISOString()).lte("start_at", range.to.toISOString()).order("start_at"),
        supabase.rpc("calendar_reservations", { _from: range.from.toISOString(), _to: range.to.toISOString() }),
      ]);
      if (sh.error) throw sh.error;
      // Other staff's reservations: the server already removed anything this user may not see.
      const shared: ResWithCustomer[] = (sh.data ?? []).map((x) => ({
        id: x.id, created_by: x.created_by, staff_id: x.staff_id, status: x.status, section: x.section, room: x.room,
        start_at: x.start_at, end_at: x.end_at, public_service: x.public_service,
        service: x.access === "block" ? x.public_service : (x.service ?? x.public_service),
        customer_name: x.customer_name ?? "다른 직원 예약", customer_phone: x.customer_phone, memo: x.memo,
        customer_id: null, cancel_reason: null, cancelled_at: null, created_at: x.start_at, updated_at: x.start_at,
        access: x.access as ResWithCustomer["access"],
        visible: x.visible ?? [],
        customer_no: x.customer_no,
        customer: x.category_id ? { category_id: x.category_id, customer_category_tags: [] } : null,
      }));
      if (r.error) throw r.error;
      if (s.error) throw s.error;
      return { res: [...(r.data as ResWithCustomer[]), ...shared], sch: s.data };
    },
  });

  const items: Item[] = [
    ...(data?.res ?? [])
      .filter((r) => showCancelled || r.status !== "cancelled")
      .filter((r) => !staff || (r.staff_id ?? r.created_by) === staff)
      .filter((r) => !sectionF || String(r.section ?? "") === sectionF)
      .filter((r) => !catF || r.customer?.category_id === catF || !!r.customer?.customer_category_tags.some((t) => t.category_id === catF))
      .map((r) => ({ kind: "res" as const, r })),
    ...(sectionF || catF ? [] : (data?.sch ?? []).filter((s) => !staff || s.owner_id === staff).map((s) => ({ kind: "sch" as const, s }))),
  ];
  const start = (i: Item) => new Date(i.kind === "res" ? i.r.start_at : i.s.start_at);
  const dayItems = (d: Date) => items.filter((i) => isSameDay(start(i), d)).sort((a, b) => +start(a) - +start(b));
  const name = (id: string) => profiles?.find((p) => p.id === id)?.full_name ?? "";
  const step = (n: number) => setCursor(view === "month" ? addMonths(cursor, n) : view === "week" ? addWeeks(cursor, n) : addDays(cursor, n));
  const swipe = useSwipe(() => step(-1), () => step(1));
  const days = eachDayOfInterval({ start: range.from, end: range.to });
  const title =
    view === "month" ? format(cursor, "yyyy년 M월") : view === "week" ? `${format(range.from, "M.d")} – ${format(range.to, "M.d")}` : format(cursor, "M월 d일 (EEE)", { locale: ko });

  // ---------- drag & drop ----------
  const sectionName = (n: number | null) => (n ? allSections?.find((x) => x.position === n)?.name ?? `${n}번` : "미지정");
  const staffKey = (r: ResWithCustomer) => (!r.access || r.visible?.includes("staff") ? (r.staff_id ?? r.created_by) : `hidden:${r.id}`);
  const slots: SlotRes[] = (data?.res ?? []).map((r) => ({
    id: r.id, start: new Date(r.start_at), end: new Date(r.end_at), staff: staffKey(r), section: r.section, cancelled: r.status === "cancelled",
  }));
  const canDrag = (r: ResWithCustomer) => !!me && !r.access && r.status !== "cancelled" && (me.role === "admin" || r.created_by === me.id);
  const conflict = (r: ResWithCustomer, s: Date, e: Date, section: number | null) => {
    const c = findConflict({ id: r.id, staff: staffKey(r), section }, s, e, slots, booking?.cancelled_slot_reusable ?? true);
    return c === "staff" ? "같은 담당자 예약과 겹칩니다" : c === "section" ? "같은 섹션에 예약이 있습니다" : null;
  };
  async function onDrop(t: MoveTarget) {
    // Server re-check across every staff member's reservations before asking to confirm.
    const { data: ov, error } = await supabase.rpc("find_overlaps", {
      _start: t.start.toISOString(), _end: t.end.toISOString(), _staff: t.r.staff_id ?? t.r.created_by,
      _section: t.section as unknown as number, _exclude: t.r.id,
    });
    if (error) { toast.error(dbErrorMessage(error)); return; }
    if (ov?.length) {
      toast.error(ov[0]!.conflict === "staff" ? "같은 담당자의 예약과 겹쳐 이동할 수 없습니다." : "같은 섹션에 이미 예약이 있어 이동할 수 없습니다.");
      return;
    }
    setMove(t);
  }
  async function saveMove(t: MoveTarget, undo?: boolean) {
    setSaving(true);
    const before = { start_at: t.r.start_at, end_at: t.r.end_at, section: t.r.section };
    const { data: upd, error } = await supabase
      .from("reservations")
      .update({ start_at: t.start.toISOString(), end_at: t.end.toISOString(), section: t.section })
      .eq("id", t.r.id)
      .select("*, customer:customers(category_id, customer_category_tags(category_id))");
    setSaving(false);
    setMove(null);
    qc.invalidateQueries({ queryKey: ["calendar"] });
    if (error) { toast.error(`${dbErrorMessage(error)} 예약은 원래 위치로 돌아갔습니다.`); return; }
    if (!upd?.length) { toast.error("이 예약을 옮길 권한이 없습니다. 원래 위치로 돌아갔습니다."); return; }
    qc.invalidateQueries({ queryKey: ["history", t.r.id] });
    if (undo) { toast.success("이동을 되돌렸습니다."); return; }
    const moved = upd[0] as ResWithCustomer;
    toast.success("예약을 변경했습니다.", {
      duration: 8000,
      action: {
        label: "되돌리기",
        onClick: () => saveMove({ r: moved, start: new Date(before.start_at), end: new Date(before.end_at), section: before.section, colLabel: "" }, true),
      },
    });
  }
  const span = (s: Date, e: Date) => `${format(s, "M월 d일 (EEE) HH:mm", { locale: ko })}~${format(e, "HH:mm")}`;
  const allItems = items;
  const firstH = Math.min(9, ...allItems.filter((i) => isDayInRange(i)).map((i) => start(i).getHours()));
  const lastH = Math.max(20, ...allItems.filter((i) => isDayInRange(i)).map((i) => { const e = new Date(i.kind === "res" ? i.r.end_at : i.s.end_at); return Math.min(23, e.getHours() - (e.getMinutes() === 0 ? 1 : 0)); }));
  function isDayInRange(i: Item) { return view === "day" ? isSameDay(start(i), cursor) : true; }
  function newAt(d: Date, section: number | null, minutes: number) {
    navigate({
      to: "/reservations/new",
      search: { date: format(d, "yyyy-MM-dd"), start: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`, section: section || undefined },
    });
  }
  const mode = L.display(view).color_mode;
  async function setMode(m: ColorMode) {
    const { error } = await supabase.from("calendar_display_settings").update({ color_mode: m }).eq("view", view);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    qc.invalidateQueries({ queryKey: displayQuery.queryKey });
  }
  const selCls = "h-9 rounded-md border border-input bg-background px-3 text-sm";

  return (
    <div>
      <PageHeader
        title="캘린더"
        desc="카드 배경은 예약 상태, 왼쪽 띠는 담당자, 작은 배지는 고객 구분입니다."
        action={<Button variant="outline" onClick={() => setSchOpen(true)}>+ 일정 추가</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2" {...swipe}>
        <div className="flex w-full rounded-lg bg-background p-1 shadow-card sm:w-auto">
          {(["month", "week", "day"] as View[]).map((v) => (
            <button key={v} onClick={() => setView(v)} className={cn("h-10 flex-1 rounded-md px-4 text-sm sm:h-auto sm:flex-none sm:py-1.5", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              {{ month: "월간", week: "주간", day: "일간" }[v]}
            </button>
          ))}
        </div>
        <div className="flex w-full items-center gap-1 sm:w-auto">
          <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0 sm:h-9 sm:w-9" onClick={() => step(-1)} aria-label="이전"><ChevronLeft /></Button>
          <span className="min-w-0 flex-1 truncate text-center font-semibold text-primary sm:min-w-32 sm:flex-none">{title}</span>
          <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0 sm:h-9 sm:w-9" onClick={() => step(1)} aria-label="다음"><ChevronRight /></Button>
          <Button size="sm" variant="outline" className="h-10 shrink-0 sm:h-9" onClick={() => setCursor(new Date())}>오늘</Button>
          <input
            type="date"
            aria-label="날짜 선택"
            value={format(cursor, "yyyy-MM-dd")}
            onChange={(e) => { if (e.target.value) setCursor(new Date(`${e.target.value}T00:00`)); }}
            className="h-10 w-10 shrink-0 rounded-md border border-input bg-background px-1 text-sm sm:h-9 sm:w-auto sm:px-2"
          />
        </div>
        <p className="w-full text-xs text-muted-foreground md:hidden">이 줄을 손가락으로 좌우로 밀면 이전·다음 {view === "month" ? "달" : view === "week" ? "주" : "날"}로 이동합니다.</p>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {me?.role !== "external" && (
          <select value={staff} onChange={(e) => setStaff(e.target.value)} className={selCls} aria-label="담당자 필터">
            <option value="">전체 담당자</option>
            {profiles?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        )}
        <select value={sectionF} onChange={(e) => setSectionF(e.target.value)} className={selCls} aria-label="섹션 필터">
          <option value="">전체 섹션</option>
          {(allSections ?? []).filter((x) => x.active).map((x) => <option key={x.position} value={String(x.position)}>{x.name}</option>)}
        </select>
        <select value={catF} onChange={(e) => setCatF(e.target.value)} className={selCls} aria-label="고객 구분 필터">
          <option value="">전체 고객 구분</option>
          {L.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm">
          <Checkbox checked={showCancelled} onCheckedChange={(v) => setShowCancelled(!!v)} /> 취소 예약 표시
        </label>
        {me?.role === "admin" && (
          <div className="ml-auto flex rounded-lg bg-background p-1 shadow-card" role="group" aria-label="색상 보기">
            {(["status", "staff"] as ColorMode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cn("rounded-md px-3 py-1 text-xs", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                {m === "status" ? "상태별 색상" : "담당자별 색상"}
              </button>
            ))}
          </div>
        )}
      </div>

      {view === "month" && (
        <div {...swipe}>
        <Panel className="p-0">
          <div className="grid grid-cols-7 border-b text-center text-xs text-muted-foreground">
            {["월", "화", "수", "목", "금", "토", "일"].map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const its = dayItems(d);
              return (
                <button key={d.toISOString()} onClick={() => { setCursor(d); setView("day"); }} className={cn("min-h-20 border-b border-r p-1 text-left align-top sm:min-h-28", !isSameMonth(d, cursor) && "bg-muted/60 text-muted-foreground")}>
                  <div className={cn("mb-1 text-xs", isSameDay(d, new Date()) && "inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground")}>{format(d, "d")}</div>
                  <div className="hidden space-y-0.5 sm:block">
                    {its.slice(0, 3).map((i, k) =>
                      i.kind === "res" ? (
                        <ReservationCard key={k} r={i.r} view="month" name={name} compact />
                      ) : (
                        <div key={k} className="truncate rounded bg-accent px-1 text-[11px] text-accent-foreground">
                          {format(start(i), "HH:mm")} {i.s.title}
                        </div>
                      ),
                    )}
                    {its.length > 3 && <div className="text-[11px] text-muted-foreground">+{its.length - 3}건</div>}
                  </div>
                  {its.length > 0 && <div className="text-[11px] font-semibold text-primary sm:hidden">{its.length}건</div>}
                </button>
              );
            })}
          </div>
        </Panel>
        </div>
      )}

      {view === "week" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">본인 예약은 끌어서 다른 날짜·시간으로 옮기고, 아래 가장자리를 끌어 길이를 바꿀 수 있습니다{me?.role === "admin" ? " (관리자는 모든 예약)" : ""}. 휴대폰은 길게 누른 뒤 끌어 주세요.</p>
          <Panel className="max-h-[75vh] overflow-auto p-0">
            <TimeGrid
              cols={days.map((d): GridCol => ({
                key: d.toISOString(),
                label: <button onClick={() => { setCursor(d); setView("day"); }}>{format(d, "d일 (EEE)", { locale: ko })}</button>,
                date: d,
                sectionFor: (r) => r.section,
                droppable: true,
                items: dayItems(d),
                highlight: isSameDay(d, new Date()),
              }))}
              firstH={firstH} lastH={lastH} step={slotStep} view="week" colMinWidth={130} name={name}
              canDrag={canDrag} conflict={conflict} onRes={setSel} onSch={setSchView} onDrop={onDrop}
              onEmpty={(c, m) => newAt(c.date, null, m)}
              colLabelText={(c) => format(c.date, "M월 d일")}
            />
          </Panel>
        </div>
      )}

      {view === "day" && (
        <DayBoard
          items={dayItems(cursor)}
          date={cursor}
          isAdmin={me?.role === "admin"}
          name={name}
          onRes={setSel}
          onSch={setSchView}
          onSettings={() => setSecOpen(true)}
          sectionFilter={sectionF ? Number(sectionF) : null}
          grid={{ firstH, lastH, step: slotStep, canDrag, conflict, onDrop, onEmpty: (sec, m) => newAt(cursor, sec, m) }}
        />
      )}

      <ReservationDialog res={sel} onClose={() => setSel(null)} />
      <AlertDialog open={!!move} onOpenChange={(o) => { if (!o && !saving) setMove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>예약을 변경하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              {move ? (
                <div className="space-y-2 text-sm">
                  <div className="rounded-md bg-muted px-3 py-2">
                    <span className="text-muted-foreground">기존: </span>
                    {span(new Date(move.r.start_at), new Date(move.r.end_at))} / {move.r.public_service} · {sectionName(move.r.section)}
                  </div>
                  <div className="rounded-md bg-accent px-3 py-2 font-semibold text-accent-foreground">
                    <span className="font-normal">변경: </span>
                    {span(move.start, move.end)} / {move.r.public_service} · {sectionName(move.section)}
                  </div>
                </div>
              ) : <div />}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>취소</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={(e) => { e.preventDefault(); if (move) saveMove(move); }}>변경 저장</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {schOpen && <ScheduleDialog defaultDate={cursor} onClose={() => setSchOpen(false)} />}
      {secOpen && <SectionSettingsDialog onClose={() => setSecOpen(false)} />}
      {schView && (
        <Dialog open onOpenChange={(o) => !o && setSchView(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{schView.title}</DialogTitle></DialogHeader>
            <p className="text-sm">{format(new Date(schView.start_at), "M월 d일 HH:mm", { locale: ko })} – {format(new Date(schView.end_at), "HH:mm")}</p>
            <p className="text-sm text-muted-foreground">작성자 {name(schView.owner_id)} · {VIS_LABEL[schView.visibility]}</p>
            {schView.memo && <p className="whitespace-pre-wrap text-sm">{schView.memo}</p>}
            {(schView.owner_id === me?.id || me?.role === "admin") && (
              <Button variant="destructive" size="sm" className="w-fit" onClick={async () => {
                const { error } = await supabase.from("schedules").delete().eq("id", schView.id);
                if (error) { toast.error(dbErrorMessage(error)); return; }
                setSchView(null);
                toast.success("일정이 삭제되었습니다.");
              }}>일정 삭제</Button>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function ScheduleDialog({ defaultDate, onClose }: { defaultDate: Date; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { data: profiles } = useQuery(profilesQuery);
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [date, setDate] = useState(format(defaultDate, "yyyy-MM-dd"));
  const [st, setSt] = useState("09:00");
  const [en, setEn] = useState("10:00");
  const [vis, setVis] = useState<Visibility>("private");
  const [shared, setShared] = useState<string[]>([]);

  async function save() {
    if (!title.trim()) { toast.error("제목을 입력해 주세요."); return; }
    const { data, error } = await supabase
      .from("schedules")
      .insert({ title: title.trim(), memo: memo || null, start_at: new Date(`${date}T${st}`).toISOString(), end_at: new Date(`${date}T${en}`).toISOString(), visibility: vis })
      .select("id")
      .single();
    if (error) { toast.error(dbErrorMessage(error)); return; }
    if (vis === "selected" && shared.length) {
      const { error: e2 } = await supabase.from("schedule_shares").insert(shared.map((u) => ({ schedule_id: data.id, user_id: u })));
      if (e2) { toast.error(dbErrorMessage(e2)); return; }
    }
    toast.success("일정이 등록되었습니다.");
    qc.invalidateQueries({ queryKey: ["calendar"] });
    onClose();
  }

  const icons = { public: Globe, selected: Users, private: Lock };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>일반 일정 추가</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>제목</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 원내 교육" /></div>
          <div className="grid grid-cols-3 gap-2">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="col-span-3 sm:col-span-1" />
            <Input type="time" value={st} onChange={(e) => setSt(e.target.value)} />
            <Input type="time" value={en} onChange={(e) => setEn(e.target.value)} />
          </div>
          <div className="space-y-1"><Label>메모</Label><Input value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>공개 범위</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(VIS_LABEL) as Visibility[]).map((v) => {
                const I = icons[v];
                return (
                  <button key={v} type="button" onClick={() => setVis(v)} className={cn("flex flex-col items-center gap-1 rounded-lg border p-2 text-xs", vis === v && "border-primary bg-accent font-semibold text-primary")}>
                    <I className="h-4 w-4" />{VIS_LABEL[v]}
                  </button>
                );
              })}
            </div>
          </div>
          {vis === "selected" && (
            <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg bg-muted p-3">
              {profiles?.filter((p) => p.id !== me?.id).map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={shared.includes(p.id)} onCheckedChange={(c) => setShared(c ? [...shared, p.id] : shared.filter((x) => x !== p.id))} />{p.full_name}
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">관리자는 공개 범위와 관계없이 모든 일정을 볼 수 있습니다.</p>
          <Button className="w-full" onClick={save}>저장</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


type GridOpts = {
  firstH: number;
  lastH: number;
  step: number;
  canDrag: (r: ResWithCustomer) => boolean;
  conflict: (r: ResWithCustomer, s: Date, e: Date, section: number | null) => string | null;
  onDrop: (t: MoveTarget) => void;
  onEmpty: (section: number | null, minutes: number) => void;
};

function DayBoard({
  items, date, isAdmin, name, onRes, onSch, onSettings, sectionFilter, grid,
}: {
  sectionFilter: number | null;
  items: Item[];
  date: Date;
  isAdmin: boolean;
  name: (id: string) => string;
  onRes: (r: ResWithCustomer) => void;
  onSch: (s: Schedule) => void;
  onSettings: () => void;
  grid: GridOpts;
}) {
  const { data: allSections } = useQuery(sectionsQuery);
  const sections = (allSections ?? []).filter((s) => s.active && (!sectionFilter || s.position === sectionFilter));
  const activeNos = new Set(sections.map((s) => s.position));
  const colOf = (i: Item) => (i.kind === "res" && i.r.section && activeNos.has(i.r.section) ? i.r.section : 0);
  const hasOther = items.some((i) => colOf(i) === 0);
  const cols: { key: number; label: string }[] = [
    ...sections.map((s) => ({ key: s.position, label: s.name })),
    ...(hasOther ? [{ key: 0, label: "미지정 · 일정" }] : []),
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">빈 곳을 누르면 그 섹션·시간으로 예약을 등록합니다. 본인 예약은 위아래로 끌면 시간, 옆 섹션으로 끌면 섹션이 바뀝니다. 휴대폰은 길게 누른 뒤 끌어 주세요.</p>
        {isAdmin && (
          <Button size="sm" variant="outline" className="shrink-0" onClick={onSettings}>
            <Settings2 className="h-4 w-4" /> 섹션 설정 ({sections.length}개)
          </Button>
        )}
      </div>
      <Panel className="max-h-[75vh] overflow-auto p-0">
        <TimeGrid
          cols={cols.map((c): GridCol => ({
            key: String(c.key),
            label: c.label,
            date,
            sectionFor: () => c.key || null,
            droppable: c.key !== 0,
            items: items.filter((i) => colOf(i) === c.key),
          }))}
          firstH={grid.firstH} lastH={grid.lastH} step={grid.step} view="day" colMinWidth={150} name={name}
          canDrag={grid.canDrag} conflict={grid.conflict} onRes={onRes} onSch={onSch} onDrop={grid.onDrop}
          onEmpty={(c, m) => grid.onEmpty(Number(c.key) || null, m)}
          colLabelText={(c) => String(c.label)}
        />
      </Panel>
    </div>
  );
}

function SectionSettingsDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: sections } = useQuery(sectionsQuery);
  const [count, setCount] = useState<number | null>(null);
  const [names, setNames] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  if (!sections) return null;
  const n = count ?? Math.max(sections.filter((s) => s.active).length, 1);
  const nameOf = (p: number) => names[p] ?? sections.find((s) => s.position === p)?.name ?? `${p}번 룸`;

  async function save() {
    for (let p = 1; p <= n; p++) {
      const v = nameOf(p).trim();
      if (!v) { toast.error(`${p}번째 섹션 이름을 입력해 주세요.`); return; }
      if (v.length > 20) { toast.error("섹션 이름은 20자 이내로 입력해 주세요."); return; }
    }
    setBusy(true);
    const results = await Promise.all(
      sections!.map((s) => supabase.from("day_sections").update({ name: nameOf(s.position).trim() || s.name, active: s.position <= n }).eq("position", s.position)),
    );
    setBusy(false);
    const err = results.find((r) => r.error)?.error;
    if (err) { toast.error(dbErrorMessage(err)); return; }
    toast.success("섹션 설정이 저장되었습니다.");
    qc.invalidateQueries({ queryKey: ["day_sections"] });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>일간 섹션 설정</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>섹션 개수</Label>
            <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
              {Array.from({ length: MAX_SECTIONS }, (_, k) => k + 1).map((v) => (
                <button key={v} type="button" onClick={() => setCount(v)} className={cn("h-9 rounded-md border text-sm", v === n ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>섹션 이름</Label>
            {Array.from({ length: n }, (_, k) => k + 1).map((p) => (
              <div key={p} className="flex items-center gap-2">
                <span className="w-6 text-center text-xs text-muted-foreground">{p}</span>
                <Input value={nameOf(p)} maxLength={20} onChange={(e) => setNames({ ...names, [p]: e.target.value })} />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">섹션 수를 줄여도 예약은 지워지지 않고, 숨겨진 섹션의 예약은 '미지정' 칸에 표시됩니다.</p>
          <Button className="w-full" disabled={busy} onClick={save}>저장</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
