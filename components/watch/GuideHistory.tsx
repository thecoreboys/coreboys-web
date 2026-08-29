"use client";

import { useMemo, type CSSProperties } from "react";
import { MEMBERS } from "@/lib/members";
import { useDragScroll } from "@/hooks/useDragScroll";
import { useStreamSessions } from "@/hooks/useStreamSessions";
import { useBrowserTimeZone } from "@/hooks/useBrowserTimeZone";
import { formatAirtime } from "@/lib/watch/airtime";
import type { TwitchTrackerChannelSnapshot } from "@/lib/twitchtracker-snapshots";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import {
  bucketAirtimeMinutesByDay,
  dateKeyInTimeZone,
  mergeAirtimeHistorySessions,
  type AirtimeDailyRecord,
  type AirtimeHistorySession,
} from "@/lib/watch/airtime-history";

type TimePreferences = {
  locale: string;
  timeZone: string;
  ready: boolean;
};

type AirtimeDaySource = "archive" | "observed" | "twitch-vod";

type AirtimeDayDetail = {
  minutes: number;
  broadcasts: number;
  peakViewers: number;
  source: AirtimeDaySource;
};

function zonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/**
 * Keep the contribution grid on a true Aug–Jul calendar year. Starting on
 * August 1 lets the leading blank cells place that date beneath its real
 * weekday, rather than making the graph look like an arbitrary rolling list.
 */
function completedAugustYearDateKeys(serverNowMs: number, timeZone: string): string[] {
  const values = zonedDateParts(new Date(serverNowMs), timeZone);
  const currentYear = Number(values.year);
  const currentMonth = Number(values.month);
  const currentDay = Number(values.day);
  const hasCompletedCurrentCycle = currentMonth > 7 || (currentMonth === 7 && currentDay === 31);
  const endYear = hasCompletedCurrentCycle ? currentYear : currentYear - 1;
  const start = new Date(Date.UTC(endYear - 1, 7, 1));
  const end = new Date(Date.UTC(endYear, 6, 31));
  const days: string[] = [];

  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86_400_000)) {
    days.push([
      cursor.getUTCFullYear(),
      String(cursor.getUTCMonth() + 1).padStart(2, "0"),
      String(cursor.getUTCDate()).padStart(2, "0"),
    ].join("-"));
  }
  return days;
}

