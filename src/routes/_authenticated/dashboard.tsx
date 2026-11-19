import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { addDays, endOfDay, endOfWeek, format, isSameDay, startOfDay, startOfWeek } from "date-fns";
import { ko } from "date-fns/locale";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, StatusBadge } from "@/components/PageHeader";
import { ReservationDialog } from "@/components/ReservationDialog";
import { Button } from "@/components/ui/button";
import { useSwipe } from "@/hooks/use-swipe";
import { meQuery, profilesQuery, ROLE_LABEL, type Reservation } from "@/lib/app";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "대시보드 | Schedule HK" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: me } = useQuery(meQuery);
  const { data: profiles } = useQuery(profilesQuery);
  const [sel, setSel] = useState<Reservation | null>(null);
  const now = new Date();
  const [day, setDay] = useState(startOfDay(now));
  const swipe = useSwipe(() => setDay((d) => addDays(d, -1)), () => setDay((d) => addDays(d, 1)));
  const { data: dayReservations, isPending: dayLoading, error: dayError } = useQuery({
    queryKey: ["reservations", "dashboard-day", day.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.from("reservations").select("*")
        .gte("start_at", startOfDay(day).toISOString())
        .lte("start_at", endOfDay(day).toISOString()).order("start_at");
      if (error) throw error;
      return data;
    },
  });
  const { data: week } = useQuery({
    queryKey: ["reservations", "week"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("*")
        .gte("start_at", startOfWeek(now, { weekStartsOn: 1 }).toISOString())
        .lte("start_at", endOfWeek(now, { weekStartsOn: 1 }).toISOString())
        .order("start_at");
      if (error) throw error;
      return data;
    },
  });
  const today = (week ?? []).filter(
    (r) => new Date(r.start_at) >= startOfDay(now) && new Date(r.start_at) <= endOfDay(now),
  );
  const active = (week ?? []).filter((r) => r.status !== "cancelled");
  const stats = [
    { label: "오늘 예약", value: today.filter((r) => r.status !== "cancelled").length },
    { label: "이번 주 예약", value: active.length },
    { label: "이번 주 취소", value: (week ?? []).filter((r) => r.status === "cancelled").length },
    { label: "시술 완료", value: (week ?? []).filter((r) => r.status === "completed" || r.status === "paid").length },
  ];
  const name = (id: string) => profiles?.find((p) => p.id === id)?.full_name ?? "-";
  const byStaff = Object.entries(
    active.reduce<Record<string, number>>((a, r) => ((a[r.created_by] = (a[r.created_by] ?? 0) + 1), a), {}),
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <PageHeader
        title={me?.role === "admin" ? "관리자 대시보드" : "대시보드"}
        desc={`${format(now, "yyyy년 M월 d일 EEEE", { locale: ko })} · ${me ? ROLE_LABEL[me.role] : ""} 권한으로 볼 수 있는 예약입니다.`}
        action={<Button asChild><Link to="/reservations/new">+ 예약 등록</Link></Button>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Panel key={s.label}>
            <div className="text-sm text-muted-foreground">{s.label}</div>
            <div className="mt-1 text-3xl font-bold text-primary">{s.value}</div>
          </Panel>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel className="min-w-0 lg:col-span-2">
          <div className="touch-pan-y" {...swipe}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" aria-label="이전 날짜" onClick={() => setDay(addDays(day, -1))}>‹</Button>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-primary">{isSameDay(day, now) ? "오늘 일정" : format(day, "M월 d일 (EEE)", { locale: ko })}</h2>
              <Button variant="outline" size="sm" onClick={() => setDay(startOfDay(new Date()))}>오늘</Button>
            </div>
            <Button variant="outline" size="sm" aria-label="다음 날짜" onClick={() => setDay(addDays(day, 1))}>›</Button>
          </div>
          {dayLoading && <p className="py-6 text-sm text-muted-foreground">일정을 불러오는 중입니다.</p>}
          {dayError && <p role="alert" className="py-6 text-sm text-destructive">일정을 불러오지 못했습니다.</p>}
          {!dayLoading && !dayError && dayReservations?.length === 0 && <p className="py-6 text-sm text-muted-foreground">예약이 없습니다.</p>}
          <ul className="divide-y">
            {dayReservations?.map((r) => (
              <li key={r.id}>
                <button onClick={() => setSel(r)} className="flex w-full items-center gap-4 py-3 text-left hover:bg-muted">
                  <span className="w-24 text-sm font-semibold text-primary">
                    {format(new Date(r.start_at), "HH:mm")}–{format(new Date(r.end_at), "HH:mm")}
                  </span>
                  <span className="flex-1">
                    <span className="font-medium">{r.customer_name}</span>
                    <span className="ml-2 text-sm text-muted-foreground">{r.service} · {name(r.created_by)}</span>
                  </span>
                  <StatusBadge status={r.status} />
                </button>
              </li>
            ))}
          </ul>
          </div>
        </Panel>
        <Panel>
          <h2 className="mb-4 font-semibold text-primary">직원별 이번 주 예약</h2>
          <ul className="space-y-3">
            {byStaff.map(([id, n]) => (
              <li key={id}>
                <div className="flex justify-between text-sm"><span>{name(id)}</span><span className="font-semibold">{n}건</span></div>
                <div className="mt-1 h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${(n / (byStaff[0]?.[1] || 1)) * 100}%` }} />
                </div>
              </li>
            ))}
            {byStaff.length === 0 && <li className="text-sm text-muted-foreground">데이터가 없습니다.</li>}
          </ul>
        </Panel>
      </div>
      <ReservationDialog res={sel} onClose={() => setSel(null)} />
    </div>
  );
}
