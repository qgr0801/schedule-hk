import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, StatusBadge } from "@/components/PageHeader";
import { ReservationDialog } from "@/components/ReservationDialog";
import { Input } from "@/components/ui/input";
import { meQuery, profilesQuery, STATUS_LABEL, type ResStatus, type Reservation } from "@/lib/app";

export const Route = createFileRoute("/_authenticated/admin/reservations")({
  head: () => ({ meta: [{ title: "전체 예약 조회 | Beauty Schedule Manager" }] }),
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
            <tr>{["일시", "고객", "시술", "담당", "상태"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id} onClick={() => setSel(r)} className="cursor-pointer hover:bg-muted">
                <td className="px-4 py-3 font-medium text-primary">{format(new Date(r.start_at), "yyyy.MM.dd HH:mm")}</td>
                <td className="px-4 py-3">{r.customer_name}</td>
                <td className="px-4 py-3">{r.service}</td>
                <td className="px-4 py-3">{name(r.created_by)}</td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <ReservationDialog res={sel} onClose={() => setSel(null)} />
    </div>
  );
}
