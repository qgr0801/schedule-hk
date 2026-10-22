import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfDay, endOfMonth, endOfWeek, format,
  isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek,
} from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Lock, Users, Globe, Settings2, Plus } from "lucide-react";
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
  dbErrorMessage, MAX_SECTIONS, meQuery, profilesQuery, sectionsQuery, VIS_LABEL,
  type Schedule, type Visibility,
} from "@/lib/app";
import { cn } from "@/lib/utils";
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
  const days = eachDayOfInterval({ start: range.from, end: range.to });
  const title =
    view === "month" ? format(cursor, "yyyy년 M월") : view === "week" ? `${format(range.from, "M.d")} – ${format(range.to, "M.d")}` : format(cursor, "M월 d일 (EEE)", { locale: ko });

  const Chip = ({ i }: { i: Item }) =>
    i.kind === "res" ? (
      <ReservationCard r={i.r} view="week" name={name} onClick={() => setSel(i.r)} />
    ) : (
      <button onClick={() => setSchView(i.s)} className="block w-full truncate rounded-md border border-primary/30 bg-accent px-2 py-2 text-left text-xs text-accent-foreground">
        <b>{format(new Date(i.s.start_at), "HH:mm")}</b> {i.s.title}
        <span className="block opacity-70">일정 · {name(i.s.owner_id)} · {VIS_LABEL[i.s.visibility]}</span>
      </button>
    );
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
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-background p-1 shadow-card">
          {(["month", "week", "day"] as View[]).map((v) => (
            <button key={v} onClick={() => setView(v)} className={cn("rounded-md px-4 py-1.5 text-sm", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              {{ month: "월간", week: "주간", day: "일간" }[v]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => step(-1)} aria-label="이전"><ChevronLeft /></Button>
          <span className="min-w-32 text-center font-semibold text-primary">{title}</span>
          <Button size="icon" variant="ghost" onClick={() => step(1)} aria-label="다음"><ChevronRight /></Button>
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>오늘</Button>
        </div>
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
      )}

      {view === "week" && (
        <div className="grid gap-3 md:grid-cols-7">
          {days.map((d) => (
            <Panel key={d.toISOString()} className={cn("p-3", isSameDay(d, new Date()) && "ring-2 ring-primary")}>
              <button onClick={() => { setCursor(d); setView("day"); }} className="mb-2 text-sm font-semibold text-primary">
                {format(d, "d일 (EEE)", { locale: ko })}
              </button>
              <div className="space-y-1.5">
                {dayItems(d).map((i, k) => <Chip key={k} i={i} />)}
                {dayItems(d).length === 0 && <p className="text-xs text-muted-foreground">일정 없음</p>}
              </div>
            </Panel>
          ))}
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
        />
      )}

      <ReservationDialog res={sel} onClose={() => setSel(null)} />
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


function DayBoard({
  items, date, isAdmin, name, onRes, onSch, onSettings, sectionFilter,
}: {
  sectionFilter: number | null;
  items: Item[];
  date: Date;
  isAdmin: boolean;
  name: (id: string) => string;
  onRes: (r: ResWithCustomer) => void;
  onSch: (s: Schedule) => void;
  onSettings: () => void;
}) {
  const navigate = useNavigate();
  const { data: allSections } = useQuery(sectionsQuery);
  const sections = (allSections ?? []).filter((s) => s.active && (!sectionFilter || s.position === sectionFilter));
  const activeNos = new Set(sections.map((s) => s.position));
  const colOf = (i: Item) => (i.kind === "res" && i.r.section && activeNos.has(i.r.section) ? i.r.section : 0);
  const hasOther = items.some((i) => colOf(i) === 0);
  const cols: { key: number; label: string }[] = [
    ...sections.map((s) => ({ key: s.position, label: s.name })),
    ...(hasOther ? [{ key: 0, label: "미지정 · 일정" }] : []),
  ];
  const startOf = (i: Item) => new Date(i.kind === "res" ? i.r.start_at : i.s.start_at);
  const endOf = (i: Item) => new Date(i.kind === "res" ? i.r.end_at : i.s.end_at);
  const hrs = items.map((i) => startOf(i).getHours());
  const firstH = Math.min(9, ...hrs);
  const lastH = Math.max(21, ...hrs);
  const HOURS = Array.from({ length: lastH - firstH + 1 }, (_, k) => k + firstH);
  const gridStyle = { gridTemplateColumns: `56px repeat(${Math.max(cols.length, 1)}, minmax(150px, 1fr))` };

  function newAt(section: number, h: number) {
    navigate({
      to: "/reservations/new",
      search: { date: format(date, "yyyy-MM-dd"), start: `${String(h).padStart(2, "0")}:00`, section: section || undefined },
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">빈 칸을 누르면 해당 섹션·시간으로 예약을 등록합니다.</p>
        {isAdmin && (
          <Button size="sm" variant="outline" onClick={onSettings}>
            <Settings2 className="h-4 w-4" /> 섹션 설정 ({sections.length}개)
          </Button>
        )}
      </div>
      <Panel className="overflow-x-auto p-0">
        <div className="min-w-fit">
          <div className="sticky top-0 z-10 grid border-b bg-card" style={gridStyle}>
            <div className="border-r py-2 text-center text-xs text-muted-foreground">시간</div>
            {cols.map((c) => (
              <div key={c.key} className="truncate border-r px-2 py-2 text-center text-sm font-semibold text-primary last:border-r-0">
                {c.label}
              </div>
            ))}
          </div>
          {HOURS.map((h) => (
            <div key={h} className="grid min-h-16 border-b last:border-b-0" style={gridStyle}>
              <div className="border-r py-2 text-center text-xs text-muted-foreground">{String(h).padStart(2, "0")}:00</div>
              {cols.map((c) => {
                const its = items.filter((i) => colOf(i) === c.key && startOf(i).getHours() === h);
                return (
                  <div key={c.key} className="group relative space-y-1 border-r p-1 last:border-r-0">
                    {its.map((i, k) =>
                      i.kind === "res" ? (
                        <ReservationCard key={k} r={i.r} view="day" name={name} onClick={() => onRes(i.r)} />
                      ) : (
                        <button key={k} onClick={() => onSch(i.s)} className="block w-full rounded-md border border-primary/30 bg-accent px-2 py-1.5 text-left text-xs text-accent-foreground">
                          <span className="block opacity-70">{format(startOf(i), "HH:mm")}–{format(endOf(i), "HH:mm")} · 일정</span>
                          <span className="block truncate font-semibold">{i.s.title}</span>
                          <span className="block truncate opacity-70">{name(i.s.owner_id)}</span>
                        </button>
                      ),
                    )}
                    {c.key !== 0 && its.length === 0 && (
                      <button
                        aria-label={`${c.label} ${h}시 예약 등록`}
                        onClick={() => newAt(c.key, h)}
                        className="absolute inset-0 flex items-center justify-center text-muted-foreground opacity-0 transition-opacity hover:bg-accent/50 focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
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
