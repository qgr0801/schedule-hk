import { format, subDays } from "date-fns";
import type { Schedule } from "@/lib/app";

export const isStaffNotice = (s: Pick<Schedule, "title">) => /^\[(휴무|OVER TIME)\]/.test(s.title);
export const scheduleName = (s: Pick<Schedule, "title">) => s.title.replace(/^\[(휴무|OVER TIME)\]\s*/, "");
export const isAllDayLeave = (s: Pick<Schedule, "title" | "start_at" | "end_at">) =>
  s.title.startsWith("[휴무]") && format(new Date(s.start_at), "HH:mm:ss") === "00:00:00" && format(new Date(s.end_at), "HH:mm:ss") === "00:00:00";

export function schedulePeriod(s: Pick<Schedule, "title" | "start_at" | "end_at">) {
  const start = new Date(s.start_at);
  const end = new Date(s.end_at);
  if (isAllDayLeave(s)) {
    const last = subDays(end, 1);
    return format(start, "yyyy.MM.dd") === format(last, "yyyy.MM.dd")
      ? format(start, "yyyy.MM.dd")
      : `${format(start, "yyyy.MM.dd")} – ${format(last, "yyyy.MM.dd")}`;
  }
  return `${format(start, "M/d HH:mm")} – ${format(end, "M/d HH:mm")}`;
}
