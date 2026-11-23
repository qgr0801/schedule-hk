import { CustomerIdentityFields, SameNameCustomerList, normalizedCustomerName, registerCheckedCustomer } from "@/components/CustomerIdentityFields";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CustomerRecords } from "@/components/CustomerRecords";
import { PAYMENT_KINDS, type PaymentLine } from "@/lib/payments";
import { PaymentHistory } from "@/components/PaymentHistory";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { PageHeader, Panel, StatusBadge } from "@/components/PageHeader";
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
  validateSearch: (search: Record<string, unknown>) => ({ customer: typeof search["customer"] === "string" ? search["customer"] : undefined, fromCalendar: search["fromCalendar"] === true }),
  component: CustomersPage,
});

function CustomersPage() {
  const { customer, fromCalendar } = Route.useSearch();
  const navigate = Route.useNavigate();
  const detail = useQuery({
    queryKey: ["customers", "detail", customer],
    enabled: !!customer,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers")
        .select("*, customer_category_tags(category_id)").eq("id", customer!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: customers } = useQuery(customersQuery);
  const { data: profiles } = useQuery(profilesQuery);
  const L = useCardLookups();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [edit, setEdit] = useState<CustomerRow | "new" | null>(null);
  const categoryCounts = new Map<string, number>();
  for (const customer of customers ?? []) {
    const categoryIds = new Set(customer.customer_category_tags.map((tag) => tag.category_id));
    if (customer.category_id) categoryIds.add(customer.category_id);
    for (const id of categoryIds) {
      categoryCounts.set(id, (categoryCounts.get(id) ?? 0) + 1);
    }
  }
  const digits = q.replace(/\D/g, "");
  const list = (customers ?? []).filter(
    (c) =>
      (!q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()) || String(c.customer_no) === q.trim().replace(/^No\.?\s*/i, "") || (!!digits && (c.phone ?? "").replace(/\D/g, "").includes(digits))) &&
      (!cat || c.category_id === cat || c.customer_category_tags.some((t) => t.category_id === cat)),
  );
  const sameNameCount = new Map<string, number>();
  for (const entry of customers ?? []) {
    const key = normalizedCustomerName(entry.name);
    sameNameCount.set(key, (sameNameCount.get(key) ?? 0) + 1);
  }
  const name = (id: string) => profiles?.find((p) => p.id === id)?.full_name ?? "-";

  return (
    <div>
      <PageHeader
        title="고객 관리"
        desc="권한에 따라 볼 수 있는 고객만 표시됩니다. 가상 고객 정보만 사용하세요."
        action={<Button onClick={() => setEdit("new")}>+ 고객 등록</Button>}
      />
      {q.trim()&&(sameNameCount.get(normalizedCustomerName(q))??0)>1&&<p role="status" className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">같은 이름의 고객이 여러 명 있습니다. 고객번호·성별·생년월일·전화번호를 확인해 주세요.</p>}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름, 고객번호, 전화번호 검색" className="h-11 text-base sm:h-9 sm:max-w-xs sm:text-sm" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-11 rounded-md border border-input bg-background px-3 text-base sm:h-9 sm:text-sm" aria-label="고객 구분 필터">
          <option value="">전체 고객 구분 ({(customers?.length ?? 0).toLocaleString("ko-KR")}명)</option>
          {L.categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({(categoryCounts.get(c.id) ?? 0).toLocaleString("ko-KR")}명)</option>)}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => {
          const main = L.category(c.category_id);
          return (
            <Panel key={c.id} className="p-4">
              <button className="w-full text-left" onClick={() => setEdit(c)}>
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <span className="mr-1.5 text-xs text-muted-foreground">No.{c.customer_no}</span><b>{c.name}</b>
                    {"is_test" in c && c.is_test && <span className="ml-1.5 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">테스트</span>}
                  </span>
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
      {customer && detail.data && <CustomerDialog customer={detail.data} onSaved={fromCalendar ? () => { void navigate({ to: "/calendar", search: {}, replace: true }); } : undefined} onClose={() => navigate({ search: { customer: undefined, fromCalendar: false }, replace: true })} />}
      {customer && (detail.isError || detail.data === null) && <p role="alert" className="text-sm text-muted-foreground">연결된 고객정보를 열 수 없습니다.</p>}
      <Panel className="mt-6"><PaymentHistory global /></Panel>
      {edit && <CustomerDialog customer={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

export function CustomerDialog({ customer, onClose, onSaved, draggable, onReservation }: { customer: CustomerRow | null; onClose: () => void; onSaved?: (() => void) | undefined; draggable?: boolean; onReservation?: ((id: string) => void) | undefined }) {
  const qc = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { data: categories } = useQuery(categoriesQuery);
  const {data:existingCustomers}=useQuery({...customersQuery,enabled:!customer});
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [birthDate,setBirthDate] = useState(customer?.birth_date ?? "");
  const [gender,setGender] = useState(customer?.gender ?? "");
  const [duplicate,setDuplicate] = useState("");
  const [confirmed,setConfirmed] = useState(false);
  const confirmKey = JSON.stringify([name,phone,birthDate,gender]);
  const [checkedKey,setCheckedKey] = useState("");
  const [blockedKey,setBlockedKey] = useState("");
  const sameName = !customer && !!normalizedCustomerName(name) && !!existingCustomers?.some(entry => normalizedCustomerName(entry.name) === normalizedCustomerName(name));
  const needsConfirmation = blockedKey !== confirmKey && (sameName || checkedKey === confirmKey);
  const confirmationReady = !!birthDate && !!gender && phone.replace(/\D/g, "").length >= 7;
  const [memo, setMemo] = useState(customer?.memo ?? "");
  const [categoryId, setCategoryId] = useState(customer?.category_id ?? categories?.[0]?.id ?? "");
  const [tags, setTags] = useState<string[]>(customer?.customer_category_tags.map((t) => t.category_id) ?? []);
  const [busy, setBusy] = useState(false);
  const canEdit = !customer || me?.role === "admin" || me?.role === "internal" || customer.created_by === me?.id;

  async function save() {
    if (!canEdit || busy) return;
    if (!name.trim()) { toast.error("고객명을 입력해 주세요."); return; }
    if (name.trim().length > 50) { toast.error("고객명은 50자 이내로 입력해 주세요."); return; }
    if (needsConfirmation && (!confirmationReady || !confirmed || checkedKey !== confirmKey)) return;
    setBusy(true);
    const row = { name: name.trim(), phone: phone.trim() || null, memo: memo.trim() || null, birth_date:birthDate||null, gender:gender||null, category_id: categoryId || null };
    let id = customer?.id;
    if (id) {
      const { error } = await supabase.from("customers").update(row).eq("id", id);
      if (error) { setBusy(false); toast.error(dbErrorMessage(error)); return; }
      const {error:tagError}=await supabase.from("customer_category_tags").delete().eq("customer_id",id);
      if(tagError){setBusy(false);toast.error(dbErrorMessage(tagError));return;}
    } else {
      const {data,error}=await registerCheckedCustomer({name:row.name,phone:row.phone,birthDate,gender,memo:row.memo,categoryId,confirmed:confirmed&&checkedKey===confirmKey});
      if(error){
        setBusy(false);
        if(error.code==="P4701"||error.code==="P4702"){setDuplicate(error.message);setConfirmed(false);setCheckedKey(error.code==="P4702"?confirmKey:"");setBlockedKey(error.code==="P4701"?confirmKey:"");}
        else toast.error(dbErrorMessage(error));
        return;
      }
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
    (onSaved ?? onClose)();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent movable={draggable ?? false} className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 pr-8 text-left">
          <DialogTitle>{customer ? "고객 정보" : "고객 등록"}</DialogTitle>
          {customer?.customer_no != null && (
            <span className="text-sm font-medium text-muted-foreground">고객번호 No.{customer.customer_no}</span>
          )}
        </DialogHeader>
        {customer ? <CustomerRecords customerId={customer.id} onReservation={onReservation} basicInfo={<>        <fieldset disabled={!canEdit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>고객명 *</Label><Input value={name} maxLength={50} onChange={(e) => setName(e.target.value)} placeholder="예: 김가상" /></div>
            <div className="space-y-1"><Label>연락처</Label><Input value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" /></div>
            <CustomerIdentityFields birthDate={birthDate} gender={gender} onBirthDate={setBirthDate} onGender={setGender}/>
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
          <Button className="h-11 w-full" disabled={busy} onClick={save}>저장</Button>
        ) : (
          <p className="text-xs text-muted-foreground">다른 직원이 등록한 고객은 등록자나 관리자만 수정할 수 있습니다.</p>
        )}
</>}><VisitHistory customerId={customer.id} onReservation={onReservation} /></CustomerRecords> : <>        <fieldset disabled={!canEdit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>고객명 *</Label><Input value={name} maxLength={50} onChange={(e) => setName(e.target.value)} placeholder="예: 김가상" /></div>
            <div className="space-y-1"><Label>연락처</Label><Input value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" /></div>
            <CustomerIdentityFields birthDate={birthDate} gender={gender} onBirthDate={setBirthDate} onGender={setGender}/>
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
        {(sameName||checkedKey===confirmKey||blockedKey===confirmKey)&&<div role="alert" className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p>{blockedKey===confirmKey?duplicate:"같은 이름의 고객이 있습니다. 생년월일·성별·전화번호를 비교한 후, 다른 사람일 때만 등록해 주세요."}</p>
          <SameNameCustomerList customers={existingCustomers} name={name}/>
          {needsConfirmation&&<label className="flex gap-2"><Checkbox disabled={!confirmationReady} checked={confirmed&&checkedKey===confirmKey} onCheckedChange={value=>{setCheckedKey(confirmKey);setConfirmed(value===true);}}/>기존 고객과 비교했고, 다른 사람임을 확인했습니다.</label>}
        </div>}
        {canEdit ? (
          <Button className="h-11 w-full" disabled={busy||blockedKey===confirmKey||(needsConfirmation&&(!confirmationReady||!confirmed||checkedKey!==confirmKey))} onClick={save}>{needsConfirmation?"동명이인으로 등록":"저장"}</Button>
        ) : (
          <p className="text-xs text-muted-foreground">다른 직원이 등록한 고객은 등록자나 관리자만 수정할 수 있습니다.</p>
        )}
</>}
      </DialogContent>
    </Dialog>
  );
}

/** Re-visit list: only reservations this user may read in full (server rules decide). */
function VisitHistory({ customerId, onReservation }: { customerId: string; onReservation?: ((id: string) => void) | undefined }) {
  const {data:me}=useQuery(meQuery);
  const canViewDetails=!!me?.active&&(me.role==="admin"||me.role==="internal");
  const { data, isLoading, error } = useQuery({
    queryKey: ["customer_visits", customerId, me?.id, canViewDetails],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("id, start_at, public_service, service, service_detail, status")
        .eq("customer_id", customerId)
        .order("start_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      if (!canViewDetails || !data.length) return data.map(visit=>({...visit,payment:null}));
      const payments=await supabase.from("customer_payments").select("reservation_id,paid_on,rows").in("reservation_id", data.map(visit=>visit.id));
      if(payments.error)throw payments.error;
      const byReservation=new Map(payments.data.map(payment=>[payment.reservation_id,payment]));
      return data.map(visit=>({...visit,payment:byReservation.get(visit.id)??null}));
    },
  });
  const done = data?.filter((v) => v.status === "completed" || v.status === "paid").length ?? 0;
  return (
    <div className="border-t pt-4">
      <h4 className="mb-2 text-sm font-semibold text-primary">재방문 내역 {data && `(예약 ${data.length}건 · 시술 완료 ${done}회)`}</h4>
      <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
        {data?.map((v) => (
          <li key={v.id} className="flex items-start justify-between gap-2 rounded-md bg-muted px-3 py-2">
            <Link className="min-w-0 flex-1 break-words underline" to="/reservations/new" search={{ id: v.id }} onClick={onReservation ? (event) => { event.preventDefault(); onReservation(v.id); } : undefined}><span className="block">{format(new Date(v.start_at), "yyyy.MM.dd HH:mm")} · {v.public_service || v.service}</span>{v.payment ? PAYMENT_KINDS.filter(([kind])=>kind!=="product").map(([kind,label])=>{
              const description=(v.payment!.rows as unknown as PaymentLine[]).find(row=>row.kind===kind)?.description?.trim();
              return description ? <span key={kind} className="mt-1 block whitespace-pre-wrap break-words font-medium">{label} · {description}</span> : null;
            }) : v.service_detail && <span className="mt-1 block whitespace-pre-wrap break-words font-medium">{v.service_detail}</span>}
            {v.payment?.paid_on&&v.payment.paid_on!==format(new Date(v.start_at),"yyyy-MM-dd")&&<span className="mt-1 block text-xs text-muted-foreground">결제일 {v.payment.paid_on}</span>}</Link>
            <StatusBadge status={v.status} />
          </li>
        ))}
        {error && <li role="alert" className="text-sm text-destructive">예약 내역을 불러오지 못했습니다.</li>}
        {isLoading && <li className="text-xs text-muted-foreground">불러오는 중…</li>}
        {data?.length === 0 && <li className="text-xs text-muted-foreground">볼 수 있는 예약 내역이 없습니다.</li>}
      </ul>
    </div>
  );
}
