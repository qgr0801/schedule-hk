import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, startOfMonth } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { meQuery, dbErrorMessage } from "@/lib/app";
import { employeesQuery } from "@/lib/employees";
import { PageHeader, Panel } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/attendance")({
  head: () => ({ meta: [{ title: "프리랜서 출근부 | Schedule HK" }] }),
  component: Attendance,
});
const hours = (minutes: number) => `${Math.floor(minutes / 60)}시간 ${Math.round(minutes % 60)}분`;

function Attendance() {
  const qc = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const canView = me?.role === "admin" || me?.role === "internal";
  const canEdit = canView;
  const { data: employees } = useQuery({ ...employeesQuery, enabled: canView });
  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [id, setId] = useState<string>(() => crypto.randomUUID());
  const [employee, setEmployee] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const valid = !!from && !!to && from <= to;
  const rangeStart = valid ? new Date(`${from}T00:00`).toISOString() : "";
  const rangeEnd = valid ? addDays(new Date(`${to}T00:00`), 1).toISOString() : "";
  const list = useQuery({
    queryKey: ["attendance", rangeStart, rangeEnd, filter, page],
    enabled: canView && valid,
    queryFn: async () => {
      let q = supabase.from("freelancer_attendance").select("*").lt("start_at", rangeEnd).gt("end_at", rangeStart).order("start_at", { ascending: false }).order("id");
      if (filter) q = q.eq("employee_id", filter);
      const { data, error } = await q.range(page * 30, page * 30 + 29);
      if (error) throw error;
      return data;
    },
  });
  const summary = useQuery({
    queryKey: ["attendance-summary", rangeStart, rangeEnd, filter],
    enabled: canView && valid,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("attendance_summary", { _from: rangeStart, _to: rangeEnd, ...(filter ? { _employee: filter } : {}) });
      if (error) throw error;
      return data;
    },
  });
  const reset = () => { setId(crypto.randomUUID()); setEmployee(""); setStart(""); setEnd(""); setMemo(""); setEditing(false); };
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !canEdit) return;
    if (!employee || !start || !end || !(new Date(end) > new Date(start))) { toast.error("직원과 시작·종료 일시를 확인해 주세요."); return; }
    setBusy(true);
    const row = { employee_id: employee, start_at: new Date(start).toISOString(), end_at: new Date(end).toISOString(), memo };
    const result = editing
      ? await supabase.from("freelancer_attendance").update(row).eq("id", id).select("id").single()
      : await supabase.from("freelancer_attendance").upsert({ id, ...row }, { onConflict: "id" }).select("id").single();
    setBusy(false);
    if (result.error) { toast.error(result.error.code === "23P01" ? "같은 직원의 근무시간이 겹칩니다." : dbErrorMessage(result.error)); return; }
    qc.invalidateQueries({ queryKey: ["attendance"] });
    qc.invalidateQueries({ queryKey: ["attendance-summary"] });
    reset();
    toast.success("출근 기록을 저장했습니다.");
  }
  if (!canView) return <p>출근부 열람 권한이 없습니다.</p>;
  return <div className="space-y-4">
    <PageHeader title="프리랜서 출근부" />
    {canEdit && <Panel>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">직원명<select aria-label="출근부 직원" className="h-10 w-full rounded border bg-background px-2" required value={employee} onChange={(e) => setEmployee(e.target.value)}>
          <option value="">직원 선택</option>{employees?.filter((p) => p.is_active || p.id === employee).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
        <div className="self-end text-sm">{start && end && new Date(end) > new Date(start) ? hours((+new Date(end) - +new Date(start)) / 60000) : "시작·종료 일시를 입력하세요."}</div>
        <label className="space-y-1 text-sm">시작<Input aria-label="출근 시작" type="datetime-local" step={60} required value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="space-y-1 text-sm">종료<Input aria-label="출근 종료" type="datetime-local" step={60} required value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        <Input aria-label="출근부 메모" placeholder="메모" maxLength={500} value={memo} onChange={(e) => setMemo(e.target.value)} />
        <div className="flex gap-2"><Button disabled={busy}>{editing ? "수정 저장" : "출근 기록 등록"}</Button>{editing && <Button type="button" variant="outline" disabled={busy} onClick={reset}>취소</Button>}</div>
      </form>
    </Panel>}
    <Panel className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">조회 시작일<Input type="date" aria-label="출근 조회 시작일" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} /></label>
        <label className="text-sm">조회 종료일<Input type="date" aria-label="출근 조회 종료일" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} /></label>
        <select aria-label="출근부 직원 필터" className="h-10 rounded border bg-background px-2 text-sm" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }}><option value="">전체 직원</option>{employees?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </div>
      {!valid && <p role="alert">조회 기간을 확인해 주세요.</p>}
      {(list.error || summary.error) && <p role="alert">출근부를 불러오지 못했습니다.</p>}
      {summary.isPending && valid && <p>근무시간을 불러오는 중입니다.</p>}
      {summary.data && <div className="rounded bg-muted p-3">
        <p className="font-semibold">조회 기간 총 근무시간 · {hours(summary.data.reduce((sum, r) => sum + Number(r.minutes), 0))}</p>
        {summary.data.map((r) => <p key={r.employee_id} className="text-sm">{employees?.find((p) => p.id === r.employee_id)?.name ?? "직원"} · {hours(Number(r.minutes))}</p>)}
      </div>}
      <p className="text-xs text-muted-foreground">조회 기간에 해당하는 시간만 합산합니다.</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
        <thead><tr><th>직원명</th><th>시작</th><th>종료</th><th>합계(시·분)</th><th>메모</th>{canEdit && <th>수정</th>}</tr></thead>
        <tbody>{list.data?.map((r) => <tr key={r.id} className="border-b"><td className="py-3">{employees?.find((p) => p.id === r.employee_id)?.name}</td><td>{format(new Date(r.start_at), "yyyy.MM.dd HH:mm")}</td><td>{format(new Date(r.end_at), "yyyy.MM.dd HH:mm")}</td><td>{hours((+new Date(r.end_at) - +new Date(r.start_at)) / 60000)}</td><td>{r.memo}</td>{canEdit && <td><Button size="sm" variant="outline" onClick={() => { setEditing(true); setId(r.id); setEmployee(r.employee_id); setStart(format(new Date(r.start_at), "yyyy-MM-dd'T'HH:mm")); setEnd(format(new Date(r.end_at), "yyyy-MM-dd'T'HH:mm")); setMemo(r.memo); }}>수정</Button></td>}</tr>)}</tbody>
      </table></div>
      {list.data?.length === 0 && <p className="text-sm">해당 기간의 출근 기록이 없습니다.</p>}
      <div className="flex gap-2"><Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>이전</Button><Button variant="outline" disabled={list.data?.length !== 30} onClick={() => setPage(page + 1)}>다음</Button></div>
    </Panel>
  </div>;
}
