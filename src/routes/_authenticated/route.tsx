import { createFileRoute, redirect, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, LayoutDashboard, ListChecks, LogOut, PlusCircle, Users, ClipboardList, CalendarCheck2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { meQuery, ROLE_LABEL } from "@/lib/app";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/" });
  },
  component: AppShell,
});

const NAV = [
  { to: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { to: "/calendar", label: "캘린더", icon: CalendarDays },
  { to: "/reservations/new", label: "예약 등록", icon: PlusCircle },
  { to: "/my-reservations", label: "내 예약", icon: ListChecks },
] as const;
const ADMIN_NAV = [
  { to: "/admin/reservations", label: "전체 예약", icon: ClipboardList },
  { to: "/admin/staff", label: "직원 권한", icon: Users },
] as const;

function AppShell() {
  const { data: me } = useQuery(meQuery);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const items = me?.role === "admin" ? [...NAV, ...ADMIN_NAV] : NAV;

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="min-h-screen bg-muted md:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground md:flex">
        <div className="mb-8 flex items-center gap-2 px-2 font-bold text-sidebar-primary">
          <CalendarCheck2 className="h-5 w-5" /> Schedule HK
        </div>
        <nav className="flex-1 space-y-1">
          {items.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-sidebar-accent",
                path === n.to && "bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
              )}
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border pt-4">
          <div className="px-2 text-sm font-semibold text-sidebar-primary">{me?.name}</div>
          <div className="px-2 text-xs text-sidebar-foreground/70">{me && ROLE_LABEL[me.role]}</div>
          <button onClick={signOut} className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-sidebar-accent">
            <LogOut className="h-4 w-4" /> 로그아웃
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background px-4 py-3 md:hidden">
        <div className="flex items-center gap-2 font-bold text-primary">
          <CalendarCheck2 className="h-5 w-5" /> Schedule HK
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {me?.name} · {me && ROLE_LABEL[me.role]}
          </span>
          <button onClick={signOut} aria-label="로그아웃">
            <LogOut className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </header>

      <main className="min-w-0 flex-1 p-4 pb-24 md:p-8">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t bg-background md:hidden">
        {items.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className={cn(
              "flex min-w-[64px] flex-1 flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground",
              path === n.to && "font-semibold text-primary",
            )}
          >
            <n.icon className="h-5 w-5" />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
