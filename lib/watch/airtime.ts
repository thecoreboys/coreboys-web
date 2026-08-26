export type AirtimeDateTimeContext = {
  locale?: string;
  timeZone?: string;
};

type CalendarDay = {
  year: number;
  month: number;
  day: number;
  key: string;
};

function calendarDay(value: number, timeZone?: string): CalendarDay | null {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(value);
  const numericPart = (type: Intl.DateTimeFormatPartTypes) => (
    Number(parts.find((part) => part.type === type)?.value)
  );
  const year = numericPart("year");
  const month = numericPart("month");
  const day = numericPart("day");
  if (![year, month, day].every(Number.isFinite)) return null;
  return {
    year,
    month,
    day,
    key: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

function previousCalendarDayKey(value: number, timeZone?: string): string {
  const today = calendarDay(value, timeZone);
  if (!today) return "";
  const previous = new Date(Date.UTC(today.year, today.month - 1, today.day - 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}-${String(previous.getUTCDate()).padStart(2, "0")}`;
}

export function minutesBetween(startIso: string, endIso?: string | null): number {
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return 0;
  const end = endIso ? Date.parse(endIso) : Date.now();
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60_000));
}

export function formatAirtime(minutes: number): string {
  const safeMinutes = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  const m = Math.round(safeMinutes);
  if (safeMinutes === 0) return "0m";
  if (m < 1) return "<1m";
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

export function formatLiveAirtime(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const remainingSeconds = total % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  if (days > 0 || hours > 0 || minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${remainingSeconds}s`);
  return parts.join(" ");
}

export function formatWentLive(
  iso: string,
  now = Date.now(),
  context: AirtimeDateTimeContext = {},
): string {
  const start = Date.parse(iso);
  if (!Number.isFinite(start)) return "";
  const time = new Date(start).toLocaleTimeString(context.locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: context.timeZone,
    timeZoneName: "short",
  });
  const startDay = calendarDay(start, context.timeZone)?.key;
  const today = calendarDay(now, context.timeZone)?.key;
  const yest = previousCalendarDayKey(now, context.timeZone);
  if (startDay === today) return time;
  if (startDay === yest) return `Yesterday ${time}`;
  const date = new Date(start).toLocaleDateString(context.locale, {
    month: "short",
    day: "numeric",
    timeZone: context.timeZone,
  });
  return `${date} · ${time}`;
}

export function liveForLabel(startedAt?: string | null, now = Date.now()): string | null {
  if (!startedAt) return null;
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return null;
  return `Live for ${formatLiveAirtime((now - start) / 1_000)}`;
}

export function lastAiredLabel(opts: {
  startedAt: string;
  endedAt?: string | null;
  totalMinutes?: number;
}, now = Date.now(), context: AirtimeDateTimeContext = {}): string {
  const mins =
    opts.endedAt || opts.totalMinutes == null
      ? minutesBetween(opts.startedAt, opts.endedAt)
      : opts.totalMinutes;
  const when = formatWentLive(opts.startedAt, now, context);
  return when ? `Went live ${when} · ${formatAirtime(mins)}` : formatAirtime(mins);
}
