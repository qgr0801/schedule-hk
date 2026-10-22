import { createFileRoute, redirect, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, LayoutDashboard, ListChecks, LogOut, PlusCircle, Plus, Users, ClipboardList, CalendarCheck2, Contact, Palette, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { OfflineBanner } from "@/components/OfflineBanner";
import { meQuery, ROLE_LABEL } from "@/lib/app";
import { canMenu, menuForPath, type MenuKey } from "@/lib/permissions";
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
  { key: "dashboard", to: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { key: "calendar", to: "/calendar", label: "캘린더", icon: CalendarDays },
  { key: "reservation_new", to: "/reservations/new", label: "예약 등록", icon: PlusCircle },
  { key: "my_reservations", to: "/my-reservations", label: "내 예약", icon: ListChecks },
  { key: "customers", to: "/customers", label: "고객 관리", icon: Contact },
  { key: "admin_reservations", to: "/admin/reservations", label: "전체 예약", icon: ClipboardList },
  { key: "admin_staff", to: "/admin/staff", label: "직원 권한", icon: Users },
  { key: "admin_settings", to: "/admin/settings", label: "색상·표시 설정", icon: Palette },
] as const satisfies readonly { key: MenuKey; to: string; label: string; icon: unknown }[];

function AppShell() {
  const { data: me } = useQuery(meQuery);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const items = me ? NAV.filter((n) => canMenu(me.role, me.perms, n.key)) : [];
  const guard = menuForPath(path);
  const blocked = !!me && !!guard && !canMenu(me.role, me.perms, guard);
  const showFab = !!me && canMenu(me.role, me.perms, "reservation_new") && !path.startsWith("/reservations/new");

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

      <header className="sticky top-0 z-20 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b bg-background px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
        <div className="flex min-w-0 items-center gap-2 font-bold text-primary">
          <CalendarCheck2 className="h-5 w-5 shrink-0" /> <span className="truncate">Schedule HK</span>
        </div>
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate text-xs text-muted-foreground">
            {me?.name} · {me && ROLE_LABEL[me.role]}
          </span>
          <button onClick={signOut} aria-label="로그아웃" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
            <LogOut className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
      </header>

      <main className="min-w-0 flex-1 p-4 pb-44 md:p-8">
        <OfflineBanner />
        {!me ? null : blocked ? (
          <div className="mx-auto mt-16 max-w-md rounded-xl border bg-card p-8 text-center shadow-card">
            <Lock className="mx-auto mb-3 h-8 w-8 text-primary" />
            <h1 className="mb-1 text-lg font-bold text-primary">접근 권한이 없는 메뉴입니다</h1>
            <p className="mb-4 text-sm text-muted-foreground">이 화면을 쓰려면 관리자에게 메뉴 권한을 요청해 주세요.</p>
            {items[0] && (
              <Link to={items[0].to} className="text-sm font-semibold text-primary underline">
                {items[0].label}(으)로 이동
              </Link>
            )}
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      {showFab && (
        <Link
          to="/reservations/new"
          className="fixed right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-primary px-5 text-base font-semibold text-primary-foreground shadow-card md:hidden"
          style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
        >
          <Plus className="h-5 w-5" /> 예약 추가
        </Link>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className={cn(
              "flex min-h-16 min-w-[68px] flex-1 flex-col items-center justify-center gap-1 py-2 text-xs text-muted-foreground",
              path === n.to && "font-semibold text-primary",
            )}
          >
            <n.icon className="h-6 w-6" />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
