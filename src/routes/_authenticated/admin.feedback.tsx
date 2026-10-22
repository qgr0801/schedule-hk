import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { PageHeader, Panel } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dbErrorMessage, meQuery, profilesQuery } from "@/lib/app";
import {
  DEVICE_LABEL, FB_STATUS_LABEL, FEEDBACK_MENUS, SEVERITY_LABEL, sortFeedback,
  type Device, type FbStatus, type Severity,
} from "@/lib/feedback";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/feedback")({
  head: () => ({
    meta: [
      { title: "시범 운영 피드백 | Schedule HK" },
      { name: "description", content: "시범 운영 중 직원별로 발견한 오류와 개선 요청을 기록합니다." },
    ],
  }),
  component: FeedbackPage,
});

type Row = Database["public"]["Tables"]["trial_feedback"]["Row"];
type Draft = { id?: string; reporter_id: string; occurred_on: string; device: Device; menu: string; content: string; severity: Severity; status: FbStatus };

const sel = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const SEVERITY_CLS: Record<Severity, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "border border-destructive text-destructive",
  medium: "bg-accent text-accent-foreground",
  low: "bg-muted text-muted-foreground",
};

const feedbackQuery = {
  queryKey: ["trial_feedback"],
  queryFn: async () => {
    const { data, error } = await supabase.from("trial_feedback").select("*").order("occurred_on", { ascending: false }).limit(500);
    if (error) throw error;
    return data;
  },
};

