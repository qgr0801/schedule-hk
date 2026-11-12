import { format } from "date-fns";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { meQuery, STATUS_LABEL, type Reservation, type ResStatus } from "@/lib/app";
import { cardColors, maskPhone, useCardLookups, type CardField, type CalView, type Category, type ColorMode, type StatusColor } from "@/lib/display";
import { cn } from "@/lib/utils";

export type ResWithCustomer = Reservation & {
  customer?: { category_id: string | null; customer_category_tags: { category_id: string }[] } | null;
  /**
   * Another staff member's reservation from the calendar read model:
   * block = time/section/public service/status, detail = + detailed service & category.
   * Customer info comes per field in `visible` (granted by admin, filtered on the server).
   */
  access?: "block" | "detail" | undefined;
  visible?: string[] | undefined;
  customer_no?: number | null | undefined;
};

/** Card fields for another staff member's reservation, whatever the display settings say. */
export function allowedFields(access: ResWithCustomer["access"], fields: CardField[], visible: string[] = []): CardField[] {
  const withCreator = fields.includes("creator") ? fields : [...fields, "creator" as CardField];
  if (!access) return withCreator;
  const allow: CardField[] = ["time", "service", "status", "creator"];
  if (access === "detail") allow.push("category");
  if (visible.includes("staff")) allow.push("staff");
  if (visible.includes("customer")) allow.push("customer");
  if (visible.includes("phone")) allow.push("phone");
  if (visible.includes("memo")) allow.push("memo");
  const out = withCreator.filter((f) => allow.includes(f));
  return out.includes("service") ? out : [...out, "service"];
}
/** Stripe color when the treatment staff is hidden from the viewer. */
export const HIDDEN_STAFF_COLOR = "#94A3B8";

export function CategoryBadge({ cat, small }: { cat: Pick<Category, "name" | "color">; small?: boolean }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border font-medium", small ? "px-1.5 text-[10px]" : "px-2 py-0.5 text-xs")}
      style={{ color: cat.color, borderColor: cat.color, background: `${cat.color}14` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: cat.color }} />
      {cat.name}
    </span>
  );
}

export function StatusPill({ status, colors, small }: { status: ResStatus; colors: StatusColor; small?: boolean }) {
  return (
    <span
      className={cn("inline-block shrink-0 whitespace-nowrap rounded-full border font-semibold", small ? "px-1.5 text-[10px]" : "px-2 py-0.5 text-xs", status === "cancelled" && "line-through")}
      style={{ color: colors.text_color, background: colors.bg_color, borderColor: colors.border_color }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Pure presentational card, also used for the settings preview. */
export function CardView({
  r, fields, mode, status, staffColor, categories, creatorName, staffName, compact, onClick, className,
}: {
  r: Pick<ResWithCustomer, "start_at" | "end_at" | "customer_name" | "customer_phone" | "service" | "memo" | "status">;
  fields: CardField[];
  mode: ColorMode;
  status: StatusColor;
  staffColor: string;
  categories: Pick<Category, "name" | "color">[];
  creatorName: string;
  staffName: string;
  compact?: boolean | undefined;
  onClick?: (() => void) | undefined;
  className?: string | undefined;
}) {
  const c = cardColors(mode, status, staffColor);
  const has = (f: CardField) => fields.includes(f);
  const showStatus = has("status") || mode === "staff" || r.status === "cancelled" || r.status === "no_show";
  const lines: ReactNode[] = [];
  if (has("customer")) lines.push(<span key="c" className="block truncate font-semibold">고객: {r.customer_name}</span>);
  if (has("category") && categories.length > 0)
    lines.push(<span key="g" className="flex flex-wrap gap-1">{categories.map((g, k) => <CategoryBadge key={k} cat={g} small />)}</span>);
  if (has("service")) lines.push(<span key="s" className="block truncate">{r.service}</span>);
  if (has("creator")) lines.push(<span key="r" className="block truncate opacity-80">등록: {creatorName || "-"}</span>);
  if (has("staff"))
    lines.push(
      <span key="t" className="flex items-center gap-1 truncate opacity-90">
        담당: <span className="rounded px-1 text-[10px] font-semibold text-white" style={{ background: staffColor }}>{staffName || "-"}</span>
      </span>,
    );
  if (has("phone") && r.customer_phone) lines.push(<span key="p" className="block truncate opacity-80">☎ {maskPhone(r.customer_phone)}</span>);
  if (has("memo") && r.memo) lines.push(<span key="m" className="block truncate italic opacity-80">{r.memo}</span>);

  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn("relative block w-full overflow-hidden rounded-md border text-left text-xs", compact ? "py-0.5 pl-2.5 pr-1" : "py-1.5 pl-3 pr-2", r.status === "cancelled" && "opacity-75", className)}
      style={{ background: c.background, color: c.color, borderColor: c.borderColor }}
    >
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: c.stripe }} aria-hidden />
      {compact ? (
        <span className="flex items-center gap-1 truncate">
          {has("time") && <b className="shrink-0">{format(new Date(r.start_at), "HH:mm")}</b>}
          {has("customer") && <span className="truncate">{r.customer_name}</span>}
          {has("service") && !has("customer") && <span className="truncate">{r.service}</span>}
          {has("creator") && <span className="truncate opacity-70">· {creatorName}</span>}
          {showStatus && <span className="ml-auto shrink-0"><StatusPill status={r.status} colors={status} small /></span>}
        </span>
      ) : (
        <>
          <span className="flex flex-wrap items-center justify-between gap-1">
            {has("time") ? <b className="shrink-0">{format(new Date(r.start_at), "HH:mm")}–{format(new Date(r.end_at), "HH:mm")}</b> : <span />}
            {showStatus && <StatusPill status={r.status} colors={status} small />}
          </span>
          <span className="mt-0.5 block space-y-0.5">{lines}</span>
        </>
      )}
    </Tag>
  );
}

