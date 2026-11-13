"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowRight, Play } from "lucide-react";
import { useWatchGuide } from "@/hooks/useWatchGuide";
import { useBrowserTimeZone } from "@/hooks/useBrowserTimeZone";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { buildEpgCells, cellProgram, epgNowNext, epgProgress, mixLabel, type EpgCell } from "@/lib/watch/guide-epg";
import type { GuideProgram } from "@/lib/watch/guide-response";
import type { GuideNetworkGroup, GuideNetworkRow, NetworkChannelSlug } from "@/lib/watch/channels";
import { itemToPlayable } from "@/lib/watch/playable";
import { liveTimelineEndMs } from "@/lib/watch/live-schedule";
import { readableTitle } from "@/lib/watch/presentation";
import styles from "./GuideHistoryDeck.module.css";

const HOUR = 3_600_000;
const MIN_CELL_MS = 20 * 60_000;

type StripRow = {
  group: GuideNetworkGroup;
  row: GuideNetworkRow;
  now: EpgCell | null;
  next: EpgCell | null;
};

/**
 * A compact "on now / up next" slice of the Guide for pages other than /guide.
 * It reads the same shared guide snapshot (one SWR key per window), tunes a
 * channel in place, and links to the full TV guide. Drop it anywhere:
 * `<GuideNowStrip />` for every network, or `network="ron"` for one.
 */
export function GuideNowStrip({ network, limit = 6, title = "On now", headingId = "guide-now-strip-title" }: {
  network?: NetworkChannelSlug;
  limit?: number;
  title?: string;
  headingId?: string;
}) {
  const [guideWindow] = useState(() => {
    const now = Date.now();
    return { start: Math.floor(now / 1_800_000) * 1_800_000, end: Math.ceil((now + 6 * HOUR) / HOUR) * HOUR };
  });
  const { data, error, isLoading } = useWatchGuide({ window: guideWindow });
  const time = useBrowserTimeZone();
  const player = usePlayer();
  const [nowMs, setNowMs] = useState(guideWindow.start);
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const rows = useMemo<StripRow[]>(() => {
    if (!data) return [];
    const endOf = (program: GuideProgram) => {
      const start = Date.parse(program.startsAt);
      const end = program.endsAt ? Date.parse(program.endsAt) : NaN;
      if (program.status === "live") return liveTimelineEndMs(start, end, nowMs);
      if (Number.isFinite(end) && end > start) return end;
      return start + (program.durationSeconds ?? 900) * 1000;
    };
    const output = (data.networks ?? [])
      .filter((group) => !network || group.network.slug === network)
      .flatMap((group) => group.rows.flatMap((row): StripRow[] => {
        if (row.kind !== "live" && row.kind !== "continuous") return [];
        const programs = row.kind === "continuous"
          ? data.programs.filter((program) => program.continuous && program.guideRowId === row.id)
          : data.programs.filter((program) => !program.continuous && program.slug === row.timelineSlug
            && (program.status === "live" || program.status === "upcoming"));
        const cells = buildEpgCells(programs, { rangeStart: guideWindow.start, rangeEnd: guideWindow.end, minCellMs: MIN_CELL_MS, endOf });
        const { now, next } = epgNowNext(cells, nowMs);
        // An idle live channel with nothing announced is not worth a row here.
        if (!now && !next) return [];
        return [{ group, row, now, next }];
      }));
    // What is live first, then 24/7 channels, then announced streams.
    const rank = (entry: StripRow) => entry.now && entry.row.kind === "live" ? 0 : entry.now ? 1 : 2;
    return output.sort((a, b) => rank(a) - rank(b)).slice(0, limit);
  }, [data, guideWindow, limit, network, nowMs]);

  const clock = (ms: number) => time.ready
    ? new Date(ms).toLocaleTimeString(time.locale, { timeZone: time.timeZone, hour: "numeric", minute: "2-digit" })
    : "";

  function tune({ group, row, now }: StripRow) {
    if (!now) return;
    const program = cellProgram(now, nowMs);
    const item = program.watchItem;
    const playable = item ? itemToPlayable(item) : null;
    if (!item || !playable) {
      window.open(program.sourceUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const channel = {
      ...row.channel,
      airing: {
        itemKey: playable.key,
        network: group.network.name,
        channel: row.label,
        startsAt: program.startsAt,
        endsAt: program.endsAt ?? undefined,
        status: program.status,
        continuous: program.continuous === true,
      },
    };
    const lineupItem = row.items.find((candidate) => candidate.id === item.id && candidate.platform === item.platform);
    if (lineupItem) player.playChannel(channel, row.items, lineupItem);
    else player.play(playable, row.items, { channel });
  }

  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <header className={styles.panelHeader}>
        <div>
          <h2 id={headingId}>{title}</h2>
          <p>{network ? "This channel’s lineup right now." : "What every channel is airing, and what’s next."}</p>
        </div>
        <Link href="/guide" prefetch={false} className={styles.panelLink}>Full guide<ArrowRight size={15} aria-hidden="true" /></Link>
      </header>

      {!data && (isLoading || !error) ? (
        <div className={styles.skeleton} role="status"><span className="sr-only">Loading the guide</span><i /><i /><i /></div>
      ) : null}
      {!data && error ? <p className={styles.empty} role="status">The guide is unavailable right now. <Link href="/guide" prefetch={false}>Open the full guide</Link></p> : null}
      {data && !rows.length ? <p className={styles.empty}>Nothing is airing on these channels right now. <Link href="/guide" prefetch={false}>See the full schedule</Link></p> : null}

      {rows.length ? (
        <ol className={styles.nowList}>
          {rows.map((entry) => {
            const { group, row, now, next } = entry;
            const current = now ? cellProgram(now, nowMs) : null;
            const live = current?.status === "live";
            const nextProgram = next ? cellProgram(next, nowMs) : null;
            const label = `${group.network.name} ${row.label}`;
            return (
              <li key={row.id} className={styles.nowRow} style={{ "--strip-accent": group.network.accent } as CSSProperties}>
                <span className={styles.nowLogo} aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={group.network.artwork} alt="" />
                </span>
                <div className={styles.nowCopy}>
                  <p className={styles.nowChannel}>
                    <strong>{group.network.name}</strong>
                    <span>{row.label}</span>
                    {live ? <em className={styles.liveBadge}>Live</em> : now ? <em className={styles.onBadge}>On now</em> : null}
                  </p>
                  {now && current ? (
                    <>
                      <p className={styles.nowTitle}>{now.programs.length > 1 ? `${mixLabel(now)} · ${readableTitle(current.title)}` : readableTitle(current.title)}</p>
                      {live ? null : <span className={styles.progress} aria-hidden="true"><i style={{ width: `${epgProgress(now, nowMs) * 100}%` }} /></span>}
                    </>
                  ) : <p className={styles.nowTitle}>Off air</p>}
                  {nextProgram && next ? (
                    <p className={styles.nextLine}><span>Next {clock(next.start)}</span>{next.programs.length > 1 ? mixLabel(next) : readableTitle(nextProgram.title)}</p>
                  ) : null}
                </div>
                {now ? (
                  <button type="button" className={styles.tune} onClick={() => tune(entry)} aria-label={`Watch ${label}: ${current ? readableTitle(current.title) : ""}`}>
                    <Play size={15} fill="currentColor" aria-hidden="true" />
                    <span>Watch</span>
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
