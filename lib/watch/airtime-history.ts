import type { WatchItem } from "@/lib/watch/types";

const DAY_MS = 86_400_000;
const SESSION_MATCH_WINDOW_MS = 20 * 60_000;
const MAX_SESSION_MINUTES = 7 * 24 * 60;

export type AirtimeHistorySession = {
  id: string;
  slug: string;
  startedAt: string;
  endedAt: string | null;
  totalMinutes: number;
  peakViewers: number;
  avgViewers?: number;
  title: string | null;
  game: string | null;
  twitchStreamId?: string | null;
  source: "observed" | "twitch-vod";
  sourceUrl?: string;
};

export type ComputedAirtimeSummary = {
  minutesStreamed: number;
  broadcasts: number;
};

/** A compact, durable day record used by the year-long Guide heatmap. */
export type AirtimeDailyRecord = {
  slug: string;
  date: string;
  minutes: number;
  sessions: number;
  peakViewers: number;
};

function validTime(value: string | null | undefined): number | null {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function zonedParts(valueMs: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const values = Object.fromEntries(
    formatter.formatToParts(new Date(valueMs)).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function startOfZonedDay(referenceMs: number, offsetDays: number, timeZone: string): number {
  const parts = zonedParts(referenceMs, timeZone);
  const desired = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offsetDays));
  const targetLocalMs = Date.UTC(
    desired.getUTCFullYear(),
    desired.getUTCMonth(),
    desired.getUTCDate(),
  );
  let candidate = targetLocalMs;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const shown = zonedParts(candidate, timeZone);
    const shownLocalMs = Date.UTC(
      shown.year,
      shown.month - 1,
      shown.day,
      shown.hour,
      shown.minute,
      shown.second,
    );
    const correction = targetLocalMs - shownLocalMs;
    candidate += correction;
    if (correction === 0) break;
  }
  return candidate;
}

export function dateKeyInTimeZone(valueMs: number, timeZone: string): string {
  const parts = zonedParts(valueMs, timeZone);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

/**
 * Build honest Guide-history rows from public Twitch broadcasts. These are
 * provider start times and durations, not locally observed viewer samples.
 */
export function buildBroadcastHistoryFallback(
  items: readonly WatchItem[],
  nowMs: number,
  windowDays = 31,
): AirtimeHistorySession[] {
  const cutoffMs = nowMs - Math.max(1, windowDays) * DAY_MS;
  const output = new Map<string, AirtimeHistorySession>();

  for (const item of items) {
    if (item.platform !== "twitch" || item.kind !== "vod" || !item.memberSlug) continue;
    const startedMs = validTime(item.publishedAt ?? item.live?.startedAt);
    const durationSeconds = Number(item.durationSeconds);
    if (startedMs === null || startedMs < cutoffMs || startedMs > nowMs + 5 * 60_000) continue;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) continue;

    const vodId = item.twitch?.vodId?.trim() || item.id.replace(/^vod-/, "");
    const id = `twitch-vod:${vodId || item.id}`;
    if (output.has(id)) continue;
    const endedMs = startedMs + durationSeconds * 1000;
    output.set(id, {
      id,
      slug: item.memberSlug,
      startedAt: new Date(startedMs).toISOString(),
      endedAt: new Date(endedMs).toISOString(),
      totalMinutes: durationSeconds / 60,
      peakViewers: 0,
      title: item.title,
      game: item.live?.game ?? null,
      twitchStreamId: item.twitch?.streamId ?? null,
      source: "twitch-vod",
      sourceUrl: item.sourceUrl,
    });
  }

  return [...output.values()].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

function sameBroadcast(observed: AirtimeHistorySession, fallback: AirtimeHistorySession): boolean {
  if (observed.slug !== fallback.slug) return false;
  if (
    observed.twitchStreamId &&
    fallback.twitchStreamId &&
    observed.twitchStreamId === fallback.twitchStreamId
  ) {
    return true;
  }
  const observedStart = validTime(observed.startedAt);
  const fallbackStart = validTime(fallback.startedAt);
  return observedStart !== null && fallbackStart !== null &&
    Math.abs(observedStart - fallbackStart) <= SESSION_MATCH_WINDOW_MS;
}

/** Prefer richer local observations, then fill every missing broadcast from Twitch. */
export function mergeAirtimeHistorySessions(
  observed: readonly AirtimeHistorySession[],
  fallback: readonly AirtimeHistorySession[],
): AirtimeHistorySession[] {
  const merged = [...observed];
  for (const candidate of fallback) {
    if (!merged.some((session) => sameBroadcast(session, candidate))) merged.push(candidate);
  }
  return merged.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

function sessionDurationMinutes(session: AirtimeHistorySession): number {
  const declared = Number(session.totalMinutes);
  if (Number.isFinite(declared) && declared > 0) {
    return Math.min(MAX_SESSION_MINUTES, declared);
  }
  const startedMs = validTime(session.startedAt);
  const endedMs = validTime(session.endedAt);
  if (startedMs === null || endedMs === null || endedMs <= startedMs) return 0;
  return Math.min(MAX_SESSION_MINUTES, (endedMs - startedMs) / 60_000);
}

/** Split a broadcast across viewer-local calendar days, including DST boundaries. */
export function bucketAirtimeMinutesByDay(
  sessions: readonly AirtimeHistorySession[],
  timeZone: string,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    const startedMs = validTime(session.startedAt);
    let remainingMinutes = sessionDurationMinutes(session);
    if (startedMs === null || remainingMinutes <= 0) continue;
    let cursorMs = startedMs;

    while (remainingMinutes > 0) {
      const key = `${session.slug}:${dateKeyInTimeZone(cursorMs, timeZone)}`;
      const nextDayMs = startOfZonedDay(cursorMs, 1, timeZone);
      const minutesUntilNextDay = Math.max(1 / 60, (nextDayMs - cursorMs) / 60_000);
      const segmentMinutes = Math.min(remainingMinutes, minutesUntilNextDay);
      totals.set(key, (totals.get(key) ?? 0) + segmentMinutes);
      remainingMinutes -= segmentMinutes;
      cursorMs += segmentMinutes * 60_000;
    }
  }
  return totals;
}

export function computeAirtimeSummaries(
  sessions: readonly AirtimeHistorySession[],
  nowMs: number,
  windowDays = 30,
): Map<string, ComputedAirtimeSummary> {
  const cutoffMs = nowMs - Math.max(1, windowDays) * DAY_MS;
  const summaries = new Map<string, ComputedAirtimeSummary>();
  for (const session of sessions) {
    const startedMs = validTime(session.startedAt);
    if (startedMs === null || startedMs < cutoffMs || startedMs > nowMs) continue;
    const current = summaries.get(session.slug) ?? { minutesStreamed: 0, broadcasts: 0 };
    current.minutesStreamed += sessionDurationMinutes(session);
    current.broadcasts += 1;
    summaries.set(session.slug, current);
  }
  return summaries;
}
