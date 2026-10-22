import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/PageHeader";
import { CategoryBadge, type ResWithCustomer } from "@/components/ReservationCard";
import { ACTION_LABEL, dbErrorMessage, meQuery, profilesQuery, sectionsQuery, STATUS_LABEL, type Reservation, type ResStatus } from "@/lib/app";
import { STATUS_ORDER, useCardLookups } from "@/lib/display";
import { cn } from "@/lib/utils";

export function ReservationDialog({ res, onClose }: { res: (Reservation & Partial<Pick<ResWithCustomer, "customer" | "access" | "visible" | "customer_no">>) | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { data: profiles } = useQuery(profilesQuery);
  const { data: sections } = useQuery(sectionsQuery);
  const L = useCardLookups();
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(false);
  const history = useQuery({
    queryKey: ["history", res?.id],
    enabled: !!res && !res.access,
    queryFn: async () => {
      const { data, error } = await supabase.from("reservation_history").select("*").eq("reservation_id", res!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const statusHistory = useQuery({
    queryKey: ["status_history", res?.id],
    enabled: !!res && !res.access,
    queryFn: async () => {
      const { data, error } = await supabase.from("reservation_status_history").select("*").eq("reservation_id", res!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const canVisits = !!res && (!res.access || !!res.visible?.includes("history"));
  const visits = useQuery({
    queryKey: ["visits", res?.id],
    enabled: canVisits,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("customer_visit_history", { _reservation: res!.id });
      if (error) throw error;
      return data;
    },
  });
  if (!res) return null;
  const name = (id: string | null) => (id ? profiles?.find((p) => p.id === id)?.full_name ?? "알 수 없음" : "시스템");
  const sectionName = sections?.find((s) => s.position === res.section)?.name ?? res.room;
  const canEdit = !!me && (me.role === "admin" || me.id === res.created_by);
  const canChange = canEdit && (res.status !== "cancelled" || me?.role === "admin");
  const cats = [res.customer?.category_id, ...(res.customer?.customer_category_tags ?? []).map((t) => t.category_id)]
    .filter((id, i, a): id is string => !!id && a.indexOf(id) === i)
    .map((id) => L.category(id))
    .filter((c) => !!c);

  const visitList = canVisits && (
    <div className="border-t pt-4">
      <h4 className="mb-2 text-sm font-semibold text-primary">고객 방문 이력 {visits.data && `(${visits.data.filter((v) => v.status === "completed").length}회 방문)`}</h4>
      <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
        {visits.data?.map((v, k) => (
          <li key={k} className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-1.5">
            <span>{format(new Date(v.start_at), "yyyy.MM.dd HH:mm")} · {v.public_service}</span>
            <StatusBadge status={v.status} />
          </li>
        ))}
        {visits.data?.length === 0 && <li className="text-xs text-muted-foreground">고객 정보가 연결되지 않은 예약입니다.</li>}
      </ul>
    </div>
  );

  if (res.access) {
    const v = (k: string) => !!res.visible?.includes(k);
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {v("customer") ? res.customer_name : "다른 직원 예약"} <StatusBadge status={res.status} />
              {res.access === "detail" && cats.map((c) => <CategoryBadge key={c!.id} cat={c!} />)}
            </DialogTitle>
          </DialogHeader>
          <dl className="grid grid-cols-[80px_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">예약 항목</dt><dd>{res.public_service}</dd>
            {res.access === "detail" && (<><dt className="text-muted-foreground">상세 시술</dt><dd>{res.service}</dd></>)}
            {v("customer") && (<><dt className="text-muted-foreground">고객명</dt><dd>{res.customer_name}</dd></>)}
            {v("customerNo") && (<><dt className="text-muted-foreground">고객번호</dt><dd>{res.customer_no ? `No.${res.customer_no}` : "-"}</dd></>)}
            {v("phone") && (<><dt className="text-muted-foreground">연락처</dt><dd>{res.customer_phone || "-"}</dd></>)}
            {v("memo") && (<><dt className="text-muted-foreground">메모</dt><dd className="whitespace-pre-wrap">{res.memo || "-"}</dd></>)}
            <dt className="text-muted-foreground">등록</dt><dd>{name(res.created_by)}</dd>
            <dt className="text-muted-foreground">일시</dt>
            <dd>{format(new Date(res.start_at), "M월 d일 (EEE) HH:mm", { locale: ko })} – {format(new Date(res.end_at), "HH:mm")}</dd>
            {v("staff") && (<><dt className="text-muted-foreground">담당</dt><dd>{name(res.staff_id ?? res.created_by)}</dd></>)}
            <dt className="text-muted-foreground">섹션</dt><dd>{sectionName || "미지정"}</dd>
          </dl>
          {visitList}
          <p className="text-xs text-muted-foreground">
            다른 직원의 예약은 관리자가 허용한 정보만 보입니다. 수정·취소는 등록자와 관리자만 할 수 있습니다.
          </p>
        </DialogContent>
      </Dialog>
    );
  }

  async function apply(status: ResStatus) {
    setBusy(true);
    const patch = status === "cancelled" ? { status, cancel_reason: reason.trim() || null } : { status };
    const { data, error } = await supabase.from("reservations").update(patch).eq("id", res!.id).select("id");
    setBusy(false);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    if (!data?.length) { toast.error("이 예약의 상태를 변경할 권한이 없습니다."); return; }
    toast.success(status === "cancelled" ? "예약이 취소되었습니다. 이력은 보관됩니다." : `'${STATUS_LABEL[status]}'(으)로 변경되었습니다.`);
    qc.invalidateQueries();
    setConfirming(false);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {res.customer_name} <StatusBadge status={res.status} />
            {cats.map((c) => <CategoryBadge key={c!.id} cat={c!} />)}
          </DialogTitle>
        </DialogHeader>
        <dl className="grid grid-cols-[80px_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">예약자</dt><dd>{res.customer_name}</dd>
          <dt className="text-muted-foreground">시술</dt><dd>{res.service}</dd>
          <dt className="text-muted-foreground">공개용</dt><dd>{res.public_service}</dd>
          <dt className="text-muted-foreground">일시</dt>
          <dd>{format(new Date(res.start_at), "M월 d일 (EEE) HH:mm", { locale: ko })} – {format(new Date(res.end_at), "HH:mm")}</dd>
          <dt className="text-muted-foreground">등록</dt><dd>{name(res.created_by)}</dd>
          <dt className="text-muted-foreground">담당</dt>
          <dd className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ background: L.staffColor(res.staff_id ?? res.created_by) }} />
            {name(res.staff_id ?? res.created_by)}
          </dd>
          <dt className="text-muted-foreground">연락처</dt><dd>{res.customer_phone || "-"}</dd>
          <dt className="text-muted-foreground">섹션</dt><dd>{sectionName || "미지정"}</dd>
          <dt className="text-muted-foreground">메모</dt><dd className="whitespace-pre-wrap">{res.memo || "-"}</dd>
          {res.status === "cancelled" && (<><dt className="text-muted-foreground">취소사유</dt><dd>{res.cancel_reason || "-"}</dd></>)}
        </dl>

        {canChange && (
          <div className="space-y-3 border-t pt-4">
            <h4 className="text-sm font-semibold text-primary">예약 상태 변경</h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {STATUS_ORDER.map((s) => {
                const c = L.statusColor(s);
                const current = res.status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={busy || current}
                    onClick={() => (s === "cancelled" ? setConfirming(true) : apply(s))}
                    className={cn("h-11 rounded-md border-2 text-sm font-semibold transition-opacity disabled:cursor-default", current ? "ring-2 ring-offset-1" : "hover:opacity-80")}
                    style={{ color: c.text_color, background: c.bg_color, borderColor: c.border_color, ["--tw-ring-color" as string]: c.border_color }}
                  >
                    {STATUS_LABEL[s]}{current && " ✓"}
                  </button>
                );
              })}
            </div>
            {canEdit && (
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline" className="h-11">
                  <Link to="/reservations/new" search={{ id: res.id }}>예약 수정</Link>
                </Button>
                {res.status !== "cancelled" && (
                  <Button variant="outline" className="h-11" onClick={() => setMoving((m) => !m)} aria-expanded={moving}>
                    예약 이동
                  </Button>
                )}
              </div>
            )}
            {moving && canEdit && res.status !== "cancelled" && <MoveForm res={res} onDone={onClose} />}
          </div>
        )}

        <div className="border-t pt-4">
          <h4 className="mb-2 text-sm font-semibold text-primary">상태 변경 기록</h4>
          <ul className="space-y-2 text-sm">
            {statusHistory.data?.map((h) => (
              <li key={h.id} className="rounded-md bg-muted px-3 py-2">
                <div className="flex justify-between gap-2">
                  <span>
                    {h.from_status ? STATUS_LABEL[h.from_status] : "신규"} → <b>{STATUS_LABEL[h.to_status]}</b> · {name(h.changed_by)}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{format(new Date(h.created_at), "yyyy.MM.dd HH:mm")}</span>
                </div>
                {h.reason && <div className="text-xs text-muted-foreground">사유: {h.reason}</div>}
              </li>
            ))}
            {statusHistory.data?.length === 0 && <li className="text-xs text-muted-foreground">기록 없음</li>}
          </ul>
        </div>

        <div className="border-t pt-4">
          <h4 className="mb-2 text-sm font-semibold text-primary">전체 변경 이력</h4>
          <ul className="space-y-2 text-sm">
            {history.data?.map((h) => (
              <li key={h.id} className="flex justify-between gap-2 rounded-md bg-muted px-3 py-2">
                <span><b>{ACTION_LABEL[h.action] ?? h.action}</b> · {name(h.changed_by)}</span>
                <span className="text-xs text-muted-foreground">{format(new Date(h.created_at), "yyyy.MM.dd HH:mm")}</span>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>예약을 취소할까요?</AlertDialogTitle>
            <AlertDialogDescription>예약은 삭제되지 않고 '예약 취소' 상태와 변경 이력으로 보관됩니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea placeholder="취소 사유 (선택)" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel>닫기</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); apply("cancelled"); }}>
              취소 확정
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

/** "예약 이동" — move without dragging: pick date, start time and section; duration is kept. */
function MoveForm({ res, onDone }: { res: Reservation; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: sections } = useQuery(sectionsQuery);
  const s0 = new Date(res.start_at);
  const dur = +new Date(res.end_at) - +s0;
  const [date, setDate] = useState(format(s0, "yyyy-MM-dd"));
  const [time, setTime] = useState(format(s0, "HH:mm"));
  const [section, setSection] = useState(res.section ? String(res.section) : "");
  const [busy, setBusy] = useState(false);
  const start = new Date(`${date}T${time}`);
  const end = new Date(+start + dur);
  const valid = !Number.isNaN(+start);
  const secName = (n: number | null) => (n ? sections?.find((x) => x.position === n)?.name ?? `${n}번` : "미지정");
  const span = (s: Date, e: Date) => `${format(s, "M월 d일 (EEE) HH:mm", { locale: ko })}~${format(e, "HH:mm")}`;
  const sec = section ? Number(section) : null;
  const unchanged = valid && +start === +s0 && sec === res.section;

  async function save() {
    if (!valid) { toast.error("날짜와 시간을 확인해 주세요."); return; }
    setBusy(true);
    const { data: ov, error: e1 } = await supabase.rpc("find_overlaps", {
      _start: start.toISOString(), _end: end.toISOString(), _staff: res.staff_id ?? res.created_by,
      _section: sec as unknown as number, _exclude: res.id,
    });
    if (e1) { setBusy(false); toast.error(dbErrorMessage(e1)); return; }
    if (ov?.length) {
      setBusy(false);
      toast.error(ov[0]!.conflict === "staff" ? "같은 담당자의 예약과 겹쳐 이동할 수 없습니다." : "같은 섹션에 이미 예약이 있어 이동할 수 없습니다.");
      return;
    }
    const { data, error } = await supabase
      .from("reservations")
      .update({ start_at: start.toISOString(), end_at: end.toISOString(), section: sec })
      .eq("id", res.id)
      .select("id");
    setBusy(false);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    if (!data?.length) { toast.error("이 예약을 옮길 권한이 없습니다."); return; }
    toast.success("예약을 이동했습니다. 변경 이력에 기록됩니다.");
    qc.invalidateQueries();
    onDone();
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/50 p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">날짜</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-2 text-base" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">시작 시간</span>
          <input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-2 text-base" />
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">섹션</span>
        <select value={section} onChange={(e) => setSection(e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-2 text-base">
          <option value="">미지정</option>
          {(sections ?? []).filter((x) => x.active || x.position === res.section).map((x) => <option key={x.position} value={String(x.position)}>{x.name}</option>)}
        </select>
      </label>
      {valid && (
        <div className="space-y-1 text-sm">
          <div className="rounded-md bg-background px-3 py-2"><span className="text-muted-foreground">기존: </span>{span(s0, new Date(res.end_at))} · {secName(res.section)}</div>
          <div className="rounded-md bg-accent px-3 py-2 font-semibold text-accent-foreground"><span className="font-normal">변경: </span>{span(start, end)} · {secName(sec)}</div>
        </div>
      )}
      <Button className="h-11 w-full" disabled={busy || !valid || unchanged} onClick={save}>이동 저장</Button>
    </div>
  );
}