function dateFromKey(key: string): Date {
  const [year = 1970, month = 1, day = 1] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function formatLongDay(key: string, preferences: TimePreferences): string {
  if (!preferences.ready) return key;
  return dateFromKey(key).toLocaleDateString(preferences.locale, {
    timeZone: "UTC",
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMonth(key: string, preferences: TimePreferences): string {
  if (!preferences.ready) return key.slice(5, 7);
  return dateFromKey(key).toLocaleDateString(preferences.locale, {
    timeZone: "UTC",
    month: "short",
  });
}

function plural(value: number, word: string): string {
  return `${value.toLocaleString("en-US")} ${word}${value === 1 ? "" : "s"}`;
}

function sourceLabel(source: AirtimeDaySource): string {
  if (source === "archive") return "CORE airtime archive";
  if (source === "observed") return "CORE live observation";
  return "public Twitch broadcast history";
}

function parseMinutes(session: AirtimeHistorySession): number {
  const declared = Number(session.totalMinutes);
  if (Number.isFinite(declared) && declared > 0) return declared;
  const started = Date.parse(session.startedAt);
  const ended = Date.parse(session.endedAt ?? "");
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended <= started) return 0;
  return (ended - started) / 60_000;
}

function mergeDayRecord(
  map: Map<string, AirtimeDayDetail>,
  key: string,
  record: AirtimeDayDetail,
) {
  const current = map.get(key);
  if (!current) {
    map.set(key, record);
    return;
  }
  map.set(key, {
    minutes: current.minutes + record.minutes,
    broadcasts: current.broadcasts + record.broadcasts,
    peakViewers: Math.max(current.peakViewers, record.peakViewers),
    source: current.source === "archive" || record.source === "archive"
      ? "archive"
      : current.source === "observed" || record.source === "observed"
        ? "observed"
        : "twitch-vod",
  });
}

export function GuideHistory({
  serverNow,
  twitchTracker,
  fallbackSessions,
  archivedDaily = [],
  memberSlug,
  className,
}: {
  serverNow: string;
  twitchTracker: TwitchTrackerChannelSnapshot[];
  fallbackSessions: AirtimeHistorySession[];
  /** Durable 365-day server archive. Recent browser data refines it in place. */
  archivedDaily?: readonly AirtimeDailyRecord[];
  /** A network page can show its own airtime row without duplicating the full house table. */
  memberSlug?: string | null;
  className?: string;
}) {
  const {
    sessions: recordedSessions,
    daily: clientDaily,
    isLoading: observedLoading,
  } = useStreamSessions("31d");
  const timePreferences = useBrowserTimeZone();
  const scroller = useDragScroll<HTMLDivElement>({ wheel: "x" });
  const parsedServerNow = Date.parse(serverNow);
  const serverNowMs = Number.isFinite(parsedServerNow) ? parsedServerNow : Date.now();
  const days = useMemo(
    () => completedAugustYearDateKeys(serverNowMs, timePreferences.timeZone),
    [serverNowMs, timePreferences.timeZone],
  );
  const calendar = useMemo(() => {
    const firstDay = days[0];
    const leadingDays = firstDay ? dateFromKey(firstDay).getUTCDay() : 0;
    const cells: Array<string | null> = [
      ...Array.from({ length: leadingDays }, () => null),
      ...days,
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const seenMonths = new Set<string>();
    let lastLabeledWeek = -4;
    const months = cells.flatMap((day, index) => {
      if (!day) return [];
      const month = day.slice(0, 7);
      if (seenMonths.has(month)) return [];
      seenMonths.add(month);
      const week = Math.floor(index / 7);
      // The abbreviated labels are intentionally sparse, as in GitHub's
      // contribution graph. Adjacent month names otherwise run together at
      // the beginning/end of a month.
      if (week - lastLabeledWeek < 4) return [];
      lastLabeledWeek = week;
      return [{
        key: month,
        label: formatMonth(day, timePreferences),
        week,
      }];
    });

    return {
      cells,
      months,
      weeks: Math.max(1, cells.length / 7),
    };
  }, [days, timePreferences]);
  const observedSessions = useMemo<AirtimeHistorySession[]>(
    () => recordedSessions.map((session) => ({
      ...session,
      source: "observed",
    })),
    [recordedSessions],
  );
  const sessions = useMemo(
    () => mergeAirtimeHistorySessions(observedSessions, fallbackSessions),
    [fallbackSessions, observedSessions],
  );
  const fallbackDays = useMemo(() => {
    const minutes = bucketAirtimeMinutesByDay(sessions, timePreferences.timeZone);
    const result = new Map<string, AirtimeDayDetail>();

    for (const session of sessions) {
      const startedAt = Date.parse(session.startedAt);
      const totalMinutes = parseMinutes(session);
      if (!Number.isFinite(startedAt) || totalMinutes <= 0) continue;
      const startKey = `${session.slug}:${dateKeyInTimeZone(startedAt, timePreferences.timeZone)}`;
      mergeDayRecord(result, startKey, {
        minutes: 0,
        broadcasts: 1,
        peakViewers: Math.max(0, Number(session.peakViewers) || 0),
        source: session.source,
      });
    }

    for (const [key, total] of minutes) {
      const current = result.get(key);
      result.set(key, {
        minutes: Math.max(0, total),
        broadcasts: current?.broadcasts ?? 0,
        peakViewers: current?.peakViewers ?? 0,
        source: current?.source ?? "twitch-vod",
      });
    }
    return result;
  }, [sessions, timePreferences.timeZone]);
  const archiveDays = useMemo(() => {
    const result = new Map<string, AirtimeDayDetail>();
    const records = [...archivedDaily, ...clientDaily];
    for (const record of records) {
      const day = record.date?.slice(0, 10);
      if (!record.slug || !day) continue;
      const minutes = Math.max(0, Number(record.minutes) || 0);
      const broadcasts = Math.max(0, Number(record.sessions) || 0);
      if (minutes <= 0 && broadcasts <= 0) continue;
      result.set(`${record.slug}:${day}`, {
        minutes,
        broadcasts,
        peakViewers: Math.max(0, Number(record.peakViewers) || 0),
        source: "archive",
      });
    }
    return result;
  }, [archivedDaily, clientDaily]);
  const airtimeDays = useMemo(() => {
    // The durable archive is authoritative wherever it has a cell. The short
    // session/VOD layer only fills gaps while an archive is being populated.
    const result = new Map(fallbackDays);
    for (const [key, record] of archiveDays) result.set(key, record);
    return result;
  }, [archiveDays, fallbackDays]);
  const visibleMembers = useMemo(
    () => memberSlug ? MEMBERS.filter((member) => member.slug === memberSlug) : MEMBERS,
    [memberSlug],
  );
  const trackerByMember = useMemo(
    () => new Map(twitchTracker.map((entry) => [entry.memberSlug, entry])),
    [twitchTracker],
  );
  const yearSummaries = useMemo(() => {
    const result = new Map<string, { minutes: number; broadcasts: number; activeDays: number }>();
    for (const member of visibleMembers) {
      let minutes = 0;
      let broadcasts = 0;
      let activeDays = 0;
      for (const day of days) {
        const detail = airtimeDays.get(`${member.slug}:${day}`);
        if (!detail || detail.minutes <= 0) continue;
        minutes += detail.minutes;
        broadcasts += detail.broadcasts;
        activeDays += 1;
      }
      result.set(member.slug, { minutes, broadcasts, activeDays });
    }
    return result;
  }, [airtimeDays, days, visibleMembers]);
  const gridStyle = useMemo(
    () => ({ "--guide-history-weeks": String(calendar.weeks) }) as CSSProperties,
    [calendar.weeks],
  );

  return (
    <section className={`guide-history${className ? ` ${className}` : ""}`} aria-labelledby="airtime-history-heading">
      <header className="guide-history-header">
        <div className="guide-history-heading">
          <span className="watch-kicker">August–July archive</span>
          <h2 id="airtime-history-heading">Airtime history</h2>
        </div>
        <div className="guide-history-header-meta">
          <span>Hover or focus a day for details</span>
          <span className="guide-history-legend" aria-label="Less to more airtime">
            <i aria-hidden />
            <i aria-hidden />
            <i aria-hidden />
            <i aria-hidden />
          </span>
        </div>
      </header>

      <div className="guide-history-body">
        <div ref={scroller} className="guide-history-year-scroll guide-drag" data-lenis-prevent>
          <div className="guide-history-year" style={gridStyle}>
            <div className="guide-history-month-row" aria-hidden>
              <span className="guide-history-month-label">Channel</span>
              <div className="guide-history-months">
                {calendar.months.map((month) => (
                  <span key={month.key} style={{ gridColumnStart: month.week + 1 }}>{month.label}</span>
                ))}
              </div>
            </div>

            {visibleMembers.map((member) => {
              const summary = yearSummaries.get(member.slug) ?? { minutes: 0, broadcasts: 0, activeDays: 0 };
              const tracker = trackerByMember.get(member.slug);
              const summaryDescription = tracker
                ? `${formatAirtime(summary.minutes)} across ${plural(summary.broadcasts, "broadcast")} on ${plural(summary.activeDays, "day")}. Latest TwitchTracker snapshot: ${formatAirtime(tracker.minutesStreamed)} streamed over ${tracker.windowDays} days.`
                : `${formatAirtime(summary.minutes)} across ${plural(summary.broadcasts, "broadcast")} on ${plural(summary.activeDays, "day")}.`;
              return (
                <article className="guide-history-year-row" key={member.slug}>
                  <div className="guide-history-person">
                    <span className="guide-comm-mark" aria-hidden>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={member.comm.logo} alt="" />
                    </span>
                    <div className="guide-history-person-copy">
                      <strong>{member.comm.name}</strong>
                      <small>{member.stageName}</small>
                      <Tooltip title={`${member.comm.name} · yearly airtime`} description={summaryDescription} placement="top">
                        <TooltipTrigger className="guide-history-summary" aria-label={`${member.comm.name} yearly airtime summary`}>
                          <span>
                            <strong>{formatAirtime(summary.minutes)}</strong>
                            <small>Airtime</small>
                          </span>
                          <span>
                            <b>{summary.broadcasts.toLocaleString("en-US")}</b>
                            <small>Shows</small>
                          </span>
                          <span>
                            <b>{summary.activeDays.toLocaleString("en-US")}</b>
                            <small>Days</small>
                          </span>
                        </TooltipTrigger>
                      </Tooltip>
                    </div>
                  </div>

                  <div
                    className="guide-history-contribution-grid"
                    role="grid"
                    aria-label={`${member.comm.name} August–July airtime contribution grid`}
                  >
                    {calendar.cells.map((day, index) => {
                      if (!day) return <span className="guide-history-cell-empty" key={`blank-${index}`} aria-hidden />;
                      const detail = airtimeDays.get(`${member.slug}:${day}`);
                      const minutes = detail?.minutes ?? 0;
                      const heat = Math.min(1, minutes / 240);
                      const dateLabel = formatLongDay(day, timePreferences);
                      const description = detail && minutes > 0
                        ? `${formatAirtime(minutes)} of airtime · ${detail.broadcasts > 0 ? plural(detail.broadcasts, "broadcast") : "broadcast count pending"} · ${sourceLabel(detail.source)}${detail.peakViewers > 0 ? ` · peak ${detail.peakViewers.toLocaleString("en-US")}` : ""}`
                        : observedLoading
                          ? "Checking the latest airtime archive."
                          : "No tracked Twitch airtime for this day.";
                      return (
                        <Tooltip
                          key={day}
                          title={`${member.comm.name} · ${dateLabel}`}
                          description={description}
                          placement="top"
                        >
                          <TooltipTrigger
                            aria-label={`${member.comm.name} · ${dateLabel}: ${description}`}
                            className={[
                              "guide-history-cell",
                              minutes > 0 ? "has-airtime" : "",
                              detail?.source === "archive" ? "is-archive" : "",
                            ].filter(Boolean).join(" ")}
                            style={minutes > 0
                              ? { "--guide-heat": String(0.18 + heat * 0.82) } as CSSProperties
                              : undefined}
                          />
                        </Tooltip>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
