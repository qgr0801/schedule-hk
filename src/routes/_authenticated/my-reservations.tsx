import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, StatusBadge } from "@/components/PageHeader";
import { ReservationDialog } from "@/components/ReservationDialog";
import { meQuery, type Reservation } from "@/lib/app";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/my-reservations")({
  head: () => ({ meta: [{ title: "내 예약 | Schedule HK" }] }),
  component: MyReservations,
});

function MyReservations() {
  const { data: me } = useQuery(meQuery);
  const [tab, setTab] = useState<"upcoming" | "past" | "cancelled">("upcoming");
  const [sel, setSel] = useState<Reservation | null>(null);
  const { data } = useQuery({
    queryKey: ["reservations", "mine", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase.from("reservations").select("*").eq("created_by", me!.id).order("start_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const now = Date.now();
  const list = (data ?? []).filter((r) =>
    tab === "cancelled" ? r.status === "cancelled" : r.status !== "cancelled" && (tab === "upcoming" ? +new Date(r.end_at) >= now : +new Date(r.end_at) < now),
  );
  if (tab === "upcoming") list.reverse();

  return (
    <div>
      <PageHeader title="내 예약" desc="내가 등록한 예약만 표시됩니다. 취소된 예약도 이력과 함께 보관됩니다." />
      <div className="mb-4 flex gap-1 rounded-lg bg-background p-1 shadow-card sm:w-fit">
        {([["upcoming", "예정"], ["past", "지난 예약"], ["cancelled", "취소"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("flex-1 rounded-md px-4 py-2 text-sm", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{l}</button>
        ))}
      </div>
      <Panel className="p-0">
        {list.length === 0 && <p className="p-6 text-sm text-muted-foreground">예약이 없습니다.</p>}
        <ul className="divide-y">
          {list.map((r) => (
            <li key={r.id}>
              <button onClick={() => setSel(r)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 text-left hover:bg-muted">
                <span className="w-36 text-sm font-semibold text-primary">{format(new Date(r.start_at), "M/d (EEE) HH:mm", { locale: ko })}</span>
                <span className="flex-1 font-medium">{r.customer_name} <span className="text-sm font-normal text-muted-foreground">{r.service}</span></span>
                <StatusBadge status={r.status} />
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      <ReservationDialog res={sel} onClose={() => setSel(null)} />
    </div>
  );
}
