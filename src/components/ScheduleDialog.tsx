import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { Globe, Users, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { meQuery, profilesQuery, dbErrorMessage, VIS_LABEL, type Visibility } from "@/lib/app";
import { employeesQuery } from "@/lib/employees";
import { EmployeeDirectory } from "@/components/EmployeeDirectory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function ScheduleDialog({ defaultDate, onClose }: { defaultDate: Date; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { data: profiles } = useQuery(profilesQuery);
  const [title, setTitle] = useState("");
  const [leave, setLeave] = useState(false);
  const [allDay, setAllDay] = useState(false);
  const [leaveStaff, setLeaveStaff] = useState("");
  const [registerEmployee, setRegisterEmployee] = useState(false);
  const { data: employees, error: employeeError } = useQuery({ ...employeesQuery, enabled: leave });
  const [lastDate, setLastDate] = useState(format(defaultDate, "yyyy-MM-dd"));
  const [busy, setBusy] = useState(false);
  const [memo, setMemo] = useState("");
  const [date, setDate] = useState(format(defaultDate, "yyyy-MM-dd"));
  const [st, setSt] = useState(format(defaultDate, "HH:mm") === "00:00" ? "09:00" : format(defaultDate, "HH:mm"));
  const [en, setEn] = useState(format(defaultDate, "HH:mm") === "00:00" ? "10:00" : format(new Date(defaultDate.getTime() + 60 * 60 * 1000), "HH:mm"));
  const [vis, setVis] = useState<Visibility>("private");
  const [shared, setShared] = useState<string[]>([]);

  async function save() {
    const staffName = employees?.find((p) => p.id === leaveStaff && p.is_active)?.name;
    if (leave && !staffName) { toast.error("직원을 선택해 주세요."); return; }
    if (!leave && !title.trim()) { toast.error("제목을 입력해 주세요."); return; }
    const start = new Date(`${date}T${leave && allDay ? "00:00" : st}`);
    const end = leave && allDay ? addDays(new Date(`${lastDate}T00:00`), 1) : new Date(`${leave ? lastDate : date}T${en}`);
    if (!(end > start)) { toast.error("종료 날짜와 시간을 확인해 주세요."); return; }
    setBusy(true);
    const { data, error } = await supabase
      .from("schedules")
      .insert({ title: leave ? `[휴무] ${staffName}` : title.trim(), memo: memo || null, start_at: start.toISOString(), end_at: end.toISOString(), visibility: leave ? "public" : vis })
      .select("id")
      .single();
    setBusy(false);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    if (!leave && vis === "selected" && shared.length) {
      const { error: e2 } = await supabase.from("schedule_shares").insert(shared.map((u) => ({ schedule_id: data.id, user_id: u })));
      if (e2) { toast.error(dbErrorMessage(e2)); return; }
    }
    toast.success("일정이 등록되었습니다.");
    qc.invalidateQueries({ queryKey: ["calendar"] });
    qc.invalidateQueries({ queryKey: ["dashboard-leaves"] });
    onClose();
  }

  const icons = { public: Globe, selected: Users, private: Lock };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>일정 · 직원 휴무 추가</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="flex items-center gap-2"><Checkbox checked={leave} onCheckedChange={(v) => setLeave(v === true)} />직원 휴무</label>
          {leave && <div className="space-y-2">
            <Label htmlFor="leave-staff">휴무 직원</Label>
            <select id="leave-staff" className="h-10 w-full rounded-md border bg-background px-3" value={leaveStaff} onChange={(e) => setLeaveStaff(e.target.value)}>
              <option value="">직원을 선택하세요</option>
              {employees?.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {employeeError && <p role="alert" className="text-sm text-destructive">직원 목록을 불러오지 못했습니다.</p>}
            {me?.role === "admin" && <Button type="button" size="sm" variant="outline" onClick={() => setRegisterEmployee((v) => !v)}>직원 등록·관리</Button>}
            {registerEmployee && me?.role === "admin" && <EmployeeDirectory />}
            <label className="flex items-center gap-2"><Checkbox checked={allDay} onCheckedChange={(v) => setAllDay(v === true)} />종일 휴무</label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-sm">시작일<Input aria-label="휴무 시작 날짜" type="date" value={date} onChange={(e) => { setDate(e.target.value); if (e.target.value > lastDate) setLastDate(e.target.value); }} /></label>
              <label className="space-y-1 text-sm">시작 시간·분<Input aria-label="휴무 시작 시간" type="time" step={60} value={st} disabled={allDay} onChange={(e) => setSt(e.target.value)} /></label>
              <label className="space-y-1 text-sm">종료일<Input aria-label="휴무 종료 날짜" type="date" min={date} value={lastDate} onChange={(e) => setLastDate(e.target.value)} /></label>
              <label className="space-y-1 text-sm">종료 시간·분<Input aria-label="휴무 종료 시간" type="time" step={60} value={en} disabled={allDay} onChange={(e) => setEn(e.target.value)} /></label>
            </div>
            <p className="text-xs text-muted-foreground">선택한 휴무 기간이 모든 직원의 캘린더에 표시됩니다.</p>
          </div>}
          {!leave && <div className="space-y-1"><Label>제목</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 원내 교육" /></div>}
          {!leave && <div className="grid grid-cols-3 gap-2">
            <Input aria-label="일정 날짜" type="date" value={date} onChange={(e) => { setDate(e.target.value); if (e.target.value > lastDate) setLastDate(e.target.value); }} className="col-span-3 sm:col-span-1" />
            <Input aria-label="일정 시작 시간" type="time" value={st} onChange={(e) => setSt(e.target.value)} />
            <Input aria-label="일정 종료 시간" type="time" value={en} onChange={(e) => setEn(e.target.value)} />
          </div>
          }
          <div className="space-y-1"><Label>메모</Label><Input value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
          {!leave && <div className="space-y-1">
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
          }
          {!leave && vis === "selected" && (
            <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg bg-muted p-3">
              {profiles?.filter((p) => p.id !== me?.id).map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={shared.includes(p.id)} onCheckedChange={(c) => setShared(c ? [...shared, p.id] : shared.filter((x) => x !== p.id))} />{p.full_name}
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">관리자는 공개 범위와 관계없이 모든 일정을 볼 수 있습니다.</p>
          <Button className="w-full" disabled={busy} onClick={save}>저장</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

