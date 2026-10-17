import type { ReactNode } from "react";
import type { ResStatus } from "@/lib/app";
import { STATUS_LABEL } from "@/lib/app";
import { cn } from "@/lib/utils";

export function PageHeader({ title, desc, action }: { title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-primary">{title}</h1>
        {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border bg-card p-5 shadow-card", className)}>{children}</div>;
}

export function StatusBadge({ status }: { status: ResStatus }) {
  const cls: Record<ResStatus, string> = {
    confirmed: "bg-accent text-accent-foreground",
    completed: "bg-success/15 text-success",
    cancelled: "bg-destructive/10 text-destructive line-through",
    no_show: "bg-warning/20 text-foreground",
  };
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", cls[status])}>{STATUS_LABEL[status]}</span>;
}
