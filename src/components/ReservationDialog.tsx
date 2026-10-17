import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/PageHeader";
import { ACTION_LABEL, dbErrorMessage, meQuery, profilesQuery, type Reservation } from "@/lib/app";

export function ReservationDialog({ res, onClose }: { res: Reservation | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { data: profiles } = useQuery(profilesQuery);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const history = useQuery({
    queryKey: ["history", res?.id],
    enabled: !!res,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservation_history")
        .select("*")
        .eq("reservation_id", res!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  if (!res) return null;
  const name = (id: string | null) => profiles?.find((p) => p.id === id)?.full_name ?? "알 수 없음";
  const canEdit = me && (me.role === "admin" || me.id === res.created_by);

  async function cancel() {
    const { error } = await supabase
      .from("reservations")
      .update({ status: "cancelled", cancel_reason: reason || null })
      .eq("id", res!.id);
    if (error) return toast.error(dbErrorMessage(error));
    toast.success("예약이 취소되었습니다. 이력은 보관됩니다.");
    qc.invalidateQueries();
    onClose();
  }
  async function setStatus(status: "completed" | "no_show") {
    const { error } = await supabase.from("reservations").update({ status }).eq("id", res!.id);
    if (error) return toast.error(dbErrorMessage(error));
    toast.success("상태가 변경되었습니다.");
    qc.invalidateQueries();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {res.customer_name} <StatusBadge status={res.status} />
          </DialogTitle>
        </DialogHeader>
        <dl className="grid grid-cols-[80px_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">시술</dt><dd>{res.service}</dd>
          <dt className="text-muted-foreground">일시</dt>
          <dd>{format(new Date(res.start_at), "M월 d일 (EEE) HH:mm", { locale: ko })} – {format(new Date(res.end_at), "HH:mm")}</dd>
          <dt className="text-muted-foreground">담당</dt><dd>{name(res.created_by)}</dd>
          <dt className="text-muted-foreground">연락처</dt><dd>{res.customer_phone || "-"}</dd>
          <dt className="text-muted-foreground">공간</dt><dd>{res.room || "-"}</dd>
          <dt className="text-muted-foreground">메모</dt><dd className="whitespace-pre-wrap">{res.memo || "-"}</dd>
          {res.status === "cancelled" && (<><dt className="text-muted-foreground">취소사유</dt><dd>{res.cancel_reason || "-"}</dd></>)}
        </dl>

        {canEdit && res.status !== "cancelled" && (
          <div className="space-y-3 border-t pt-4">
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/reservations/new" search={{ id: res.id }}>수정</Link>
              </Button>
              <Button size="sm" variant="outline" onClick={() => setStatus("completed")}>시술완료</Button>
              <Button size="sm" variant="outline" onClick={() => setStatus("no_show")}>노쇼</Button>
              <Button size="sm" variant="destructive" onClick={() => setConfirming(true)}>예약 취소</Button>
            </div>
            {confirming && (
              <div className="space-y-2 rounded-lg bg-muted p-3">
                <Textarea placeholder="취소 사유 (선택)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <Button size="sm" variant="destructive" onClick={cancel}>취소 확정</Button>
              </div>
            )}
          </div>
        )}

        <div className="border-t pt-4">
          <h4 className="mb-2 text-sm font-semibold text-primary">변경 이력</h4>
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
    </Dialog>
  );
}
