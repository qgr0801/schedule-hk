import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { dbErrorMessage, ROLE_LABEL, type Role } from "@/lib/app";
import { staffAppOrigin } from "@/lib/app-url";
import { effectivePerms, FIELDS, MENUS, ROLE_CODE, SCOPE_LABEL, TEMPLATES, type FieldKey, type MenuKey, type Perms, type Scope } from "@/lib/permissions";
import { ACCOUNT_LABEL, canDeleteAccount, type AccountState } from "@/lib/staff-rules";
import { deleteStaff, resendSetupLink, setStaffActive, staffLinks, updateStaffInfo } from "@/lib/staff.functions";
import { describeLog, grantsQuery, refreshStaff, type LogRow, type StaffRow } from "./staff-data";

export type EditTab = "info" | "perms" | "account" | "log";

export type StaffEditProps = {
  target: StaffRow | null;
  tab: EditTab;
  onTab: (t: EditTab) => void;
  onClose: () => void;
  meId: string;
  email: string | undefined;
  role: Role;
  saved: Perms;
  state: AccountState | undefined;
  lastSignInAt: string | null | undefined;
  invitedAt: string | null | undefined;
  staff: StaffRow[];
  log: LogRow[];
  nameOf: (id: string | null) => string;
};

const LINK_LABEL: Record<string, string> = {
  reservations: "예약 (등록·담당)",
  customers: "등록한 고객",
  history: "예약 변경 이력",
  schedules: "일정",
  feedback: "시범 운영 피드백",
  auditActions: "이 직원이 한 권한 변경 기록",
};

export function StaffEditDialog(p: StaffEditProps) {
  const { target } = p;
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && p.onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        {target && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {target.full_name}
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">{ROLE_CODE[p.role]}</span>
                {target.is_test && <span className="rounded-full border border-dashed px-2 py-0.5 text-xs font-medium text-muted-foreground">테스트 계정</span>}
              </DialogTitle>
              <DialogDescription>{p.email ?? "이메일 정보 없음"}</DialogDescription>
            </DialogHeader>
            <Tabs value={p.tab} onValueChange={(v) => p.onTab(v as EditTab)}>
              <TabsList className="mb-3 grid h-auto w-full grid-cols-4">
                <TabsTrigger value="info">기본 정보</TabsTrigger>
                <TabsTrigger value="perms">역할 및 권한</TabsTrigger>
                <TabsTrigger value="account">계정 상태</TabsTrigger>
                <TabsTrigger value="log">변경 이력</TabsTrigger>
              </TabsList>
              <TabsContent value="info"><InfoTab {...p} target={target} /></TabsContent>
              <TabsContent value="perms"><PermsTab {...p} target={target} /></TabsContent>
              <TabsContent value="account"><AccountTab {...p} target={target} /></TabsContent>
              <TabsContent value="log"><LogTab {...p} target={target} /></TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

type TabProps = StaffEditProps & { target: StaffRow };

function InfoTab({ target, email }: TabProps) {
  const qc = useQueryClient();
  const [name, setName] = useState(target.full_name);
  const [dept, setDept] = useState(target.department ?? "");
  const [isTest, setIsTest] = useState(target.is_test);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(target.full_name); setDept(target.department ?? ""); setIsTest(target.is_test); }, [target]);
  const dirty = name.trim() !== target.full_name || dept.trim() !== (target.department ?? "") || isTest !== target.is_test;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateStaffInfo({ data: { userId: target.id, fullName: name, department: dept.trim() || null, isTest } });
      toast.success("직원 정보를 저장했습니다.");
      refreshStaff(qc);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="st-name">직원 이름 (표시명)</Label>
        <Input id="st-name" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} className="h-11 text-base" />
        <p className="text-xs text-muted-foreground">캘린더와 예약 카드의 등록자·담당자 이름이 함께 바뀝니다. 예약 기록은 그대로 남습니다.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="st-dept">부서·직책 (선택)</Label>
        <Input id="st-dept" maxLength={40} value={dept} onChange={(e) => setDept(e.target.value)} placeholder="예: 피부관리팀" className="h-11 text-base" />
      </div>
      <div className="space-y-2">
        <Label>이메일 (로그인 아이디)</Label>
        <Input value={email ?? ""} disabled className="h-11" />
        <p className="text-xs text-muted-foreground">이메일은 바꿀 수 없습니다. 잘못 초대했다면 '계정 상태'에서 초대를 취소하고 다시 초대해 주세요.</p>
      </div>
      <label className="flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm">
        <Checkbox checked={isTest} onCheckedChange={(v) => setIsTest(!!v)} className="mt-0.5" />
        <span>
          <b>테스트 계정으로 표시</b>
          <span className="block text-xs text-muted-foreground">목록에서 구분하고 한꺼번에 비활성화할 때 씁니다. 표시만으로 삭제되지는 않습니다.</span>
        </span>
      </label>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy || !dirty || !name.trim()}>저장</Button>
      </div>
    </form>
  );
}

