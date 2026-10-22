import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/PageHeader";
import { CategoryBadge } from "@/components/ReservationCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dbErrorMessage, meQuery, profilesQuery } from "@/lib/app";
import { categoriesQuery, customersQuery, maskPhone, useCardLookups, type CustomerRow } from "@/lib/display";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "고객 관리 | Schedule HK" },
      { name: "description", content: "고객 구분과 보조 태그로 고객을 등록하고 검색합니다." },
    ],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  const { data: customers } = useQuery(customersQuery);
  const { data: profiles } = useQuery(profilesQuery);
  const L = useCardLookups();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [edit, setEdit] = useState<CustomerRow | "new" | null>(null);
  const digits = q.replace(/\D/g, "");
  const list = (customers ?? []).filter(
    (c) =>
      (!q.trim() || c.name.includes(q.trim()) || String(c.customer_no) === q.trim().replace(/^No\.?\s*/i, "") || (!!digits && (c.phone ?? "").replace(/\D/g, "").includes(digits))) &&
      (!cat || c.category_id === cat || c.customer_category_tags.some((t) => t.category_id === cat)),
  );
  const name = (id: string) => profiles?.find((p) => p.id === id)?.full_name ?? "-";

  return (
    <div>
      <PageHeader
        title="고객 관리"
        desc="권한에 따라 볼 수 있는 고객만 표시됩니다. 가상 고객 정보만 사용하세요."
        action={<Button onClick={() => setEdit("new")}>+ 고객 등록</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름, 고객번호, 전화번호 검색" className="max-w-xs" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" aria-label="고객 구분 필터">
          <option value="">전체 고객 구분</option>
          {L.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => {
          const main = L.category(c.category_id);
          return (
            <Panel key={c.id} className="p-4">
              <button className="w-full text-left" onClick={() => setEdit(c)}>
                <div className="flex items-center justify-between gap-2">
                  <span><span className="mr-1.5 text-xs text-muted-foreground">No.{c.customer_no}</span><b>{c.name}</b></span>
                  <span className="text-xs text-muted-foreground">{maskPhone(c.phone)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {main && <CategoryBadge cat={main} />}
                  {c.customer_category_tags.filter((t) => t.category_id !== c.category_id).map((t) => {
                    const g = L.category(t.category_id);
                    return g ? <CategoryBadge key={t.category_id} cat={g} small /> : null;
                  })}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">등록 {name(c.created_by)}</div>
              </button>
            </Panel>
          );
        })}
        {list.length === 0 && <p className="text-sm text-muted-foreground">조건에 맞는 고객이 없습니다.</p>}
      </div>
      {edit && <CustomerDialog customer={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function CustomerDialog({ customer, onClose }: { customer: CustomerRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { data: categories } = useQuery(categoriesQuery);
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [memo, setMemo] = useState(customer?.memo ?? "");
  const [categoryId, setCategoryId] = useState(customer?.category_id ?? categories?.[0]?.id ?? "");
  const [tags, setTags] = useState<string[]>(customer?.customer_category_tags.map((t) => t.category_id) ?? []);
  const [busy, setBusy] = useState(false);
  const canEdit = !customer || me?.role === "admin" || customer.created_by === me?.id;

  async function save() {
    if (!name.trim()) { toast.error("고객명을 입력해 주세요."); return; }
    if (name.trim().length > 50) { toast.error("고객명은 50자 이내로 입력해 주세요."); return; }
    setBusy(true);
    const row = { name: name.trim(), phone: phone.trim() || null, memo: memo.trim() || null, category_id: categoryId || null };
    let id = customer?.id;
    if (id) {
      const { error } = await supabase.from("customers").update(row).eq("id", id);
      if (error) { setBusy(false); toast.error(dbErrorMessage(error)); return; }
      await supabase.from("customer_category_tags").delete().eq("customer_id", id);
    } else {
      const { data, error } = await supabase.from("customers").insert(row).select("id").single();
      if (error) { setBusy(false); toast.error(dbErrorMessage(error)); return; }
      id = data.id;
    }
    const tagIds = tags.filter((t) => t !== categoryId);
    if (tagIds.length) {
      const { error } = await supabase.from("customer_category_tags").insert(tagIds.map((t) => ({ customer_id: id!, category_id: t })));
      if (error) { setBusy(false); toast.error(dbErrorMessage(error)); return; }
    }
    setBusy(false);
    toast.success(customer ? "고객 정보가 수정되었습니다." : "고객이 등록되었습니다.");
    qc.invalidateQueries({ queryKey: customersQuery.queryKey });
    qc.invalidateQueries({ queryKey: ["calendar"] });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{customer ? "고객 정보" : "고객 등록"}</DialogTitle></DialogHeader>
        <fieldset disabled={!canEdit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>고객명 *</Label><Input value={name} maxLength={50} onChange={(e) => setName(e.target.value)} placeholder="예: 김가상" /></div>
            <div className="space-y-1"><Label>연락처</Label><Input value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" /></div>
          </div>
          <div className="space-y-1">
            <Label>기본 구분</Label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">선택 안 함</option>
              {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>보조 태그 (여러 개 선택 가능)</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg bg-muted p-3">
              {categories?.filter((c) => c.id !== categoryId).map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={tags.includes(c.id)} onCheckedChange={(v) => setTags(v ? [...tags, c.id] : tags.filter((t) => t !== c.id))} />
                  <CategoryBadge cat={c} small />
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1"><Label>메모</Label><Textarea value={memo} maxLength={500} onChange={(e) => setMemo(e.target.value)} /></div>
        </fieldset>
        {canEdit ? (
          <Button className="w-full" disabled={busy} onClick={save}>저장</Button>
        ) : (
          <p className="text-xs text-muted-foreground">다른 직원이 등록한 고객은 등록자나 관리자만 수정할 수 있습니다.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
