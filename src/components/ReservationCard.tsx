import { format } from "date-fns";
import type { ReactNode } from "react";
import { STATUS_LABEL, type Reservation, type ResStatus } from "@/lib/app";
import { cardColors, maskPhone, useCardLookups, type CardField, type CalView, type Category, type ColorMode, type StatusColor } from "@/lib/display";
import { cn } from "@/lib/utils";

export type ResWithCustomer = Reservation & {
  customer?: { category_id: string | null; customer_category_tags: { category_id: string }[] } | null;
};

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
      className={cn("inline-block rounded-full border font-semibold", small ? "px-1.5 text-[10px]" : "px-2 py-0.5 text-xs", status === "cancelled" && "line-through")}
      style={{ color: colors.text_color, background: colors.bg_color, borderColor: colors.border_color }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Pure presentational card, also used for the settings preview. */
export function CardView({
  r, fields, mode, status, staffColor, categories, creatorName, staffName, compact, onClick,
}: {
  r: Pick<ResWithCustomer, "start_at" | "end_at" | "customer_name" | "customer_phone" | "service" | "memo" | "status">;
  fields: CardField[];
  mode: ColorMode;
  status: StatusColor;
  staffColor: string;
  categories: Pick<Category, "name" | "color">[];
  creatorName: string;
  staffName: string;
  compact?: boolean;
  onClick?: () => void;
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
      className={cn("relative block w-full overflow-hidden rounded-md border text-left text-xs", compact ? "py-0.5 pl-2.5 pr-1" : "py-1.5 pl-3 pr-2", r.status === "cancelled" && "opacity-75")}
      style={{ background: c.background, color: c.color, borderColor: c.borderColor }}
    >
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: c.stripe }} aria-hidden />
      <span className="flex items-center justify-between gap-1">
        {has("time") && <b className="shrink-0">{format(new Date(r.start_at), "HH:mm")}{!compact && `–${format(new Date(r.end_at), "HH:mm")}`}</b>}
        {compact && !has("customer") ? null : compact && <span className="truncate">{r.customer_name}</span>}
        {showStatus && !compact && <StatusPill status={r.status} colors={status} small />}
      </span>
      {!compact && <span className="mt-0.5 block space-y-0.5">{lines}</span>}
      {compact && showStatus && (r.status === "cancelled" || r.status === "no_show" || has("status")) && (
        <span className="block"><StatusPill status={r.status} colors={status} small /></span>
      )}
    </Tag>
  );
}

/** Calendar card wired to saved settings. */
export function ReservationCard({
  r, view, name, compact, onClick, modeOverride,
}: {
  r: ResWithCustomer;
  view: CalView;
  name: (id: string) => string;
  compact?: boolean;
  onClick?: () => void;
  modeOverride?: ColorMode;
}) {
  const L = useCardLookups();
  const d = L.display(view);
  const staffId = r.staff_id ?? r.created_by;
  const cats = [r.customer?.category_id, ...(r.customer?.customer_category_tags ?? []).map((t) => t.category_id)]
    .filter((id, i, a): id is string => !!id && a.indexOf(id) === i)
    .map((id) => L.category(id))
    .filter((c): c is Category => !!c);
  return (
    <CardView
      r={r}
      fields={d.fields}
      mode={modeOverride ?? d.color_mode}
      status={L.statusColor(r.status)}
      staffColor={L.staffColor(staffId)}
      categories={cats}
      creatorName={name(r.created_by)}
      staffName={name(staffId)}
      compact={compact}
      onClick={onClick}
    />
  );
}
