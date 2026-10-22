import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/PageHeader";
import { CardView } from "@/components/ReservationCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { bookingSettingsQuery, dbErrorMessage, meQuery, profilesQuery, SLOT_OPTIONS, STATUS_LABEL, type ResStatus } from "@/lib/app";
import {
  CARD_FIELDS, categoriesQuery, DEFAULT_CATEGORIES, DEFAULT_FIELDS, DEFAULT_STATUS_COLORS, displayQuery, isHex,
  staffColorsQuery, STATUS_ORDER, statusColorsQuery, suggestStaffColor, VIEW_LABEL,
  type CalView, type CardField, type ColorMode, type StatusColor,
} from "@/lib/display";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({
    meta: [
      { title: "색상 및 표시 설정 | Schedule HK" },
      { name: "description", content: "예약 상태·담당자·고객 구분 색상과 캘린더 카드 표시 항목을 설정합니다." },
    ],
  }),
  component: SettingsPage,
});

type Cat = { id: string; slot: number; position: number; name: string; color: string };
type Disp = Record<CalView, { fields: CardField[]; color_mode: ColorMode }>;

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <input type="color" value={isHex(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-8 w-9 cursor-pointer rounded border bg-background p-0.5" aria-label={`${label} 색상 선택`} />
      <Input
        value={text}
        maxLength={7}
        onChange={(e) => {
          const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
          setText(v);
          if (isHex(v)) onChange(v.toUpperCase());
        }}
        className={cn("h-8 w-24 font-mono text-xs", !isHex(text) && "border-destructive")}
        aria-label={`${label} HEX 코드`}
      />
    </label>
  );
}