function FeedbackPage() {
  const qc = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const isAdmin = me?.role === "admin";
  const { data: profiles } = useQuery(profilesQuery);
  const { data: rows } = useQuery({ ...feedbackQuery, enabled: isAdmin });
  const [edit, setEdit] = useState<Draft | null>(null);
  const [fStaff, setFStaff] = useState("");
  const [fStatus, setFStatus] = useState<"" | FbStatus>("");

  if (me && !isAdmin) return <Panel>관리자만 접근할 수 있습니다.</Panel>;
  if (!rows || !profiles) return <Panel>불러오는 중…</Panel>;

  const name = (id: string) => profiles.find((p) => p.id === id)?.full_name ?? "알 수 없음";
  const shown = sortFeedback(rows.filter((r) => (!fStaff || r.reporter_id === fStaff) && (!fStatus || r.status === fStatus)));
  const count = (s: FbStatus) => rows.filter((r) => r.status === s).length;
  const refresh = () => qc.invalidateQueries({ queryKey: feedbackQuery.queryKey });

  async function setStatus(r: Row, status: FbStatus) {
    const { error } = await supabase.from("trial_feedback").update({ status }).eq("id", r.id);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success(`처리 상태를 '${FB_STATUS_LABEL[status]}'(으)로 바꿨습니다.`);
    refresh();
  }
  async function remove(r: Row) {
    if (!window.confirm("이 기록을 삭제할까요? 되돌릴 수 없습니다.")) return;
    const { error } = await supabase.from("trial_feedback").delete().eq("id", r.id);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success("기록을 삭제했습니다.");
    refresh();
  }
  const blank = (): Draft => ({
    reporter_id: profiles[0]?.id ?? "", occurred_on: format(new Date(), "yyyy-MM-dd"), device: "pc",
    menu: FEEDBACK_MENUS[0]!, content: "", severity: "medium", status: "open",
  });

  return (
    <div>
      <PageHeader
        title="시범 운영 피드백"
        desc="직원별로 발견한 오류와 개선 요청을 기록하고 처리 상태를 관리합니다. 관리자만 볼 수 있습니다."
        action={<Button onClick={() => setEdit(blank())}><Plus className="mr-1.5 h-4 w-4" />기록 추가</Button>}
      />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(Object.keys(FB_STATUS_LABEL) as FbStatus[]).map((s) => (
          <button key={s} onClick={() => setFStatus(fStatus === s ? "" : s)} className={cn("rounded-xl border bg-card p-3 text-left shadow-card", fStatus === s && "border-primary ring-1 ring-primary")}>
            <div className="text-xs text-muted-foreground">{FB_STATUS_LABEL[s]}</div>
            <div className="text-2xl font-bold text-primary">{count(s)}</div>
          </button>
        ))}
      </div>
      <Panel className="mb-4 grid gap-2 sm:grid-cols-3">
        <select className={sel} value={fStaff} onChange={(e) => setFStaff(e.target.value)} aria-label="작성 직원으로 거르기">
          <option value="">전체 직원</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
        <select className={sel} value={fStatus} onChange={(e) => setFStatus(e.target.value as FbStatus | "")} aria-label="처리 상태로 거르기">
          <option value="">전체 상태</option>
          {(Object.keys(FB_STATUS_LABEL) as FbStatus[]).map((s) => <option key={s} value={s}>{FB_STATUS_LABEL[s]}</option>)}
        </select>
        <div className="self-center text-sm text-muted-foreground">{shown.length}건</div>
      </Panel>

      <div className="space-y-3">
        {shown.map((r) => (
          <Panel key={r.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={cn("rounded-full px-2 py-0.5 font-semibold", SEVERITY_CLS[r.severity as Severity])}>{SEVERITY_LABEL[r.severity as Severity]}</span>
              <b className="text-sm text-primary">{name(r.reporter_id)}</b>
              <span className="text-muted-foreground">{format(new Date(`${r.occurred_on}T00:00:00`), "M월 d일")} · {DEVICE_LABEL[r.device as Device]} · {r.menu}</span>
              <div className="ml-auto flex items-center gap-1">
                <select value={r.status} onChange={(e) => setStatus(r, e.target.value as FbStatus)} className="h-8 rounded-md border border-input bg-background px-2 text-xs" aria-label="처리 상태">
                  {(Object.keys(FB_STATUS_LABEL) as FbStatus[]).map((s) => <option key={s} value={s}>{FB_STATUS_LABEL[s]}</option>)}
                </select>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="수정" onClick={() => setEdit({ ...r, device: r.device as Device, severity: r.severity as Severity, status: r.status as FbStatus })}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="삭제" onClick={() => remove(r)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className={cn("mt-2 whitespace-pre-wrap text-sm", r.status === "done" && "text-muted-foreground line-through")}>{r.content}</p>
          </Panel>
        ))}
        {shown.length === 0 && <Panel className="text-center text-sm text-muted-foreground">기록이 없습니다. 직원이 알려 준 오류나 개선 요청을 '기록 추가'로 남겨 주세요.</Panel>}
      </div>

      <FeedbackDialog draft={edit} onClose={() => setEdit(null)} profiles={profiles} myId={me?.id ?? ""} onSaved={refresh} />
    </div>
  );
}

function FeedbackDialog({ draft, onClose, profiles, myId, onSaved }: {
  draft: Draft | null; onClose: () => void; profiles: { id: string; full_name: string }[]; myId: string; onSaved: () => void;
}) {
  const [d, setD] = useState<Draft | null>(draft);
  const [busy, setBusy] = useState(false);
  useEffect(() => setD(draft), [draft]);
  const up = (p: Partial<Draft>) => setD((x) => (x ? { ...x, ...p } : x));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!d) return;
    if (!d.content.trim()) { toast.error("오류 내용을 입력해 주세요."); return; }
    setBusy(true);
    const body = { reporter_id: d.reporter_id, occurred_on: d.occurred_on, device: d.device, menu: d.menu, content: d.content.trim(), severity: d.severity, status: d.status };
    const { error } = d.id
      ? await supabase.from("trial_feedback").update(body).eq("id", d.id)
      : await supabase.from("trial_feedback").insert({ ...body, created_by: myId });
    setBusy(false);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success(d.id ? "기록을 수정했습니다." : "기록을 추가했습니다.");
    onSaved();
    onClose();
  }

  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{d?.id ? "피드백 수정" : "피드백 기록 추가"}</DialogTitle>
          <DialogDescription>고객 이름·연락처 같은 개인정보는 적지 말아 주세요.</DialogDescription>
        </DialogHeader>
        {d && (
          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fb-staff">작성 직원</Label>
                <select id="fb-staff" className={sel} value={d.reporter_id} onChange={(e) => up({ reporter_id: e.target.value })}>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fb-date">발생 날짜</Label>
                <Input id="fb-date" type="date" required value={d.occurred_on} onChange={(e) => up({ occurred_on: e.target.value })} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fb-device">사용 기기</Label>
                <select id="fb-device" className={sel} value={d.device} onChange={(e) => up({ device: e.target.value as Device })}>
                  {(Object.keys(DEVICE_LABEL) as Device[]).map((k) => <option key={k} value={k}>{DEVICE_LABEL[k]}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fb-menu">문제 발생 메뉴</Label>
                <select id="fb-menu" className={sel} value={d.menu} onChange={(e) => up({ menu: e.target.value })}>
                  {[...new Set([...FEEDBACK_MENUS, d.menu])].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fb-sev">중요도</Label>
                <select id="fb-sev" className={sel} value={d.severity} onChange={(e) => up({ severity: e.target.value as Severity })}>
                  {(Object.keys(SEVERITY_LABEL) as Severity[]).map((k) => <option key={k} value={k}>{SEVERITY_LABEL[k]}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fb-status">처리 상태</Label>
                <select id="fb-status" className={sel} value={d.status} onChange={(e) => up({ status: e.target.value as FbStatus })}>
                  {(Object.keys(FB_STATUS_LABEL) as FbStatus[]).map((k) => <option key={k} value={k}>{FB_STATUS_LABEL[k]}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fb-content">오류 내용</Label>
              <Textarea id="fb-content" rows={5} maxLength={2000} required value={d.content} onChange={(e) => up({ content: e.target.value })} placeholder="어떤 화면에서 무엇을 했을 때 어떤 문제가 생겼는지 적어 주세요." />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>취소</Button>
              <Button type="submit" disabled={busy}>저장</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
