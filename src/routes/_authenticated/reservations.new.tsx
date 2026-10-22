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
import { dbErrorMessage, sectionsQuery, SERVICES, toLocalInput } from "@/lib/app";

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
  const [f, setF] = useState({ customer_name: "", customer_phone: "", service: SERVICES[0], section: qSection ? String(qSection) : "", memo: "", date: qDate ?? "", start: qStart ?? "10:00", minutes: 60 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) {
      setF((p) => ({ ...p, date: p.date || toLocalInput(new Date().toISOString()).slice(0, 10) }));
      return;
    }
    supabase.from("reservations").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      if (!data) { toast.error("예약을 찾을 수 없거나 열람 권한이 없습니다."); return; }
      const s = toLocalInput(data.start_at);
      setF({
        customer_name: data.customer_name, customer_phone: data.customer_phone ?? "", service: data.service,
        section: data.section ? String(data.section) : "", memo: data.memo ?? "", date: s.slice(0, 10), start: s.slice(11, 16),
        minutes: Math.round((+new Date(data.end_at) - +new Date(data.start_at)) / 60000),
      });
    });
  }, [id]);

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
      <PageHeader title={id ? "예약 수정" : "예약 등록"} desc="같은 담당자의 시간이 겹치면 자동으로 등록이 막힙니다. 실제 고객 정보 대신 가상 데이터를 사용하세요." />
      <Panel>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label>고객명 *</Label><Input value={f.customer_name} onChange={set("customer_name")} placeholder="예: 김가상" /></div>
          <div className="space-y-2"><Label>연락처</Label><Input value={f.customer_phone} onChange={set("customer_phone")} placeholder="010-0000-0000" /></div>
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
