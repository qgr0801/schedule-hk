import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { dbErrorMessage } from "@/lib/app";
import { employeesQuery } from "@/lib/employees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EmployeeDirectory() {
  const qc = useQueryClient();
  const { data, isPending, error } = useQuery(employeesQuery);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(id?: string, active?: boolean) {
    if (busy) return;
    const nextName = id ? data?.find((e) => e.id === id)?.name : name.trim();
    if (!nextName) { toast.error("직원 이름을 입력해 주세요."); return; }
    setBusy(true);
    try {
      const result = id
        ? await supabase.from("employees").update({ is_active: active === true }).eq("id", id).select("id").single()
        : await supabase.from("employees").insert({ name: nextName }).select("id").single();
      if (result.error) throw result.error;
      if (!id) setName("");
      await qc.invalidateQueries({ queryKey: employeesQuery.queryKey });
      toast.success(id ? "직원 사용 상태를 변경했습니다." : "직원을 등록했습니다.");
    } catch (err) {
      toast.error(dbErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">휴무를 관리할 직원의 이름을 등록하세요. 등록한 직원은 휴무 선택 목록에 표시됩니다.</p>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Input aria-label="새 직원 이름" placeholder="직원 이름" value={name} maxLength={50} disabled={busy || !!error} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" disabled={busy || !!error || !name.trim()}>등록</Button>
      </form>
      {isPending && <p className="text-sm">직원 목록을 불러오는 중입니다.</p>}
      {error && <p role="alert" className="text-sm text-destructive">직원 목록을 불러오지 못했습니다. 다시 열어 주세요.</p>}
      {data?.length === 0 && <p className="text-sm text-muted-foreground">등록된 직원이 없습니다.</p>}
      <ul className="divide-y">
        {data?.map((employee) => (
          <li key={employee.id} className="flex items-center justify-between gap-2 py-2">
            <span className={employee.is_active ? "" : "text-muted-foreground"}>{employee.name}{!employee.is_active && " · 사용 중지"}</span>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => save(employee.id, !employee.is_active)}>{employee.is_active ? "사용 중지" : "다시 사용"}</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
