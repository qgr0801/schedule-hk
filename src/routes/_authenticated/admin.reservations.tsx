import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, StatusBadge } from "@/components/PageHeader";
import { ReservationDialog } from "@/components/ReservationDialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { dbErrorMessage, meQuery, profilesQuery, STATUS_LABEL, type ResStatus, type Reservation } from "@/lib/app";

export const Route = createFileRoute("/_authenticated/admin/reservations")({
  head: () => ({ meta: [{ title: "전체 예약 조회 | Schedule HK" }] }),
  component: AllReservations,
});

function AllReservations() {
  const { data: me } = useQuery(meQuery);
  const { data: profiles } = useQuery(profilesQuery);
  const [staff, setStaff] = useState("");
  const [status, setStatus] = useState<"" | ResStatus>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Reservation | null>(null);
  const [duplicate, setDuplicate] = useState<Reservation | null>(null);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const qc = useQueryClient();

  async function removeDuplicate() {
    if (!duplicate || !reason.trim() || deleting || me?.role !== "admin") return;
    setDeleting(true);
    try {
      const { error } = await supabase.rpc("void_duplicate_reservation", {
        _id: duplicate.id, _expected_updated_at: duplicate.updated_at, _reason: reason.trim(),
      });
      if (error) throw error;
      setDuplicate(null);
      await qc.invalidateQueries();
      toast.success("중복 예약과 연결된 수납·판매를 정리했습니다.");
    } catch (error) {
      toast.error(dbErrorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  const { data } = useQuery({
    queryKey: ["reservations", "all", staff, status, from, to],
    enabled: me?.role === "admin",
    queryFn: async () => {
      let qy = supabase.from("reservations").select("*").order("start_at", { ascending: false }).limit(500);
      if (staff) qy = qy.eq("created_by", staff);
      if (status) qy = qy.eq("status", status);
      if (from) qy = qy.gte("start_at", new Date(from).toISOString());
      if (to) qy = qy.lte("start_at", new Date(`${to}T23:59:59`).toISOString());
      const { data, error } = await qy;
      if (error) throw error;
      return data;
    },
  });
  if (me && me.role !== "admin") return <Panel>관리자만 접근할 수 있습니다.</Panel>;
  const name = (id: string) => profiles?.find((p) => p.id === id)?.full_name ?? "-";
  const rows = (data ?? []).filter((r) => !q || r.customer_name.includes(q) || r.service.includes(q));
  const sel_cls = "h-9 rounded-md border border-input bg-background px-3 text-sm";

  return (
    <div>
      <PageHeader title="전체 예약 조회" desc={`총 ${rows.length}건 · 모든 직원의 예약과 취소 내역`} />
      <Panel className="mb-4 grid gap-2 sm:grid-cols-5">
        <Input placeholder="고객명·시술 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={sel_cls} value={staff} onChange={(e) => setStaff(e.target.value)}>
          <option value="">전체 직원</option>
          {profiles?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
        <select className={sel_cls} value={status} onChange={(e) => setStatus(e.target.value as ResStatus | "")}>
          <option value="">전체 상태</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </Panel>
      <Panel className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>{["일시", "고객", "시술", "담당", "상태", "관리"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id} onClick={() => setSel(r)} className="cursor-pointer hover:bg-muted">
                <td className="px-4 py-3 font-medium text-primary">{format(new Date(r.start_at), "yyyy.MM.dd HH:mm")}</td>
                <td className="px-4 py-3">
                  {r.customer_name}
                  {r.is_test && <span className="ml-1.5 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">테스트</span>}
                </td>
                <td className="px-4 py-3">{r.service}</td>
                <td className="px-4 py-3">{name(r.created_by)}</td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-3"><Button type="button" size="sm" variant="outline" onClick={e=>{e.stopPropagation();setReason("");setDuplicate(r);}}>중복 예약 삭제</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <AlertDialog open={!!duplicate} onOpenChange={open=>{if(!open&&!deleting)setDuplicate(null);}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>중복 예약을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {duplicate&&<span className="block font-semibold">{duplicate.customer_name} · {format(new Date(duplicate.start_at),"yyyy.MM.dd HH:mm")}</span>}
              이 예약과 연결된 시술·관리·수납·제품 판매가 운영 목록과 합계에서 빠집니다. 판매로 차감한 재고는 복원되며, 처리 이력은 보관합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="space-y-1 text-sm">삭제 사유<Input value={reason} maxLength={500} onChange={e=>setReason(e.target.value)} disabled={deleting} placeholder="예: 같은 예약이 두 번 등록됨"/></label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>닫기</AlertDialogCancel>
            <AlertDialogAction disabled={!reason.trim()||deleting} onClick={e=>{e.preventDefault();void removeDuplicate();}}>중복 예약 삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ReservationDialog res={sel} onClose={() => setSel(null)} />
    </div>
  );
}