function PermsTab({ target, meId, role, saved, staff }: TabProps) {
  const qc = useQueryClient();
  const { data: grants } = useQuery(grantsQuery);
  const [draft, setDraft] = useState<Perms | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(null); }, [target.id, role]);
  const cur = draft ?? saved;
  const dirty = !!draft && JSON.stringify(effectivePerms(role, draft)) !== JSON.stringify(saved);
  const edit = (patch: Partial<Perms>) => setDraft({ ...cur, ...patch });
  const toggle = <T extends string>(list: T[], key: T, on: boolean) => (on ? [...new Set([...list, key])] : list.filter((k) => k !== key));
  const self = target.id === meId;

  async function changeRole(next: Role) {
    if (next === "admin" && !confirm(`${target.full_name}님을 최고 관리자(ADMIN)로 바꿀까요? 모든 예약·고객 정보와 직원 관리 권한을 갖게 됩니다.`)) return;
    const { error } = await supabase.from("user_roles").update({ role: next }).eq("user_id", target.id);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success(`역할을 ${ROLE_CODE[next]}(으)로 바꿨습니다.`);
    refreshStaff(qc);
  }
  async function save() {
    const v = effectivePerms(role, cur);
    setBusy(true);
    const { error } = await supabase.from("staff_view_scopes").upsert(
      { user_id: target.id, scope: v.scope, menus: v.menus, fields: v.fields, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    setBusy(false);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success("권한을 저장했습니다. 다음 조회부터 바로 적용됩니다.");
    setDraft(null);
    refreshStaff(qc);
  }
  async function toggleGrant(owner: string, on: boolean) {
    const { error } = on
      ? await supabase.from("reservation_view_grants").insert({ viewer_id: target.id, owner_id: owner })
      : await supabase.from("reservation_view_grants").delete().eq("viewer_id", target.id).eq("owner_id", owner);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    refreshStaff(qc);
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-primary">역할</h3>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="역할">
          {(["admin", "internal", "external"] as Role[]).map((r) => (
            <button
              key={r} type="button" role="radio" aria-checked={role === r} disabled={self}
              onClick={() => role !== r && changeRole(r)}
              className={cn("rounded-lg border p-3 text-left text-sm disabled:opacity-60", role === r && "border-primary bg-accent")}
            >
              <b className={cn(role === r && "text-primary")}>{ROLE_CODE[r]}</b> · {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
        {self && <p className="text-xs text-muted-foreground">본인의 역할은 바꿀 수 없습니다. 다른 관리자가 바꿔야 합니다.</p>}
      </section>

      {role === "admin" ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">최고 관리자는 모든 메뉴, 모든 예약·고객 정보, 직원·설정 관리 권한을 항상 가집니다. 관리자끼리 권한 차이는 없습니다.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">기본 권한 템플릿</span>
            {TEMPLATES.map((t) => (
              <button key={t.key} type="button" title={t.desc} onClick={() => setDraft({ ...t.perms })} className="rounded-full border px-3 py-1 text-xs hover:border-primary hover:text-primary">
                {t.label}
              </button>
            ))}
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-primary">예약 열람 범위</h3>
            {role === "external" ? (
              <p className="rounded-md bg-muted px-3 py-2 text-sm">외부 직원은 <b>본인</b>이 등록한 예약의 상세정보만 볼 수 있도록 고정됩니다.</p>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(["all", "own", "selected"] as Scope[]).map((sc) => (
                    <button key={sc} type="button" onClick={() => edit({ scope: sc })} className={cn("rounded-lg border p-3 text-left text-sm", cur.scope === sc && "border-primary bg-accent")}>
                      <div className="font-semibold text-primary">{SCOPE_LABEL[sc]}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {sc === "all" ? "모든 예약의 상세 시술 내역을 봅니다." : sc === "own" ? "본인이 등록한 예약만 상세히 봅니다." : "아래에서 고른 직원 예약을 상세히 봅니다."}
                      </div>
                    </button>
                  ))}
                </div>
                {cur.scope === "selected" && (
                  <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-md bg-muted p-3">
                    {staff.filter((o) => o.id !== target.id).map((o) => (
                      <label key={o.id} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={!!grants?.some((g) => g.viewer_id === target.id && g.owner_id === o.id)} onCheckedChange={(v) => toggleGrant(o.id, !!v)} /> {o.full_name}
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-primary">메뉴 접근</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {MENUS.map((m) => (
                <label key={m.key} className={cn("flex items-center gap-3 rounded-md border px-3 py-2 text-sm", m.adminOnly && "bg-muted text-muted-foreground")}>
                  <Checkbox checked={!m.adminOnly && cur.menus.includes(m.key)} disabled={m.adminOnly} onCheckedChange={(v) => edit({ menus: toggle<MenuKey>(cur.menus, m.key, !!v) })} />
                  {m.label}
                  <span className="ml-auto text-xs">{m.adminOnly ? "관리자 전용" : cur.menus.includes(m.key) ? "허용" : "차단"}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-primary">다른 직원 예약에서 볼 수 있는 정보</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {FIELDS.map((f) => {
                const locked = f.fixed || (f.pii && role === "external");
                const on = f.fixed || (cur.fields.includes(f.key) && !(f.pii && role === "external"));
                return (
                  <label key={f.key} className={cn("flex items-center gap-3 rounded-md border px-3 py-2 text-sm", locked && "bg-muted")}>
                    <Checkbox checked={on} disabled={locked} onCheckedChange={(v) => edit({ fields: toggle<FieldKey>(cur.fields, f.key, !!v) })} />
                    {f.label}
                    <span className="ml-auto text-xs text-muted-foreground">{f.fixed ? "항상 표시" : f.pii && role === "external" ? "외부 직원 불가" : on ? "허용" : "차단"}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">체크하지 않은 정보는 서버에서 빼고 보내므로 화면 밖에서 요청해도 보이지 않습니다.</p>
          </section>

          <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-background pt-3">
            {dirty && <span className="mr-auto text-xs font-medium text-destructive">저장하지 않은 변경</span>}
            <Button variant="outline" disabled={!dirty} onClick={() => setDraft(null)}>되돌리기</Button>
            <Button disabled={!dirty || busy} onClick={save}>권한 저장</Button>
          </div>
        </>
      )}
    </div>
  );
}

function AccountTab({ target, meId, state, lastSignInAt, invitedAt, onClose }: TabProps) {
  const qc = useQueryClient();
  const self = target.id === meId;
  const off = !target.is_active || state === "disabled";
  const inviteOpen = state === "invited" || state === "expired" || state === "pending";
  const [busy, setBusy] = useState(false);
  const [confirmActive, setConfirmActive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: links, isLoading: linksLoading } = useQuery({
    queryKey: ["staff_links", target.id],
    queryFn: () => staffLinks({ data: { userId: target.id } }),
    enabled: !self,
  });
  const deletable = !self && canDeleteAccount(links);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      refreshStaff(qc);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "처리하지 못했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-[7rem_1fr] gap-y-2 rounded-md border p-3 text-sm">
        <dt className="text-muted-foreground">계정 상태</dt>
        <dd className="font-semibold">{off ? "비활성 (로그인·데이터 접근 차단)" : state ? ACCOUNT_LABEL[state] : "확인 중…"}</dd>
        <dt className="text-muted-foreground">초대한 시각</dt>
        <dd>{invitedAt ? format(new Date(invitedAt), "yyyy.MM.dd HH:mm") : "초대 없이 만든 계정"}</dd>
        <dt className="text-muted-foreground">마지막 로그인</dt>
        <dd>{lastSignInAt ? format(new Date(lastSignInAt), "yyyy.MM.dd HH:mm") : "없음"}</dd>
      </dl>

      {inviteOpen && !off && (
        <section className="space-y-2 rounded-md border p-3">
          <h3 className="text-sm font-semibold text-primary">초대</h3>
          <p className="text-xs text-muted-foreground">
            {state === "expired" ? "초대 링크가 만료되었습니다(24시간). 다시 보내 주세요." : state === "pending" ? "링크는 열었지만 아직 비밀번호를 정하지 않았습니다." : "직원이 아직 초대 메일의 링크를 열지 않았습니다."}
          </p>
          <Button variant="outline" size="sm" disabled={busy}
            onClick={() => run(() => resendSetupLink({ data: { userId: target.id, redirectTo: `${staffAppOrigin()}/set-password` } }), `${target.full_name}님에게 메일을 다시 보냈습니다.`)}>
            초대 메일 다시 보내기
          </Button>
        </section>
      )}

      <section className="space-y-2 rounded-md border p-3">
        <h3 className="text-sm font-semibold text-primary">계정 {off ? "활성화" : "비활성화"}</h3>
        <p className="text-xs text-muted-foreground">
          {off ? "다시 로그인할 수 있게 되고 기존 권한이 그대로 적용됩니다." : "즉시 로그인과 모든 데이터 조회가 막힙니다. 이미 열린 화면도 서버가 데이터를 주지 않습니다. 등록한 예약·고객·이력은 그대로 남습니다."}
        </p>
        <Button size="sm" variant={off ? "default" : "outline"} disabled={busy || self} onClick={() => setConfirmActive(true)}>
          {off ? "활성화" : "비활성화"}
        </Button>
        {self && <p className="text-xs text-muted-foreground">본인 계정은 비활성화할 수 없습니다.</p>}
      </section>

      <section className="space-y-2 rounded-md border border-destructive/40 p-3">
        <h3 className="text-sm font-semibold text-destructive">{inviteOpen ? "초대 취소 (계정 삭제)" : "계정 영구 삭제"}</h3>
        {self ? (
          <p className="text-xs text-muted-foreground">본인 계정은 삭제할 수 없습니다.</p>
        ) : linksLoading || !links ? (
          <p className="text-xs text-muted-foreground">연결된 기록을 확인하는 중…</p>
        ) : (
          <>
            <ul className="grid gap-1 text-xs sm:grid-cols-2">
              {Object.entries(links).map(([k, n]) => (
                <li key={k} className="flex justify-between rounded bg-muted px-2 py-1">
                  <span>{LINK_LABEL[k] ?? k}</span><b className={cn(n > 0 && "text-primary")}>{n}건</b>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {deletable
                ? "연결된 예약·고객·기록이 없어 안전하게 삭제할 수 있습니다. 삭제 사실은 변경 기록에 남습니다."
                : "연결된 기록이 있어 삭제할 수 없습니다. 기록을 보존하려면 비활성화해 주세요. 예약의 등록자는 바뀌지 않습니다."}
            </p>
            <Button size="sm" variant="destructive" disabled={!deletable || busy} onClick={() => setConfirmDelete(true)}>
              {inviteOpen ? "초대 취소" : "계정 삭제"}
            </Button>
          </>
        )}
      </section>

      <AlertDialog open={confirmActive} onOpenChange={setConfirmActive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{target.full_name}님 계정을 {off ? "활성화" : "비활성화"}할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {off ? "다시 로그인할 수 있게 됩니다." : "더 이상 로그인할 수 없고, 열려 있는 화면에서도 데이터를 볼 수 없습니다. 등록한 예약과 기록은 그대로 남습니다."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={async (e) => {
              e.preventDefault();
              if (await run(() => setStaffActive({ data: { userId: target.id, active: off } }), off ? "계정을 활성화했습니다." : "계정을 비활성화했습니다.")) setConfirmActive(false);
            }}>
              {off ? "활성화" : "비활성화"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{target.full_name}님 계정을 영구 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              삭제하면 되돌릴 수 없고, 이 이메일로는 다시 초대해야 로그인할 수 있습니다. 연결된 예약·고객·기록이 없는 계정만 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async (e) => {
              e.preventDefault();
              if (await run(() => deleteStaff({ data: { userId: target.id } }), `${target.full_name}님 계정을 삭제했습니다.`)) { setConfirmDelete(false); onClose(); }
            }}>
              영구 삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LogTab({ target, log, nameOf }: TabProps) {
  const rows = log.filter((l) => l.user_id === target.id);
  return (
    <ul className="divide-y rounded-md border text-sm">
      {rows.map((l) => {
        const d = describeLog(l, nameOf);
        return (
          <li key={l.id} className="px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b>{d.title}</b>
              <span className="text-xs text-muted-foreground">{format(new Date(l.created_at), "yyyy.MM.dd HH:mm")} · {nameOf(l.changed_by)}</span>
            </div>
            {d.detail && <div className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{d.detail}</div>}
          </li>
        );
      })}
      {rows.length === 0 && <li className="px-3 py-6 text-center text-xs text-muted-foreground">기록이 없습니다.</li>}
    </ul>
  );
}