/** Calendar card wired to saved settings. */
export function ReservationCard({
  r, view, name, compact, onClick, canOpen, modeOverride, className,
}: {
  r: ResWithCustomer;
  view: CalView;
  name: (id: string) => string;
  compact?: boolean | undefined;
  onClick?: ((action?: "cancelled" | "no_show") => void) | undefined;
  canOpen?: (() => boolean) | undefined;
  modeOverride?: ColorMode | undefined;
  className?: string | undefined;
}) {
  const L = useCardLookups();
  const { data: me } = useQuery(meQuery);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const canReadCustomer = me?.role === "admin" || me?.role === "internal";
  const canEdit = !!me && !r.access && (me.role === "admin" || me.role === "internal" || me.id === r.created_by);
  const canChange = canEdit && (r.status !== "cancelled" || me.role === "admin");
  const start = new Date(r.start_at);
  const end = new Date(r.end_at);
  const summary = [
    canReadCustomer && (!r.access || r.visible?.includes("customer")) ? r.customer_name : null,
    canReadCustomer && r.customer_no && (!r.access || r.visible?.includes("customerNo")) ? `No.${r.customer_no}` : null,
    `${format(start, "HH:mm")}–${format(end, "HH:mm")}`,
    r.service,
    `${Math.round((end.getTime() - start.getTime()) / 60000)}분`,
  ].filter(Boolean);

  async function openCustomer() {
    setLoadingCustomer(true);
    try {
      const { data, error } = await supabase.rpc("calendar_customer_id", { _reservation: r.id });
      if (error || !data) {
        toast.error("연결된 고객정보를 열 수 없습니다.");
        return;
      }
      setOpen(false);
      await navigate({ to: "/customers", search: { customer: data } });
    } finally {
      setLoadingCustomer(false);
    }
  }
  const d = L.display(view);
  const staffHidden = !!r.access && !r.visible?.includes("staff");
  const staffId = r.staff_id ?? r.created_by;
  const cats = [r.customer?.category_id, ...(r.customer?.customer_category_tags ?? []).map((t) => t.category_id)]
    .filter((id, i, a): id is string => !!id && a.indexOf(id) === i)
    .map((id) => L.category(id))
    .filter((c): c is Category => !!c);
  const card = (
    <CardView
      r={r}
      fields={allowedFields(r.access, d.fields, r.visible)}
      mode={modeOverride ?? d.color_mode}
      status={L.statusColor(r.status)}
      staffColor={staffHidden ? HIDDEN_STAFF_COLOR : L.staffColor(staffId)}
      categories={cats}
      creatorName={name(r.created_by)}
      staffName={name(staffId)}
      compact={compact}
      onClick={onClick ? () => { if (canOpen?.() !== false) { setPreviewOpen(false); setOpen(true); } } : undefined}
      className={className}
    />
  );
  if (!onClick) return card;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider delayDuration={250}>
        <Tooltip open={previewOpen && !open} onOpenChange={setPreviewOpen} disableHoverableContent>
          <PopoverAnchor asChild>
            <TooltipTrigger asChild><div className={className}>{card}</div></TooltipTrigger>
          </PopoverAnchor>
          <TooltipContent side="right" align="start" collisionPadding={12} className="max-w-[min(15rem,calc(100vw-1.5rem))] space-y-0.5 border bg-popover text-popover-foreground shadow-md">
            {summary.map((line, index) => <div key={index} className="break-words">{line}</div>)}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent side="left" align="start" collisionPadding={12} className="w-36 max-w-[calc(100vw-1.5rem)] p-1.5" aria-label="예약 메뉴">
        <div className="grid gap-1">
          <Button variant="ghost" size="sm" onClick={() => { setOpen(false); onClick(); }}>예약 상세</Button>
          {canChange
            ? <Button asChild variant="ghost" size="sm"><Link to="/reservations/new" search={{ id: r.id }}>예약 수정</Link></Button>
            : canReadCustomer && <Button variant="ghost" size="sm" disabled>예약 수정</Button>}
          {(canChange || canReadCustomer) && <Button variant="ghost" size="sm" disabled={!canChange || r.status === "cancelled"} onClick={() => { setOpen(false); onClick("cancelled"); }}>예약 취소</Button>}
          {(canChange || canReadCustomer) && <Button variant="ghost" size="sm" disabled={!canChange || r.status === "no_show"} onClick={() => { setOpen(false); onClick("no_show"); }}>노쇼</Button>}
          {canReadCustomer && <Button variant="ghost" size="sm" disabled={loadingCustomer || (!r.customer_id && !r.access)} onClick={openCustomer}>고객정보</Button>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