function BookingRules() {
  const qc = useQueryClient();
  const { data } = useQuery(bookingSettingsQuery);
  const reusable = data?.cancelled_slot_reusable ?? true;
  const slot = data?.slot_minutes ?? 30;
  async function set(v: boolean) {
    const { error } = await supabase.from("booking_settings").update({ cancelled_slot_reusable: v }).eq("id", true);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success("예약 규칙이 저장되었습니다.");
    qc.invalidateQueries({ queryKey: bookingSettingsQuery.queryKey });
  }
  async function setSlot(v: number) {
    const { error } = await supabase.from("booking_settings").update({ slot_minutes: v }).eq("id", true);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success(`캘린더 이동·길이 조절 간격을 ${v}분으로 저장했습니다.`);
    qc.invalidateQueries({ queryKey: bookingSettingsQuery.queryKey });
  }
  const trial = data?.trial_mode ?? false;
  async function setTrial(v: boolean) {
    const { error } = await supabase.from("booking_settings").update({ trial_mode: v }).eq("id", true);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success(v ? "시범 운영 모드를 켰습니다." : "시범 운영 모드를 껐습니다. 이제부터 입력하는 데이터는 실제 운영 데이터로 저장됩니다.");
    qc.invalidateQueries({ queryKey: bookingSettingsQuery.queryKey });
  }
  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">시범 운영 모드</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {[true, false].map((v) => (
          <button key={String(v)} onClick={() => setTrial(v)} className={cn("rounded-lg border p-3 text-left text-sm", trial === v && "border-primary bg-accent")}>
            <b className={cn(trial === v && "text-primary")}>{v ? "켜기 (시범 운영)" : "끄기 (실제 운영)"}</b>
            <span className="mt-1 block text-xs text-muted-foreground">
              {v ? "새로 입력하는 고객·예약에 '테스트' 표시가 붙고, 모든 화면 위에 시범 운영 안내가 나옵니다." : "새로 입력하는 고객·예약은 실제 운영 데이터로 저장됩니다. 이미 '테스트'인 데이터는 그대로 테스트로 남습니다."}
            </span>
          </button>
        ))}
      </div>
      <div className="text-sm font-medium">캘린더 드래그 이동·길이 조절 간격</div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="드래그 간격">
        {SLOT_OPTIONS.map((v) => (
          <button key={v} onClick={() => setSlot(v)} className={cn("h-9 rounded-md border px-4 text-sm", slot === v ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>
            {v}분
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">예약 카드를 끌어 옮기거나 길이를 바꿀 때 이 간격으로 맞춰지고, 최소 예약 시간도 이 간격입니다.</p>
      <div className="text-sm font-medium">취소된 예약의 시간대</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {[true, false].map((v) => (
          <button key={String(v)} onClick={() => set(v)} className={cn("rounded-lg border p-3 text-left text-sm", reusable === v && "border-primary bg-accent")}>
            <b className={cn(reusable === v && "text-primary")}>{v ? "다시 예약 가능" : "다시 예약 불가"}</b>
            <span className="mt-1 block text-xs text-muted-foreground">
              {v ? "예약이 취소되면 같은 담당자·섹션의 그 시간에 새 예약을 받을 수 있습니다." : "취소된 예약도 시간을 차지해, 같은 담당자·섹션의 그 시간에는 새 예약을 받지 않습니다."}
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">중복 검사는 모든 직원의 예약을 기준으로 같은 담당자 또는 같은 섹션(시술실)의 시간 겹침을 서버에서 확인합니다.</p>
    </div>
  );
}

function SettingsPage() {
  const qc = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { data: profiles } = useQuery(profilesQuery);
  const { data: statusColors } = useQuery(statusColorsQuery);
  const { data: staffColors } = useQuery(staffColorsQuery);
  const { data: categories } = useQuery(categoriesQuery);
  const { data: display } = useQuery(displayQuery);

  const [st, setSt] = useState<Record<ResStatus, StatusColor> | null>(null);
  const [sf, setSf] = useState<Record<string, string> | null>(null);
  const [cats, setCats] = useState<Cat[] | null>(null);
  const [disp, setDisp] = useState<Disp | null>(null);
  const [pStatus, setPStatus] = useState<ResStatus>("confirmed");
  const [pView, setPView] = useState<CalView>("day");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (statusColors && !st) setSt(statusColors); }, [statusColors, st]);
  useEffect(() => {
    if (staffColors && profiles && !sf) setSf(Object.fromEntries(profiles.map((p, i) => [p.id, staffColors[p.id] ?? suggestStaffColor(i)])));
  }, [staffColors, profiles, sf]);
  useEffect(() => { if (categories && !cats) setCats(categories.map(({ id, slot, position, name, color }) => ({ id, slot, position, name, color }))); }, [categories, cats]);
  useEffect(() => { if (display && !disp) setDisp(display); }, [display, disp]);

  if (me && me.role !== "admin") return <Panel>관리자만 접근할 수 있습니다.</Panel>;
  if (!st || !sf || !cats || !disp || !profiles) return <Panel>불러오는 중…</Panel>;

  const sortedCats = [...cats].sort((a, b) => a.position - b.position);
  const done = (keys: unknown[][], msg = "설정이 저장되었습니다.") => {
    keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    toast.success(msg);
  };
  async function run(fn: () => Promise<{ error: unknown } | undefined>, keys: unknown[][]) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r?.error) { toast.error(dbErrorMessage(r.error)); return; }
    done(keys);
  }
  const firstErr = (rs: { error: unknown }[]) => ({ error: rs.find((r) => r.error)?.error ?? null });

  const saveStatus = () =>
    run(async () => firstErr(await Promise.all(STATUS_ORDER.map((s) => supabase.from("reservation_status_settings").update(st[s]).eq("status", s)))), [statusColorsQuery.queryKey]);
  const saveStaff = () =>
    run(async () => {
      const { error } = await supabase.from("staff_color_settings").upsert(Object.entries(sf).map(([user_id, color]) => ({ user_id, color })), { onConflict: "user_id" });
      return { error };
    }, [staffColorsQuery.queryKey]);
  const saveCats = () => {
    const bad = cats.find((c) => !c.name.trim() || c.name.trim().length > 20);
    if (bad) { toast.error("고객 구분 이름은 1~20자로 입력해 주세요."); return; }
    return run(async () => firstErr(await Promise.all(cats.map((c) => supabase.from("customer_categories").update({ name: c.name.trim(), color: c.color, position: c.position }).eq("id", c.id)))), [categoriesQuery.queryKey]);
  };
  const saveDisp = () =>
    run(async () => firstErr(await Promise.all((Object.keys(disp) as CalView[]).map((v) => supabase.from("calendar_display_settings").update(disp[v]).eq("view", v)))), [displayQuery.queryKey]);

  function moveCat(id: string, dir: -1 | 1) {
    const arr = sortedCats.map((c) => ({ ...c }));
    const i = arr.findIndex((c) => c.id === id);
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    setCats(arr.map((c, k) => ({ ...c, position: k + 1 })));
  }
  const restored = () => toast.info("기본값으로 되돌렸습니다. 저장을 눌러야 적용됩니다.");

  const previewStaff = profiles[0];
  const previewCats = sortedCats.slice(2, 3).concat(sortedCats.slice(3, 4));
  const footer = (save: () => unknown, restore: () => void) => (
    <div className="mt-5 flex gap-2 border-t pt-4">
      <Button disabled={busy} onClick={() => save()}>설정 저장</Button>
      <Button variant="outline" onClick={() => { restore(); restored(); }}>기본값 복원</Button>
    </div>
  );

  return (
    <div>
      <PageHeader title="색상 및 표시 설정" desc="저장한 설정은 모든 직원의 일간·주간·월간 캘린더에 바로 반영됩니다." />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Panel>
          <Tabs defaultValue="status">
            <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
              <TabsTrigger value="status">예약 상태 색상</TabsTrigger>
              <TabsTrigger value="staff">담당자별 색상</TabsTrigger>
              <TabsTrigger value="cats">고객 구분 7개</TabsTrigger>
              <TabsTrigger value="fields">예약 카드 표시 항목</TabsTrigger>
              <TabsTrigger value="rules">예약 규칙</TabsTrigger>
            </TabsList>

            <TabsContent value="status">
              <div className="space-y-3">
                {STATUS_ORDER.map((s) => (
                  <div key={s} className={cn("rounded-lg border p-3", pStatus === s && "ring-2 ring-primary")} onFocus={() => setPStatus(s)} onClick={() => setPStatus(s)}>
                    <div className="mb-2 text-sm font-semibold">{STATUS_LABEL[s]}</div>
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      <ColorField label="글자색" value={st[s].text_color} onChange={(v) => setSt({ ...st, [s]: { ...st[s], text_color: v } })} />
                      <ColorField label="배경색" value={st[s].bg_color} onChange={(v) => setSt({ ...st, [s]: { ...st[s], bg_color: v } })} />
                      <ColorField label="테두리색" value={st[s].border_color} onChange={(v) => setSt({ ...st, [s]: { ...st[s], border_color: v } })} />
                    </div>
                  </div>
                ))}
              </div>
              {footer(saveStatus, () => setSt({ ...DEFAULT_STATUS_COLORS }))}
            </TabsContent>

            <TabsContent value="staff">
              <p className="mb-3 text-xs text-muted-foreground">새 직원은 가입할 때 색상이 자동으로 제안됩니다. 카드 왼쪽 세로 띠와 담당자 라벨에 쓰입니다.</p>
              <div className="space-y-2">
                {profiles.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span className="h-4 w-1.5 rounded" style={{ background: sf[p.id] }} />{p.full_name}
                    </span>
                    <ColorField label="색상" value={sf[p.id] ?? "#2563EB"} onChange={(v) => setSf({ ...sf, [p.id]: v })} />
                  </div>
                ))}
              </div>
              {footer(saveStaff, () => setSf(Object.fromEntries(profiles.map((p, i) => [p.id, suggestStaffColor(i)]))))}
            </TabsContent>

            <TabsContent value="cats">
              <div className="space-y-2">
                {sortedCats.map((c, k) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                    <span className="w-5 text-center text-xs text-muted-foreground">{k + 1}</span>
                    <Input value={c.name} maxLength={20} onChange={(e) => setCats(cats.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))} className="h-8 w-36" aria-label="구분 이름" />
                    <ColorField label="색상" value={c.color} onChange={(v) => setCats(cats.map((x) => (x.id === c.id ? { ...x, color: v } : x)))} />
                    <div className="ml-auto flex">
                      <Button size="icon" variant="ghost" className="h-8 w-8" disabled={k === 0} onClick={() => moveCat(c.id, -1)} aria-label="위로"><ArrowUp className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" disabled={k === sortedCats.length - 1} onClick={() => moveCat(c.id, 1)} aria-label="아래로"><ArrowDown className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">이름을 바꿔도 고객과 예약에 연결된 구분은 그대로 유지됩니다.</p>
              {footer(saveCats, () => setCats(cats.map((c) => { const d = DEFAULT_CATEGORIES.find((x) => x.slot === c.slot)!; return { ...c, name: d.name, color: d.color, position: d.slot }; })))}
            </TabsContent>

            <TabsContent value="fields">
              <div className="mb-3 flex rounded-lg bg-muted p-1">
                {(["day", "week", "month"] as CalView[]).map((v) => (
                  <button key={v} onClick={() => setPView(v)} className={cn("flex-1 rounded-md py-1.5 text-sm", pView === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                    {VIEW_LABEL[v]} 보기
                  </button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {CARD_FIELDS.map((f) => (
                  <label key={f.key} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                    <Checkbox
                      disabled={f.key === "creator"}
                      checked={f.key === "creator" || disp[pView].fields.includes(f.key)}
                      onCheckedChange={(on) => {
                        const cur = disp[pView].fields;
                        const next = on ? CARD_FIELDS.map((x) => x.key).filter((k) => k === f.key || cur.includes(k)) : cur.filter((k) => k !== f.key);
                        setDisp({ ...disp, [pView]: { ...disp[pView], fields: next } });
                      }}
                    />
                    {f.label}{f.key === "creator" && <span className="text-xs text-muted-foreground">(항상 표시)</span>}
                  </label>
                ))}
              </div>
              <div className="mt-4 space-y-1">
                <div className="text-sm font-medium">색상 보기</div>
                <div className="flex gap-2">
                  {(["status", "staff"] as ColorMode[]).map((m) => (
                    <button key={m} onClick={() => setDisp({ ...disp, [pView]: { ...disp[pView], color_mode: m } })} className={cn("rounded-md border px-3 py-1.5 text-sm", disp[pView].color_mode === m && "border-primary bg-accent font-semibold text-primary")}>
                      {m === "status" ? "상태별 색상 보기" : "담당자별 색상 보기"}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                표시 항목을 켜도 열람 권한이 없는 직원에게는 고객명·연락처·상담 내용이 보이지 않습니다. 노쇼·예약 취소는 항상 상태가 표시됩니다.
              </p>
              {footer(saveDisp, () => setDisp({ day: { fields: DEFAULT_FIELDS.day, color_mode: "status" }, week: { fields: DEFAULT_FIELDS.week, color_mode: "status" }, month: { fields: DEFAULT_FIELDS.month, color_mode: "status" } }))}
            </TabsContent>
            <TabsContent value="rules">
              <BookingRules />
            </TabsContent>
          </Tabs>
        </Panel>

        <div className="space-y-3 lg:sticky lg:top-8 lg:self-start">
          <Panel className="space-y-3">
            <div className="text-sm font-semibold text-primary">미리보기 · {VIEW_LABEL[pView]} 카드</div>
            <select value={pStatus} onChange={(e) => setPStatus(e.target.value as ResStatus)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" aria-label="미리볼 상태">
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <CardView
              r={{ start_at: "2026-01-05T10:00:00", end_at: "2026-01-05T11:00:00", customer_name: "김○○", customer_phone: "010-1234-5678", service: "피부 상담", memo: "첫 방문, 민감성 피부", status: pStatus }}
              fields={disp[pView].fields.includes("creator") ? disp[pView].fields : [...disp[pView].fields, "creator"]}
              mode={disp[pView].color_mode}
              status={st[pStatus]}
              staffColor={(previewStaff && sf[previewStaff.id]) || "#7C3AED"}
              categories={previewCats}
              creatorName={me?.name ?? "김실장"}
              staffName={previewStaff?.full_name ?? "원장님"}
              compact={pView === "month"}
            />
            <div className="space-y-1.5 border-t pt-3">
              <div className="text-xs text-muted-foreground">전체 상태</div>
              {STATUS_ORDER.map((s) => (
                <CardView
                  key={s}
                  r={{ start_at: "2026-01-05T10:00:00", end_at: "2026-01-05T11:00:00", customer_name: "가상고객", customer_phone: null, service: "레이저 토닝", memo: null, status: s }}
                  fields={["time", "customer", "status"]}
                  mode="status"
                  status={st[s]}
                  staffColor={(previewStaff && sf[previewStaff.id]) || "#7C3AED"}
                  categories={[]}
                  creatorName=""
                  staffName=""
                  compact
                />
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
