import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/PageHeader";
import { Checkbox } from "@/components/ui/checkbox";
import { dbErrorMessage, meQuery, profilesQuery, ROLE_LABEL, type Role } from "@/lib/app";

export const Route = createFileRoute("/_authenticated/admin/staff")({
  head: () => ({ meta: [{ title: "직원 권한 설정 | Beauty Schedule Manager" }] }),
  component: StaffPage,
});

function StaffPage() {
  const qc = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { data: profiles } = useQuery(profilesQuery);
  const { data: roles } = useQuery({
    queryKey: ["roles"],
    enabled: me?.role === "admin",
    queryFn: async () => (await supabase.from("user_roles").select("*")).data ?? [],
  });
  const { data: grants } = useQuery({
    queryKey: ["grants"],
    enabled: me?.role === "admin",
    queryFn: async () => (await supabase.from("reservation_view_grants").select("*")).data ?? [],
  });
  if (me && me.role !== "admin") return <Panel>관리자만 접근할 수 있습니다.</Panel>;
  const roleOf = (id: string) => (roles?.find((r) => r.user_id === id)?.role ?? "external") as Role;

  async function changeRole(id: string, role: Role) {
    if (id === me?.id) { toast.error("본인의 관리자 권한은 변경할 수 없습니다."); return; }
    const { error } = await supabase.from("user_roles").update({ role }).eq("user_id", id);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success("역할이 변경되었습니다.");
    qc.invalidateQueries({ queryKey: ["roles"] });
  }
  async function toggleGrant(viewer: string, owner: string, on: boolean) {
    const { error } = on
      ? await supabase.from("reservation_view_grants").insert({ viewer_id: viewer, owner_id: owner })
      : await supabase.from("reservation_view_grants").delete().eq("viewer_id", viewer).eq("owner_id", owner);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    qc.invalidateQueries({ queryKey: ["grants"] });
  }

  return (
    <div>
      <PageHeader title="직원 권한 설정" desc="역할을 지정하고, 내부 직원이 열람할 수 있는 다른 직원의 예약을 선택하세요. 외부 직원은 본인 예약만 볼 수 있습니다." />
      <div className="space-y-4">
        {profiles?.map((p) => {
          const role = roleOf(p.id);
          return (
            <Panel key={p.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{p.full_name}</div>
                  <div className="text-sm text-muted-foreground">{p.email}</div>
                </div>
                <select
                  value={role}
                  disabled={p.id === me?.id}
                  onChange={(e) => changeRole(p.id, e.target.value as Role)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </div>
              {role === "internal" && (
                <div className="mt-4 border-t pt-4">
                  <div className="mb-2 text-sm font-medium text-primary">열람 허용 직원</div>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {profiles.filter((o) => o.id !== p.id).map((o) => {
                      const on = !!grants?.some((g) => g.viewer_id === p.id && g.owner_id === o.id);
                      return (
                        <label key={o.id} className="flex items-center gap-2 text-sm">
                          <Checkbox checked={on} onCheckedChange={(v) => toggleGrant(p.id, o.id, !!v)} /> {o.full_name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              {role === "external" && <p className="mt-3 text-xs text-muted-foreground">외부 직원은 다른 직원의 예약을 열람할 수 없습니다.</p>}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
