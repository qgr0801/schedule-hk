import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { dbErrorMessage, meQuery, profilesQuery, ROLE_LABEL, staffEmailsQuery, type Role } from "@/lib/app";
import {
  describePerms, effectivePerms, FIELDS, MENUS, ROLE_CODE, SCOPE_LABEL, TEMPLATES,
  type FieldKey, type MenuKey, type Perms, type Scope,
} from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/admin/staff")({
  head: () => ({ meta: [{ title: "직원 권한 설정 | Schedule HK" }] }),
  component: StaffPage,
});

function StaffPage() {
  const qc = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { data: profiles } = useQuery(profilesQuery);
  const isAdmin = me?.role === "admin";
  const { data: emails } = useQuery({ ...staffEmailsQuery, enabled: isAdmin });
  const { data: roles } = useQuery({
    queryKey: ["roles"], enabled: isAdmin,
    queryFn: async () => (await supabase.from("user_roles").select("*")).data ?? [],
  });
  const { data: grants } = useQuery({
    queryKey: ["grants"], enabled: isAdmin,
    queryFn: async () => (await supabase.from("reservation_view_grants").select("*")).data ?? [],
  });
  const { data: scopes } = useQuery({
    queryKey: ["scopes"], enabled: isAdmin,
    queryFn: async () => (await supabase.from("staff_view_scopes").select("*")).data ?? [],
  });
  const { data: log } = useQuery({
    queryKey: ["permission_log"], enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("staff_permission_log").select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });

  const [tab, setTab] = useState("list");
  const [selId, setSelId] = useState<string>("");
  const [draft, setDraft] = useState<Perms | null>(null);
  const [busy, setBusy] = useState(false);

  const roleOf = (id: string) => (roles?.find((r) => r.user_id === id)?.role ?? "external") as Role;
  const savedOf = (id: string) => effectivePerms(roleOf(id), scopes?.find((s) => s.user_id === id) as Partial<Perms> | undefined);
  const staffList = (profiles ?? []).filter((p) => roleOf(p.id) !== "admin");
  const sel = staffList.find((p) => p.id === selId) ?? staffList[0];
  const selRole = sel ? roleOf(sel.id) : "external";

  useEffect(() => { setDraft(null); }, [sel?.id]);

  if (me && !isAdmin) return <Panel>관리자만 접근할 수 있습니다.</Panel>;
  if (!me || !roles || !scopes || !profiles) return <Panel>불러오는 중…</Panel>;

  const cur: Perms = draft ?? (sel ? savedOf(sel.id) : effectivePerms("external", null));
  const dirty = !!draft && !!sel && JSON.stringify(effectivePerms(selRole, draft)) !== JSON.stringify(savedOf(sel.id));
  const nameOf = (id: string | null) => (id ? profiles.find((p) => p.id === id)?.full_name ?? "알 수 없음" : "시스템");

  async function changeRole(id: string, role: Role) {
    if (id === me?.id) { toast.error("본인의 관리자 권한은 변경할 수 없습니다."); return; }
    const { error } = await supabase.from("user_roles").update({ role }).eq("user_id", id);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success("역할이 변경되었습니다.");
    qc.invalidateQueries({ queryKey: ["roles"] });
    qc.invalidateQueries({ queryKey: ["permission_log"] });
  }
  async function save() {
    if (!sel) return;
    const p = effectivePerms(selRole, cur);
    setBusy(true);
    const { error } = await supabase.from("staff_view_scopes").upsert(
      { user_id: sel.id, scope: p.scope, menus: p.menus, fields: p.fields, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    setBusy(false);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success(`${sel.full_name}님의 권한을 저장했습니다. 다음 조회부터 바로 적용됩니다.`);
    setDraft(null);
    qc.invalidateQueries({ queryKey: ["scopes"] });
    qc.invalidateQueries({ queryKey: ["permission_log"] });
  }
  async function toggleGrant(viewer: string, owner: string, on: boolean) {
    const { error } = on
      ? await supabase.from("reservation_view_grants").insert({ viewer_id: viewer, owner_id: owner })
      : await supabase.from("reservation_view_grants").delete().eq("viewer_id", viewer).eq("owner_id", owner);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    qc.invalidateQueries({ queryKey: ["grants"] });
    qc.invalidateQueries({ queryKey: ["permission_log"] });
  }
  const edit = (patch: Partial<Perms>) => setDraft({ ...cur, ...patch });
  const toggle = <T extends string>(list: T[], key: T, on: boolean) => (on ? [...new Set([...list, key])] : list.filter((k) => k !== key));

  const picker = sel && (
    <Panel className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-primary" htmlFor="staff-pick">직원 선택</label>
        <select id="staff-pick" value={sel.id} onChange={(e) => setSelId(e.target.value)} className="h-9 min-w-48 rounded-md border border-input bg-background px-3 text-sm">
          {staffList.map((p) => <option key={p.id} value={p.id}>{p.full_name} · {ROLE_CODE[roleOf(p.id)]}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-xs font-medium text-destructive">저장하지 않은 변경</span>}
          <Button variant="outline" size="sm" disabled={!dirty} onClick={() => setDraft(null)}>되돌리기</Button>
          <Button size="sm" disabled={!dirty || busy} onClick={save}>저장</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">기본 권한 템플릿</span>
        {TEMPLATES.map((t) => (
          <button key={t.key} type="button" title={t.desc} onClick={() => setDraft({ ...t.perms })} className="rounded-full border px-3 py-1 text-xs hover:border-primary hover:text-primary">
            {t.label}
          </button>
        ))}
      </div>
    </Panel>
  );

  return (
    <div>
      <PageHeader title="직원 권한 설정" desc="직원별로 메뉴, 예약 열람 범위, 다른 직원 예약에서 볼 수 있는 정보를 정합니다. 모든 제한은 서버에서도 적용됩니다." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 h-auto flex-wrap justify-start">
          <TabsTrigger value="list">직원 목록</TabsTrigger>
          <TabsTrigger value="menus">메뉴 접근 권한</TabsTrigger>
          <TabsTrigger value="scope">예약 열람 범위</TabsTrigger>
          <TabsTrigger value="fields">예약 정보 표시 권한</TabsTrigger>
          <TabsTrigger value="log">권한 변경 기록</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Panel className="overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">직원</th><th className="px-2">역할</th><th className="px-2">계정</th>
                  <th className="px-2">열람 범위</th><th className="px-2">메뉴</th><th className="px-2">다른 직원 예약 정보</th><th className="px-2" />
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => {
                  const role = roleOf(p.id);
                  const perms = savedOf(p.id);
                  return (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{p.full_name}</div>
                        <div className="text-xs text-muted-foreground">{emails?.get(p.id)}</div>
                      </td>
                      <td className="px-2">
                        <select value={role} disabled={p.id === me.id} onChange={(e) => changeRole(p.id, e.target.value as Role)} className="h-8 rounded-md border border-input bg-background px-2 text-xs" aria-label={`${p.full_name} 역할`}>
                          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_CODE[r]} · {ROLE_LABEL[r]}</option>)}
                        </select>
                      </td>
                      <td className="px-2">
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", p.is_active ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>
                          {p.is_active ? "활성" : "비활성"}
                        </span>
                      </td>
                      <td className="px-2 text-xs">{role === "admin" ? "전체 (관리자)" : SCOPE_LABEL[perms.scope]}</td>
                      <td className="px-2 text-xs">{role === "admin" ? "전체" : `${perms.menus.length}개`}</td>
                      <td className="max-w-56 px-2 text-xs text-muted-foreground">
                        {role === "admin" ? "전체" : perms.fields.filter((f) => !FIELDS.find((x) => x.key === f)?.fixed).map((f) => FIELDS.find((x) => x.key === f)?.label).join(", ") || "기본 항목만"}
                      </td>
                      <td className="px-2 text-right">
                        {role !== "admin" && (
                          <Button size="sm" variant="ghost" onClick={() => { setSelId(p.id); setTab("menus"); }}>설정</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
          <p className="mt-3 text-xs text-muted-foreground">새로 가입한 직원은 '외부 직원'과 '기본 직원' 템플릿으로 시작합니다. 관리자는 항상 모든 메뉴와 예약을 볼 수 있습니다.</p>
        </TabsContent>

        <TabsContent value="menus">
          {picker}
          {sel && (
            <Panel>
              <div className="grid gap-2 sm:grid-cols-2">
                {MENUS.map((m) => (
                  <label key={m.key} className={cn("flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm", m.adminOnly && "bg-muted text-muted-foreground")}>
                    <Checkbox
                      checked={!m.adminOnly && cur.menus.includes(m.key)}
                      disabled={m.adminOnly}
                      onCheckedChange={(v) => edit({ menus: toggle<MenuKey>(cur.menus, m.key, !!v) })}
                    />
                    {m.label}
                    <span className="ml-auto text-xs">{m.adminOnly ? "관리자 전용" : cur.menus.includes(m.key) ? "허용" : "차단"}</span>
                  </label>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">체크한 메뉴만 사이드바에 보이고, 주소를 직접 입력해도 차단됩니다. 관리자 전용 메뉴는 체크로 열 수 없습니다.</p>
            </Panel>
          )}
        </TabsContent>

        <TabsContent value="scope">
          {picker}
          {sel && (
            <Panel className="space-y-4">
              {selRole === "external" ? (
                <p className="rounded-md bg-muted px-3 py-2 text-sm">외부 직원은 <b>본인</b>이 등록한 예약의 상세정보만 볼 수 있도록 고정됩니다.</p>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(["all", "own", "selected"] as Scope[]).map((sc) => (
                      <button key={sc} type="button" onClick={() => edit({ scope: sc })} className={cn("rounded-lg border p-3 text-left text-sm", cur.scope === sc && "border-primary bg-accent")}>
                        <div className="font-semibold text-primary">{SCOPE_LABEL[sc]}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {sc === "all" ? "모든 예약의 상세 시술 내역과 고객 구분을 봅니다." : sc === "own" ? "본인이 등록한 예약의 상세정보만 봅니다." : "아래에서 고른 직원 예약의 상세 내역을 봅니다."}
                        </div>
                      </button>
                    ))}
                  </div>
                  {cur.scope === "selected" && (
                    <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-md bg-muted p-3">
                      {profiles.filter((o) => o.id !== sel.id).map((o) => {
                        const on = !!grants?.some((g) => g.viewer_id === sel.id && g.owner_id === o.id);
                        return (
                          <label key={o.id} className="flex items-center gap-2 text-sm">
                            <Checkbox checked={on} onCheckedChange={(v) => toggleGrant(sel.id, o.id, !!v)} /> {o.full_name}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
              <p className="text-xs text-muted-foreground">본인이 등록한 예약은 범위와 관계없이 상세 열람·수정·취소할 수 있습니다. 고객명·연락처 같은 고객 정보는 '예약 정보 표시 권한'에서 따로 정합니다.</p>
            </Panel>
          )}
        </TabsContent>

        <TabsContent value="fields">
          {picker}
          {sel && (
            <Panel>
              <div className="grid gap-2 sm:grid-cols-2">
                {FIELDS.map((f) => {
                  const locked = f.fixed || (f.pii && selRole === "external");
                  const on = f.fixed || (cur.fields.includes(f.key) && !(f.pii && selRole === "external"));
                  return (
                    <label key={f.key} className={cn("flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm", locked && "bg-muted")}>
                      <Checkbox checked={on} disabled={locked} onCheckedChange={(v) => edit({ fields: toggle<FieldKey>(cur.fields, f.key, !!v) })} />
                      {f.label}
                      <span className="ml-auto text-xs text-muted-foreground">{f.fixed ? "항상 표시" : f.pii && selRole === "external" ? "외부 직원 불가" : on ? "허용" : "차단"}</span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                다른 직원이 등록한 예약에 적용됩니다. 체크하지 않은 정보는 서버에서 빼고 보내므로 화면 밖에서 요청해도 보이지 않습니다. 본인 예약은 모든 정보가 보입니다.
              </p>
            </Panel>
          )}
        </TabsContent>

        <TabsContent value="log">
          <Panel className="p-0">
            <ul className="divide-y text-sm">
              {log?.map((l) => {
                const o = l.old_data as Record<string, unknown> | null;
                const n = l.new_data as Record<string, unknown> | null;
                const desc =
                  l.kind === "role"
                    ? `역할 ${o?.["role"] ? ROLE_CODE[o["role"] as Role] : "없음"} → ${n?.["role"] ? ROLE_CODE[n["role"] as Role] : "없음"}`
                    : l.kind === "grant"
                      ? `${nameOf(String((n ?? o)?.["owner_id"] ?? ""))} 예약 상세 열람 ${n ? "허용" : "해제"}`
                      : null;
                return (
                  <li key={l.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span><b>{nameOf(l.user_id)}</b> <span className="text-muted-foreground">· 변경자 {nameOf(l.changed_by)}</span></span>
                      <span className="text-xs text-muted-foreground">{format(new Date(l.created_at), "yyyy.MM.dd HH:mm:ss")}</span>
                    </div>
                    {desc ? (
                      <div className="mt-1 text-xs">{desc}</div>
                    ) : (
                      <div className="mt-1 space-y-0.5 text-xs">
                        <div className="text-muted-foreground">이전: {describePerms(o as Partial<Perms> | null)}</div>
                        <div>변경: {describePerms(n as Partial<Perms> | null)}</div>
                      </div>
                    )}
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
