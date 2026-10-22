import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CategoryBadge } from "@/components/ReservationCard";
import { dbErrorMessage, meQuery, profilesQuery, PUBLIC_SERVICES, sectionsQuery, SERVICES, STATUS_LABEL, toLocalInput } from "@/lib/app";
import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { categoriesQuery, customersQuery, maskPhone, useCardLookups } from "@/lib/display";

export const Route = createFileRoute("/_authenticated/reservations/new")({
  validateSearch: z.object({
    id: z.string().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    section: z.coerce.number().int().min(1).max(10).optional(),
  }),
  head: () => ({ meta: [{ title: "예약 등록 | Schedule HK" }] }),
  component: ReservationForm,
});

const schema = z.object({
  customer_name: z.string().trim().min(1, "고객명을 입력해 주세요").max(50),
  customer_phone: z.string().trim().max(20).optional(),
  service: z.string().min(1, "시술을 선택해 주세요"),
  memo: z.string().max(500).optional(),
});

function ReservationForm() {
  const { id, date: qDate, start: qStart, section: qSection } = Route.useSearch();
  const { data: allSections } = useQuery(sectionsQuery);
  const sections = (allSections ?? []).filter((s) => s.active);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { data: profiles } = useQuery(profilesQuery);
  const { data: categories } = useQuery(categoriesQuery);
  const { data: customers } = useQuery(customersQuery);
  const L = useCardLookups();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string>("");
  const [tags, setTags] = useState<string[]>([]);
  const [staffId, setStaffId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [publicService, setPublicService] = useState(PUBLIC_SERVICES[0]!);
  const [f, setF] = useState({ customer_name: "", customer_phone: "", service: SERVICES[0], section: qSection ? String(qSection) : "", memo: "", date: qDate ?? "", start: qStart ?? "10:00", minutes: 60 });
  const [busy, setBusy] = useState(false);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [newCustomerNo, setNewCustomerNo] = useState<number | null>(null);

  useEffect(() => {
    if (!id) {
      setF((p) => ({ ...p, date: p.date || toLocalInput(new Date().toISOString()).slice(0, 10) }));
      return;
    }
    supabase.from("reservations").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      if (!data) { toast.error("예약을 찾을 수 없거나 열람 권한이 없습니다."); return; }
      setCustomerId(data.customer_id);
      setStaffId(data.staff_id ?? data.created_by);
      setCreatorId(data.created_by);
      setPublicService(data.public_service);
      const s = toLocalInput(data.start_at);
      setF({
        customer_name: data.customer_name, customer_phone: data.customer_phone ?? "", service: data.service,
        section: data.section ? String(data.section) : "", memo: data.memo ?? "", date: s.slice(0, 10), start: s.slice(11, 16),
        minutes: Math.round((+new Date(data.end_at) - +new Date(data.start_at)) / 60000),
      });
    });
  }, [id]);

  // Default the treatment staff to me, and the category to the first one (신규 고객)
  useEffect(() => { if (!id && me && !staffId) setStaffId(me.id); }, [id, me, staffId]);
  useEffect(() => { if (!categoryId && !customerId && categories?.[0]) setCategoryId(categories[0].id); }, [categories, categoryId, customerId]);
  // When a linked customer is known, load its category and tags
  useEffect(() => {
    const c = customers?.find((x) => x.id === customerId);
    if (!c) return;
    setCategoryId(c.category_id ?? "");
    setTags(c.customer_category_tags.map((t) => t.category_id));
  }, [customerId, customers]);

  const selected = customers?.find((x) => x.id === customerId);
  const canEditCustomer = !selected || me?.role === "admin" || selected.created_by === me?.id;
  const matches = search.trim()
    ? (customers ?? []).filter((c) => c.name.includes(search.trim()) || (c.phone ?? "").replace(/\D/g, "").includes(search.replace(/\D/g, "") || "\u0000") || String(c.customer_no) === search.trim().replace(/^No\.?\s*/i, "")).slice(0, 6)
    : [];

  // Live overlap warning against every staff's reservation blocks (server re-checks on save)
  const startDate = f.date && f.start ? new Date(`${f.date}T${f.start}`) : null;
  const overlap = useQuery({
    queryKey: ["overlap", f.date, f.start, f.minutes, staffId, f.section, id ?? null],
    enabled: !!startDate && !Number.isNaN(startDate.getTime()) && !!staffId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("find_overlaps", {
        _start: startDate!.toISOString(),
        _end: new Date(startDate!.getTime() + f.minutes * 60000).toISOString(),
        _staff: staffId,
        _section: f.section ? Number(f.section) : (null as unknown as number),
        _exclude: (id ?? null) as unknown as string,
      });
      if (error) throw error;
      return data;
    },
  });
  const sectionLabel = (n: string) => allSections?.find((s) => String(s.position) === n)?.name ?? "";

  function pickCustomer(cid: string) {
    const c = customers?.find((x) => x.id === cid);
    if (!c) return;
    setCustomerId(c.id);
    setF((p) => ({ ...p, customer_name: c.name, customer_phone: c.phone ?? "" }));
    setSearch("");
  }

  async function saveCustomer(name: string, phone: string | null): Promise<string | null> {
    const tagIds = tags.filter((t) => t !== categoryId);
    let cid = customerId;
    if (!cid) {
      const { data, error } = await supabase.from("customers").insert({ name, phone, category_id: categoryId || null }).select("id, customer_no").single();
      if (error) { toast.error(dbErrorMessage(error)); return null; }
      cid = data.id;
      setNewCustomerNo(data.customer_no);
      toast.info(`새 고객번호 No.${data.customer_no}가 부여되었습니다.`);
    } else if (canEditCustomer) {
      const { error } = await supabase.from("customers").update({ category_id: categoryId || null }).eq("id", cid);
      if (error) { toast.error(dbErrorMessage(error)); return null; }
      await supabase.from("customer_category_tags").delete().eq("customer_id", cid);
    } else {
      return cid;
    }
    if (tagIds.length) {
      const { error } = await supabase.from("customer_category_tags").insert(tagIds.map((t) => ({ customer_id: cid!, category_id: t })));
      if (error) { toast.error(dbErrorMessage(error)); return null; }
    }
    return cid;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(f);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요"); return; }
    const start = new Date(`${f.date}T${f.start}`);
    const end = new Date(start.getTime() + f.minutes * 60000);
    const secNo = f.section ? Number(f.section) : null;
    const secName = allSections?.find((s) => s.position === secNo)?.name ?? null;
    const payload = { ...parsed.data, customer_phone: parsed.data.customer_phone || null, section: secNo, room: secName, memo: parsed.data.memo || null, start_at: start.toISOString(), end_at: end.toISOString() };
    setBusy(true);
    const cid = await saveCustomer(parsed.data.customer_name, parsed.data.customer_phone || null);
    if (!cid) { setBusy(false); return; }
    Object.assign(payload, { customer_id: cid, staff_id: staffId || null, public_service: publicService });
    const { error } = id
      ? await supabase.from("reservations").update(payload).eq("id", id)
      : await supabase.from("reservations").insert(payload);
    setBusy(false);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success(id ? "예약이 수정되었습니다." : "예약이 등록되었습니다.");
    qc.invalidateQueries();
    navigate({ to: "/my-reservations" });
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: k === "minutes" ? Number(e.target.value) : e.target.value });

  return (
    <div className="max-w-2xl">
      <PageHeader title={id ? "예약 수정" : "예약 등록"} desc="같은 담당자나 같은 섹션(시술실)의 시간이 겹치면 경고가 표시되고 저장이 막힙니다. 가상 데이터만 사용하세요." />
      <Panel>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>기존 고객 검색</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="이름, 고객번호, 전화번호로 검색" />
            {matches.length > 0 && (
              <ul className="divide-y rounded-md border bg-background">
                {matches.map((c) => {
                  const cat = L.category(c.category_id);
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => pickCustomer(c.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent">
                        <span className="text-xs text-muted-foreground">No.{c.customer_no}</span> <b>{c.name}</b> <span className="text-xs text-muted-foreground">{maskPhone(c.phone)}</span>
                        {cat && <span className="ml-auto"><CategoryBadge cat={cat} small /></span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {selected ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                연결된 고객: <b className="text-foreground">{selected.name}</b>
                <button type="button" className="text-primary underline" onClick={() => { setCustomerId(null); setTags([]); }}>신규 고객으로 등록</button>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">검색 결과에서 고르지 않으면 아래 정보로 새 고객이 등록됩니다.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted p-3 text-sm sm:col-span-2">
            <div>
              <div className="text-xs text-muted-foreground">작성자 (자동)</div>
              <div className="font-semibold">{(creatorId ? profiles?.find((p) => p.id === creatorId)?.full_name : me?.name) ?? "-"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">고객번호 (자동)</div>
              <div className="font-semibold">
                {selected ? `No.${selected.customer_no}` : newCustomerNo ? `No.${newCustomerNo}` : "저장 시 자동 부여"}
              </div>
            </div>
          </div>
          <div className="space-y-2"><Label>고객명 *</Label><Input value={f.customer_name} onChange={set("customer_name")} placeholder="예: 김가상" /></div>
          <div className="space-y-2"><Label>연락처</Label><Input value={f.customer_phone} onChange={set("customer_phone")} placeholder="010-0000-0000" /></div>
          <div className="space-y-2">
            <Label>고객 구분 (기본)</Label>
            <select value={categoryId} disabled={!canEditCustomer} onChange={(e) => setCategoryId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">선택 안 함</option>
              {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>시술 담당자</Label>
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              {profiles?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>보조 태그</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg bg-muted p-3">
              {categories?.filter((c) => c.id !== categoryId).map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <Checkbox disabled={!canEditCustomer} checked={tags.includes(c.id)} onCheckedChange={(v) => setTags(v ? [...tags, c.id] : tags.filter((t) => t !== c.id))} />
                  <CategoryBadge cat={c} small />
                </label>
              ))}
            </div>
            {!canEditCustomer && <p className="text-xs text-muted-foreground">다른 직원이 등록한 고객의 구분은 등록자나 관리자만 바꿀 수 있습니다.</p>}
          </div>
          <div className="space-y-2">
            <Label>시술 *</Label>
            <select value={f.service} onChange={set("service")} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              {SERVICES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>섹션 (공간)</Label>
            <select value={f.section} onChange={set("section")} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">미지정</option>
              {sections.map((s) => <option key={s.position} value={String(s.position)}>{s.name}</option>)}
              {f.section && !sections.some((s) => String(s.position) === f.section) && (
                <option value={f.section}>{allSections?.find((s) => String(s.position) === f.section)?.name ?? "숨겨진 섹션"} (숨김)</option>
              )}
            </select>
          </div>
          <div className="space-y-2">
            <Label>캘린더 공개용 시술명</Label>
            <select value={publicService} onChange={(e) => setPublicService(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              {PUBLIC_SERVICES.map((s) => <option key={s}>{s}</option>)}
              {!PUBLIC_SERVICES.includes(publicService) && <option value={publicService}>{publicService}</option>}
            </select>
            <p className="text-xs text-muted-foreground">다른 직원의 캘린더에는 상세 시술명 대신 이 이름이 보입니다.</p>
          </div>
          <div className="space-y-2"><Label>날짜 *</Label><Input type="date" required value={f.date} onChange={set("date")} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2"><Label>시작 *</Label><Input type="time" step={600} required value={f.start} onChange={set("start")} /></div>
            <div className="space-y-2">
              <Label>소요</Label>
              <select value={f.minutes} onChange={set("minutes")} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                {[30, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m}분</option>)}
              </select>
            </div>
          </div>
          {!!overlap.data?.length && (
            <div role="alert" className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm sm:col-span-2">
              <div className="flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="h-4 w-4" /> 시간이 겹치는 예약이 있습니다</div>
              {overlap.data.map((o, k) => (
                <div key={k} className="text-xs">
                  {format(new Date(o.start_at), "HH:mm")}~{format(new Date(o.end_at), "HH:mm")} · {o.public_service} · {STATUS_LABEL[o.status]} ·{" "}
                  {o.conflict === "staff" ? "같은 담당자" : `같은 섹션 (${sectionLabel(f.section)})`}
                </div>
              ))}
              <div className="text-xs text-muted-foreground">이대로 저장하면 서버에서 등록이 막힙니다.</div>
            </div>
          )}
          <div className="space-y-2 sm:col-span-2"><Label>메모</Label><Textarea value={f.memo} onChange={set("memo")} /></div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={busy} className="h-11 flex-1 sm:flex-none sm:px-8">{id ? "수정 저장" : "예약 등록"}</Button>
            <Button type="button" variant="outline" className="h-11" onClick={() => history.back()}>돌아가기</Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
