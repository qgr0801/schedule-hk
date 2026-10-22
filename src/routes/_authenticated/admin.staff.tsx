import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { MoreHorizontal, Search, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel } from "@/components/PageHeader";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StaffEditDialog, type EditTab } from "@/components/staff/StaffEditDialog";
import {
  accountsQuery, describeLog, permissionLogQuery, refreshStaff, rolesQuery, scopesQuery, staffProfilesQuery, type StaffRow,
} from "@/components/staff/staff-data";
import { cn } from "@/lib/utils";
import { meQuery, ROLE_LABEL, staffEmailsQuery, type Role } from "@/lib/app";
import { PUBLIC_APP_URL, staffAppOrigin } from "@/lib/app-url";
import { effectivePerms, ROLE_CODE, SCOPE_LABEL, type Perms } from "@/lib/permissions";
import { ACCOUNT_LABEL } from "@/lib/staff-rules";
import { inviteStaff, setStaffActive } from "@/lib/staff.functions";

const ROLE_DESC: Record<Role, string> = {
  admin: "모든 예약·고객 정보, 직원·설정 관리 (관리자끼리 권한 동일)",
  internal: "본인 예약 상세 + 관리자가 허용한 추가 권한",
  external: "본인 예약만 상세 열람·수정·취소",
};

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("internal");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setName(""); setEmail(""); setRole("internal"); } }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (role === "admin" && !confirm(`${name}님을 최고 관리자(ADMIN)로 초대할까요? 모든 예약·고객 정보와 직원 관리 권한을 갖게 됩니다.`)) return;
    setBusy(true);
    try {
      await inviteStaff({ data: { email, fullName: name, role, redirectTo: `${staffAppOrigin()}/set-password` } });
      toast.success(`${name}님에게 초대 메일을 보냈습니다. 메일의 링크에서 비밀번호를 정하면 바로 로그인할 수 있습니다.`);
      refreshStaff(qc);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "초대 메일을 보내지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>직원 초대</DialogTitle>
          <DialogDescription>초대 메일을 받은 직원이 링크에서 직접 비밀번호를 정합니다. 관리자는 비밀번호를 알 수 없습니다.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inv-name">이름 (표시명)</Label>
            <Input id="inv-name" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} className="h-11 text-base" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-email">이메일</Label>
            <Input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 text-base" />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">역할</div>
            <div className="grid gap-2" role="radiogroup" aria-label="역할">
              {(["internal", "external", "admin"] as const).map((r) => (
                <button key={r} type="button" role="radio" aria-checked={role === r} onClick={() => setRole(r)} className={cn("rounded-lg border p-3 text-left text-sm", role === r && "border-primary bg-accent")}>
                  <b className={cn(role === r && "text-primary")}>{ROLE_CODE[r]} · {ROLE_LABEL[r]}</b>
                  <span className="mt-1 block text-xs text-muted-foreground">{ROLE_DESC[r]}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            메일의 링크는 {PUBLIC_APP_URL.replace("https://", "")} 로 연결되고 24시간 동안 유효합니다. STAFF·EXTERNAL은 '기본 직원' 권한으로 시작하며 초대 후 바꿀 수 있습니다.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>취소</Button>
            <Button type="submit" disabled={busy}>{busy ? "보내는 중…" : "초대 메일 보내기"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export const Route = createFileRoute("/_authenticated/admin/staff")({
  head: () => ({ meta: [{ title: "직원 권한 설정 | Schedule HK" }] }),
  component: StaffPage,
});

type RoleFilter = "all" | Role | "test";

function StaffPage() {
  const qc = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const isAdmin = me?.role === "admin";
  const { data: staff } = useQuery({ ...staffProfilesQuery, enabled: isAdmin });
  const { data: emails } = useQuery({ ...staffEmailsQuery, enabled: isAdmin });
  const { data: roles } = useQuery({ ...rolesQuery, enabled: isAdmin });
  const { data: scopes } = useQuery({ ...scopesQuery, enabled: isAdmin });
  const { data: log } = useQuery({ ...permissionLogQuery, enabled: isAdmin });
  const { data: accounts } = useQuery({ ...accountsQuery, enabled: isAdmin });

  const [tab, setTab] = useState("list");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<RoleFilter>("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTab, setEditTab] = useState<EditTab>("info");

  const roleOf = (id: string) => (roles?.find((r) => r.user_id === id)?.role ?? "external") as Role;
  const savedOf = (id: string): Perms => effectivePerms(roleOf(id), scopes?.find((s) => s.user_id === id) as Partial<Perms> | undefined);
  const accountOf = (id: string) => accounts?.find((a) => a.id === id);
  const nameOf = (id: string | null) => (id ? staff?.find((p) => p.id === id)?.full_name ?? "삭제된 계정" : "시스템");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (staff ?? []).filter((p) => {
      if (filter === "test" ? !p.is_test : filter !== "all" && roleOf(p.id) !== filter) return false;
      if (!needle) return true;
      return p.full_name.toLowerCase().includes(needle) || (emails?.get(p.id) ?? "").toLowerCase().includes(needle) || (p.department ?? "").toLowerCase().includes(needle);
    });
  }, [staff, emails, roles, q, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  if (me && !isAdmin) return <Panel>관리자만 접근할 수 있습니다.</Panel>;
  if (!me || !roles || !scopes || !staff) return <Panel>불러오는 중…</Panel>;

  const pickable = (p: StaffRow) => p.id !== me.id && p.is_active;
  const pickedRows = staff.filter((p) => picked.has(p.id) && pickable(p));
  const allPicked = rows.filter(pickable).length > 0 && rows.filter(pickable).every((p) => picked.has(p.id));
  const editTarget = staff.find((p) => p.id === editId) ?? null;
  const open = (id: string, t: EditTab) => { setEditId(id); setEditTab(t); };
  const counts = {
    all: staff.length,
    admin: staff.filter((p) => roleOf(p.id) === "admin").length,
    internal: staff.filter((p) => roleOf(p.id) === "internal").length,
    external: staff.filter((p) => roleOf(p.id) === "external").length,
    test: staff.filter((p) => p.is_test).length,
  };

  async function bulkDeactivate() {
    setBusy(true);
    const failed: string[] = [];
    for (const p of pickedRows) {
      try {
        await setStaffActive({ data: { userId: p.id, active: false } });
      } catch (e) {
        failed.push(`${p.full_name}: ${e instanceof Error ? e.message : "실패"}`);
      }
    }
    setBusy(false);
    setBulkOpen(false);
    setPicked(new Set());
    refreshStaff(qc);
    if (failed.length) toast.error(`일부 계정을 비활성화하지 못했습니다.\n${failed.join("\n")}`);
    else toast.success(`${pickedRows.length}개 계정을 비활성화했습니다.`);
  }

  return (
    <div>
      <PageHeader
        title="직원 권한 설정"
        desc="직원 정보·역할·메뉴·예약 열람 범위와 계정 상태를 관리합니다. 모든 제한은 서버에서도 적용됩니다."
        action={<Button onClick={() => setInviteOpen(true)}><UserPlus className="mr-1.5 h-4 w-4" />직원 초대</Button>}
      />
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
      {editTarget && (
        <StaffEditDialog
          target={editTarget}
          tab={editTab}
          onTab={setEditTab}
          onClose={() => setEditId(null)}
          meId={me.id}
          email={emails?.get(editTarget.id)}
          role={roleOf(editTarget.id)}
          saved={savedOf(editTarget.id)}
          state={accountOf(editTarget.id)?.state}
          lastSignInAt={accountOf(editTarget.id)?.lastSignInAt}
          invitedAt={accountOf(editTarget.id)?.invitedAt}
          staff={staff}
          log={log ?? []}
          nameOf={nameOf}
        />
      )}
      <AlertDialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>선택한 {pickedRows.length}개 계정을 비활성화할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {pickedRows.map((p) => p.full_name).join(", ")} — 로그인과 데이터 조회가 즉시 막힙니다. 계정과 예약·고객·이력은 삭제되지 않으며 언제든 다시 활성화할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void bulkDeactivate(); }}>
              {busy ? "처리 중…" : "비활성화"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 h-auto flex-wrap justify-start">
          <TabsTrigger value="list">직원 목록</TabsTrigger>
          <TabsTrigger value="log">전체 변경 기록</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-3">
          <Panel className="flex flex-wrap items-center gap-2 p-3">
            <div className="relative min-w-52 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·이메일·부서 검색" className="h-10 pl-9" aria-label="직원 검색" />
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="역할 필터">
              {([["all", "전체"], ["admin", "관리자"], ["internal", "내부 직원"], ["external", "외부 직원"], ["test", "테스트 계정"]] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
                  className={cn("rounded-full border px-3 py-1.5 text-xs", filter === k ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary")}>
                  {label} {counts[k]}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" className="ml-auto" disabled={!pickedRows.length} onClick={() => setBulkOpen(true)}>
              선택 비활성화{pickedRows.length ? ` (${pickedRows.length})` : ""}
            </Button>
          </Panel>

          <Panel className="overflow-x-auto p-0">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <Checkbox aria-label="모두 선택" checked={allPicked}
                      onCheckedChange={(v) => setPicked(v ? new Set(rows.filter(pickable).map((p) => p.id)) : new Set())} />
                  </th>
                  <th className="px-2">직원명</th><th className="px-2">이메일</th><th className="px-2">역할</th><th className="px-2">계정 상태</th>
                  <th className="px-2">예약 열람 범위</th><th className="px-2">메뉴 접근</th><th className="px-3 text-right">관리</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const role = roleOf(p.id);
                  const perms = savedOf(p.id);
                  const st = accountOf(p.id)?.state;
                  const off = !p.is_active || st === "disabled";
                  const self = p.id === me.id;
                  const inviteOpen = st === "invited" || st === "expired" || st === "pending";
                  return (
                    <tr key={p.id} className={cn("border-b last:border-0", off && "bg-muted/40 text-muted-foreground")}>
                      <td className="px-3 py-3">
                        <Checkbox aria-label={`${p.full_name} 선택`} disabled={!pickable(p)} checked={picked.has(p.id)}
                          onCheckedChange={(v) => setPicked((s) => { const n = new Set(s); if (v) n.add(p.id); else n.delete(p.id); return n; })} />
                      </td>
                      <td className="px-2 py-3">
                        <button type="button" onClick={() => open(p.id, "info")} className="text-left font-semibold text-foreground hover:text-primary">
                          {p.full_name}{self && <span className="ml-1 text-xs font-normal text-muted-foreground">(나)</span>}
                        </button>
                        <div className="flex flex-wrap gap-1 text-xs">
                          {p.department && <span className="text-muted-foreground">{p.department}</span>}
                          {p.is_test && <span className="rounded-full border border-dashed px-1.5 text-[11px] text-muted-foreground">테스트</span>}
                        </div>
                      </td>
                      <td className="px-2 text-xs">{emails?.get(p.id)}</td>
                      <td className="px-2 text-xs"><b className={cn(role === "admin" && "text-primary")}>{ROLE_CODE[role]}</b></td>
                      <td className="px-2">
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium",
                          off ? "bg-muted text-muted-foreground" : st === "expired" ? "border border-destructive/50 text-destructive" : inviteOpen ? "border border-primary/40 text-primary" : "bg-accent text-accent-foreground")}>
                          {off ? "비활성" : st ? ACCOUNT_LABEL[st] : "…"}
                        </span>
                      </td>
                      <td className="px-2 text-xs">{role === "admin" ? "전체 (관리자)" : SCOPE_LABEL[perms.scope]}</td>
                      <td className="px-2 text-xs">{role === "admin" ? "전체" : `${perms.menus.length}개`}</td>
                      <td className="px-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button size="sm" variant="outline" onClick={() => open(p.id, "info")}>관리</Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`${p.full_name} 관리 메뉴`}><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => open(p.id, "info")}>직원 정보·이름 수정</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => open(p.id, "perms")}>역할·메뉴·열람 권한 변경</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => open(p.id, "account")} disabled={self}>{off ? "계정 활성화" : "계정 비활성화"}</DropdownMenuItem>
                              {inviteOpen && <DropdownMenuItem onSelect={() => open(p.id, "account")}>초대 재발송·취소</DropdownMenuItem>}
                              <DropdownMenuItem onSelect={() => open(p.id, "log")}>변경 이력</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => open(p.id, "account")} disabled={self} className="text-destructive">계정 삭제</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-xs text-muted-foreground">조건에 맞는 직원이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </Panel>
          <p className="text-xs text-muted-foreground">
            비활성화하면 로그인과 데이터 조회가 즉시 막히고, 예약·고객·이력은 그대로 남습니다. 영구 삭제는 연결된 기록이 하나도 없는 계정만 가능합니다. 본인 계정과 마지막 관리자는 비활성화·삭제할 수 없습니다.
          </p>
        </TabsContent>

        <TabsContent value="log">
          <Panel className="p-0">
            <ul className="divide-y text-sm">
              {log?.map((l) => {
                const d = describeLog(l, nameOf);
                return (
                  <li key={l.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span><b>{nameOf(l.user_id)}</b> · {d.title} <span className="text-muted-foreground">· 변경자 {nameOf(l.changed_by)}</span></span>
                      <span className="text-xs text-muted-foreground">{format(new Date(l.created_at), "yyyy.MM.dd HH:mm:ss")}</span>
                    </div>
                    {d.detail && <div className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{d.detail}</div>}
                  </li>
                );
              })}
              {log?.length === 0 && <li className="px-4 py-6 text-center text-xs text-muted-foreground">기록이 없습니다.</li>}
            </ul>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
