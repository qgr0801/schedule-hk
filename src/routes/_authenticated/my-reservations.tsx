import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, StatusBadge } from "@/components/PageHeader";
import { ExternalPerformance } from "@/components/ExternalPerformance";
import { ReservationDialog } from "@/components/ReservationDialog";
import { meQuery, profilesQuery, type Reservation } from "@/lib/app";
import { BookingRouteManager } from "@/components/BookingRoutes";
import { bookingRoutesQuery } from "@/lib/booking-routes";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Database } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/my-reservations")({
  head: () => ({ meta: [{ title: "내 예약 | Schedule HK" }] }),
  component: MyReservations,
});

type LinkedReservation = Database["public"]["Functions"]["my_linked_route_reservations"]["Returns"][number];

function MyReservations() {
  const { data: me } = useQuery(meQuery);
  const admin = me?.active && me.role === "admin";
  const [previewId, setPreviewId] = useState("");
  const [routeId, setRouteId] = useState("");
  const { data: routes } = useQuery({ ...bookingRoutesQuery, enabled: !!admin });
  const { data: staff } = useQuery({ ...profilesQuery, enabled: !!admin });
  const external = useQuery({
    queryKey: ["external-preview-staff", me?.id],
    enabled: !!admin,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id").eq("role", "external");
      if (error) throw error;
      return data;
    },
  });
  const preview = admin && staff?.find(person => person.id === previewId && person.is_active && external.data?.some(role => role.user_id === person.id));
  const owner = preview ? preview.id : me?.id;
  const links = useQuery({
    queryKey: ["external-performance-routes", "preview", me?.id],
    enabled: !!preview,
    queryFn: async () => {
      const { data, error } = await supabase.from("external_performance_routes").select("staff_id,route_id");
      if (error) throw error;
      return data;
    },
  });
  const linkedRoute = preview ? links.data?.find(link => link.staff_id === preview.id)?.route_id : undefined;
  const routeFilter = admin && !preview ? routeId : "";
  const [tab, setTab] = useState<"upcoming" | "past" | "cancelled">("upcoming");
  const [view, setView] = useState<"reservations" | "performance">("reservations");
  const [sel, setSel] = useState<Reservation | null>(null);
  const { data, isPending, error } = useQuery({
    queryKey: ["reservations", "mine", me?.id, owner, routeFilter, linkedRoute],
    enabled: !!me && (!preview || links.isSuccess),
    queryFn: async () => {
      const query = supabase.from("reservations").select("*");
      const { data, error } = await (routeFilter
        ? query.eq("booking_route_id", routeFilter)
        : linkedRoute ? query.or(`created_by.eq.${owner},booking_route_id.eq.${linkedRoute}`)
        : query.eq("created_by", owner!)).order("start_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const isExternal = !!me?.active && me.role === "external";
  const [linkedSelection, setLinkedSelection] = useState<string | null>(null);
  const linked = useQuery({
    queryKey: ["reservations", "linked-route", me?.id],
    enabled: isExternal,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_linked_route_reservations").order("start_at", { ascending: false }).order("id");
      if (error) throw error;
      return data;
    },
  });
  const linkedReservations = isExternal ? linked.data ?? [] : [];
  const selectedLinked = linkedReservations.find((r) => r.id === linkedSelection);
  const ownReservations = data ?? [];
  const ownIds = new Set(ownReservations.map((r) => r.id));
  const pending = isPending || (isExternal && linked.isPending);
  const now = Date.now();
  const list = [...ownReservations, ...linkedReservations.filter((r) => !ownIds.has(r.id))].filter((r) =>
    tab === "cancelled" ? r.status === "cancelled" : r.status !== "cancelled" && (tab === "upcoming" ? +new Date(r.end_at) >= now : +new Date(r.end_at) < now),
  );
  list.sort((a, b) => (tab === "upcoming" ? 1 : -1) * (+new Date(a.start_at) - +new Date(b.start_at)));

  return (
    <div>
      <PageHeader title="내 예약" desc={preview ? `${preview.full_name} · 외부 직원 화면 미리보기` : routeFilter ? "선택한 경로의 예약을 표시합니다." : isExternal ? "내가 등록한 예약과 내 경로에 연결된 예약을 표시합니다." : "내가 등록한 예약만 표시됩니다. 취소된 예약도 이력과 함께 보관됩니다."} />
      {admin && <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">경로
          <select value={routeId} disabled={!!preview} onChange={e => setRouteId(e.target.value)} className="h-9 rounded-md border bg-background px-3">
            <option value="">내가 등록한 예약</option>
            {routes?.map(route => <option key={route.id} value={route.id}>{route.name}</option>)}
          </select>
        </label>
        <BookingRouteManager />
        <label className="grid gap-1 text-sm">외부 직원 화면 미리보기
          <select value={previewId} onChange={e => { setPreviewId(e.target.value); setView(e.target.value ? "performance" : "reservations"); setSel(null); }} className="h-9 rounded-md border bg-background px-3">
            <option value="">선택 안 함</option>
            {staff?.filter(person => person.is_active && external.data?.some(role => role.user_id === person.id)).map(person =>
              <option key={person.id} value={person.id}>{person.full_name}</option>)}
          </select>
        </label>
        {external.error && <p role="alert">외부 직원 목록을 불러오지 못했습니다.</p>}
      </div>}
      {(me?.role === "external" || preview) && <div className="mb-4 flex gap-2">
        <button type="button" aria-pressed={view === "reservations"} className="rounded-md border px-4 py-2 text-sm aria-pressed:bg-primary aria-pressed:text-primary-foreground" onClick={() => setView("reservations")}>예약 목록</button>
        <button type="button" aria-pressed={view === "performance"} className="rounded-md border px-4 py-2 text-sm aria-pressed:bg-primary aria-pressed:text-primary-foreground" onClick={() => setView("performance")}>내 성과</button>
      </div>}
      {view === "performance" && owner && (me?.role === "external" || preview) ? <Panel>{preview && links.isPending ? <p role="status">연결 경로를 불러오는 중입니다.</p>
        : preview && links.error ? <p role="alert">연결 경로를 불러오지 못했습니다.</p>
        : preview && !linkedRoute ? <p>연결된 정산 경로가 없습니다.</p>
        : <ExternalPerformance key={owner} staffId={owner} preview={!!preview} />}</Panel> : <>
      <div className="mb-4 flex gap-1 rounded-lg bg-background p-1 shadow-card sm:w-fit">
        {([["upcoming", "예정"], ["past", "지난 예약"], ["cancelled", "취소"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("flex-1 rounded-md px-4 py-2 text-sm", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{l}</button>
        ))}
      </div>
      <Panel className="p-0">
        {(error || (preview && links.error)) && <p role="alert" className="p-6 text-sm">예약을 불러오지 못했습니다.</p>}
        {pending && !(preview && links.error) && <p role="status" className="p-6 text-sm">예약을 불러오는 중입니다.</p>}
        {!error && !linked.error && !pending && list.length === 0 && <p className="p-6 text-sm text-muted-foreground">예약이 없습니다.</p>}
        {isExternal && linked.error && <p role="alert" className="p-6 text-sm">내 경로의 예약을 불러오지 못했습니다.</p>}
        <ul className="divide-y">
          {list.map((r) => (
            <li key={r.id}>
              <button disabled={!!preview} onClick={() => "route_name" in r ? setLinkedSelection(r.id) : setSel(r)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 text-left hover:bg-muted">
                <span className="w-36 text-sm font-semibold text-primary">{format(new Date(r.start_at), "M/d (EEE) HH:mm", { locale: ko })}</span>
                <span className="flex-1 font-medium">{r.customer_name} <span className="text-sm font-normal text-muted-foreground">{r.service}</span>{"route_name" in r && <span className="ml-2 text-xs text-muted-foreground">{r.route_name}</span>}</span>
                <StatusBadge status={r.status} />
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      </>}
      {selectedLinked && <Dialog open onOpenChange={(open) => { if (!open) setLinkedSelection(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selectedLinked.customer_name}</DialogTitle></DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt>고객번호</dt><dd>{selectedLinked.customer_no == null ? "미연결" : `No.${selectedLinked.customer_no}`}</dd>
            <dt>경로</dt><dd>{selectedLinked.route_name}</dd>
            <dt>예약 일시</dt><dd>{format(new Date(selectedLinked.start_at), "yyyy.MM.dd HH:mm")}–{format(new Date(selectedLinked.end_at), "HH:mm")}</dd>
            <dt>예약 항목</dt><dd>{selectedLinked.service}</dd>
            <dt>상태</dt><dd><StatusBadge status={selectedLinked.status} /></dd>
          </dl>
        </DialogContent>
      </Dialog>}
      <ReservationDialog res={sel} onClose={() => setSel(null)} />
    </div>
  );
}
