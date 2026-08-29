"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, Play, Radio } from "lucide-react";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { buildContinuousGuideSchedule } from "@/lib/watch/continuous-schedule";
import {
  type GuideNetworkGroup,
  type GuideNetworkRow,
} from "@/lib/watch/channels";
import { liveTimelineEndMs } from "@/lib/watch/live-schedule";
import { itemToPlayable } from "@/lib/watch/playable";
import {
  theaterGuideProgramExpandedWidth,
  theaterGuideProgramWidth,
} from "@/lib/watch/theater-guide-layout";
import type { WatchItem, WatchPlatform } from "@/lib/watch/types";
import { DragScrollRail } from "./DragScrollRail";

type GuideStatus = "live" | "upcoming" | "replay" | "published";
type GuideContentType = "live" | "broadcast" | "video" | "short" | "clip" | "photo" | "post";

type GuideProgram = {
  id: string;
  slug: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  status: GuideStatus;
  platform: WatchPlatform;
  thumbnailUrl: string | null;
  contentType?: GuideContentType;
  orientation?: WatchItem["orientation"];
  durationSeconds?: number | null;
  watchItem?: WatchItem;
};

type GuidePayload = {
  programs: GuideProgram[];
  networks: GuideNetworkGroup[];
};

type TimelineEntry = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  status: GuideStatus;
  thumbnailUrl: string | null;
  item: WatchItem | null;
  continuous?: boolean;
  now?: boolean;
};

// Give cover art and a two-line title a dependable lane. Tiny timeline blocks
// remain time-positioned, but their card never collapses into an unreadable
// thumbnail-only target.
const ROW_HEIGHT = 104;
const MINUTES_WIDTH = 1.16;
const SCHEDULE_REFRESH_MS = 30 * 1_000;

function contentType(program: GuideProgram): GuideContentType {
  if (program.contentType) return program.contentType;
  if (program.status === "live") return "live";
  if (program.status === "replay") return "broadcast";
  return "video";
}

function isProgramInRow(program: GuideProgram, row: GuideNetworkRow): boolean {
  const kind = contentType(program);
  const broadcast = kind === "live" || kind === "broadcast" || program.status === "live" || program.status === "replay" || program.status === "upcoming";
  const short = kind === "short" || kind === "clip" || kind === "photo" || kind === "post";
  const coreMixedShort = row.networkSlug === "core" && row.kind === "shorts" && Boolean(program.watchItem?.format === "short");
  if (program.slug !== row.timelineSlug && !coreMixedShort) return false;
  if (row.kind === "live") return broadcast;
  if (row.kind === "videos") return !broadcast && !short && kind === "video";
  if (row.kind === "shorts") return short;
  return false;
}

function endOf(program: TimelineEntry, now: number): number {
  const start = Date.parse(program.startsAt);
  const explicit = program.endsAt ? Date.parse(program.endsAt) : NaN;
  // A provider can leave an old scheduled/VOD end attached to a stream that
  // remains live. Resolve live before accepting an explicit end so its card
  // cannot slip behind the Now marker while the broadcast is still on air.
  if (program.status === "live") return liveTimelineEndMs(start, explicit, now);
  if (Number.isFinite(explicit) && explicit > start) return explicit;
  if (program.continuous) return start + 15 * 60_000;
  if (program.item?.durationSeconds) return start + program.item.durationSeconds * 1_000;
  return start + 20 * 60_000;
}

function clock(value: number) {
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function inferredNetwork(networks: GuideNetworkGroup[], channelId: string | undefined, currentSlug: string | null | undefined) {
  return networks.find((group) => group.rows.some((row) => row.channel.id === channelId))?.network.slug
    ?? networks.find((group) => group.rows.some((row) => row.timelineSlug === currentSlug))?.network.slug
    ?? networks[0]?.network.slug
    ?? "core";
}

export function TheaterNetworkGuide({ onReturn }: { onReturn: () => void }) {
  const player = usePlayer();
  const guideRef = useRef<HTMLElement | null>(null);
  const centeredRangeRef = useRef<string | null>(null);
  const [payload, setPayload] = useState<GuidePayload | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    void fetch("/api/watch/guide", { credentials: "same-origin" })
      .then((response) => response.ok ? response.json() as Promise<GuidePayload> : null)
      .then((data) => { if (alive && data) setPayload(data); })
      .catch(() => { /* The current player remains usable while the guide refreshes. */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    // Keep the visible Now marker continuous. The expensive schedule build is
    // separately bucketed below, so this does not regenerate every 24/7 block
    // once a second just to move a clock hand.
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const networks = payload?.networks ?? [];
  const currentNetwork = inferredNetwork(networks, player.channel?.id, player.current?.memberSlug);
  const networkSlug = selectedNetwork ?? currentNetwork;
  const group = networks.find((entry) => entry.network.slug === networkSlug) ?? networks[0] ?? null;
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const scheduleBuildNow = Math.floor(safeNow / SCHEDULE_REFRESH_MS) * SCHEDULE_REFRESH_MS;
  const rangeStart = useMemo(() => {
    const date = new Date(safeNow);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }, [safeNow]);
  const rangeEnd = rangeStart + 24 * 60 * 60_000;
  const trackWidth = 24 * 60 * MINUTES_WIDTH;
  const nowLeft = ((safeNow - rangeStart) / 60_000) * MINUTES_WIDTH;

  // Open on the live part of the day just once per network/day. Viewers can
  // then freely drag to any other time without the clock pulling them back.
  useEffect(() => {
    if (!group) return;
    const key = `${group.network.slug}:${rangeStart}`;
    if (centeredRangeRef.current === key) return;
    const scroll = guideRef.current?.querySelector<HTMLElement>(".theater-network-guide-scroll");
    if (!scroll) return;
    const channelWidth = window.matchMedia("(max-width: 720px)").matches ? 132.8 : 172.8;
    const target = channelWidth + nowLeft - scroll.clientWidth * 0.42;
    scroll.scrollLeft = Math.max(0, Math.min(target, scroll.scrollWidth - scroll.clientWidth));
    centeredRangeRef.current = key;
  }, [group, nowLeft, rangeStart]);

  const lanes = useMemo(() => {
    if (!group) return [];
    return group.rows.map((row) => {
      const entries: TimelineEntry[] = row.kind === "continuous"
        ? buildContinuousGuideSchedule({ group, row, rangeStart, rangeEnd, nowMs: scheduleBuildNow }).map((block) => ({
          id: `continuous:${row.id}:${block.id}`,
          title: block.item.title,
          startsAt: block.startsAt,
          endsAt: block.endsAt,
          status: block.source === "live" ? "live" : "published",
          thumbnailUrl: block.item.backdrop || block.item.poster || group.network.artwork,
          item: block.item,
          continuous: true,
          now: block.current,
        }))
        : (payload?.programs ?? [])
          .filter((program) => isProgramInRow(program, row))
          .map((program) => ({
            id: program.id,
            title: program.title,
            startsAt: program.startsAt,
            endsAt: program.endsAt,
            status: program.status,
            thumbnailUrl: program.thumbnailUrl,
            item: program.watchItem ?? null,
          }));
      return { row, entries: entries.filter((entry) => {
        const start = Date.parse(entry.startsAt);
        return Number.isFinite(start) && start < rangeEnd && endOf(entry, scheduleBuildNow) > rangeStart;
      }) };
    });
  }, [group, payload?.programs, rangeEnd, rangeStart, scheduleBuildNow]);

  const tune = (row: GuideNetworkRow, entry: TimelineEntry) => {
    const item = entry.item ?? row.items[0];
    if (!item) return;
    const playable = itemToPlayable(item);
    if (!playable) return;
    const channel = {
      ...row.channel,
      airing: {
        itemKey: playable.key,
        network: group?.network.name ?? row.channel.title,
        channel: row.label,
        startsAt: entry.startsAt,
        endsAt: entry.endsAt ?? undefined,
        status: entry.status,
        continuous: entry.continuous === true,
      },
    };
    player.playChannel(channel, row.items, item);
    // Return to the player with the selected channel/program immediately
    // visible in its right-hand Details panel.
    player.setCompanionView("details");
    player.setQueueOpen(true);
    window.requestAnimationFrame(onReturn);
  };

  return (
    <section ref={guideRef} className="theater-network-guide" aria-label="Channel guide">
      <header className="theater-network-guide-header">
        <div>
          <p>Timeline</p>
          <h2>{group?.network.name ?? "CORE"} guide</h2>
        </div>
        <button type="button" onClick={onReturn}><ChevronLeft aria-hidden /> Return to player</button>
      </header>
      <div className="theater-network-tabs" role="tablist" aria-label="Choose network">
        {networks.map((network) => {
          const selected = network.network.slug === group?.network.slug;
          return <button
            key={network.network.slug}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => setSelectedNetwork(network.network.slug)}
            style={{ "--theater-network-accent": network.network.accent } as CSSProperties}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={network.network.artwork} alt="" /> {network.network.name}
          </button>;
        })}
      </div>
      {!group ? <p className="theater-network-guide-empty">Loading the network timeline…</p> : (
        <DragScrollRail className="theater-network-guide-scroll" wheelToX data-lenis-prevent role="region" aria-label={`${group.network.name} channel timeline`}>
          <div className="theater-network-guide-board" style={{ "--theater-guide-width": `${trackWidth}px`, "--theater-guide-now": `${nowLeft}px`, "--theater-network-accent": group.network.accent } as CSSProperties}>
            <div className="theater-network-guide-head">
              <span>Channel</span>
              <div>{Array.from({ length: 13 }, (_, index) => {
                const tick = rangeStart + index * 2 * 60 * 60_000;
                return <i key={tick} style={{ left: `${((tick - rangeStart) / 60_000) * MINUTES_WIDTH}px` }}>{clock(tick)}</i>;
              })}</div>
            </div>
            {lanes.map(({ row, entries }) => (
              <div className={`theater-network-guide-row${player.channel?.id === row.channel.id ? " is-tuned" : ""}`} key={row.id} style={{ minHeight: ROW_HEIGHT }}>
                <button type="button" className="theater-network-guide-channel" onClick={() => tune(row, { id: row.id, title: row.channel.title, startsAt: new Date(safeNow).toISOString(), endsAt: null, status: "published", thumbnailUrl: null, item: row.items[0] ?? null })} disabled={!row.items.length}>
                  <span>{row.kind === "live" ? <Radio aria-hidden /> : <Play aria-hidden />}</span>
                  <strong>{row.label}</strong>
                  <small>{player.channel?.id === row.channel.id ? "Playing" : row.items.length ? "Tune in" : "Unavailable"}</small>
                </button>
                <div className="theater-network-guide-track">
                  {entries.map((entry) => {
                    const start = Date.parse(entry.startsAt);
                    const end = endOf(entry, safeNow);
                    const left = Math.max(0, ((Math.max(start, rangeStart) - rangeStart) / 60_000) * MINUTES_WIDTH);
                    const durationWidth = ((Math.min(end, rangeEnd) - Math.max(start, rangeStart)) / 60_000) * MINUTES_WIDTH || 150;
                    const hasArtwork = Boolean(entry.thumbnailUrl);
                    const isLive = entry.status === "live";
                    const width = theaterGuideProgramWidth({ title: entry.title, durationWidth, hasArtwork, isLive });
                    const expandedWidth = theaterGuideProgramExpandedWidth({ title: entry.title, durationWidth, hasArtwork, isLive });
                    const active = Boolean(entry.item && itemToPlayable(entry.item)?.key === player.current?.key);
                    const entryIsNow = start <= safeNow && safeNow < end;
                    const entryIsPast = !entryIsNow && end <= safeNow;
                    // The visible program label is the accessible name. Do not add a
                    // native `title` attribute here: it produces the browser/Windows
                    // tooltip on hover, which clashes with the Theater UI.
                    return <button
                      key={entry.id}
                      type="button"
                      className={`theater-network-guide-program is-${entry.status}${entryIsNow ? " is-now" : ""}${entryIsPast ? " is-past" : ""}${active ? " is-active" : ""}`}
                      style={{
                        left,
                        "--theater-guide-program-width": `${width}px`,
                        "--theater-guide-program-expanded-width": `${expandedWidth}px`,
                      } as CSSProperties}
                      onClick={() => tune(row, entry)}
                      aria-label={`${entryIsNow || entry.status === "live" ? "Live now" : `Starts ${clock(start)}`}: ${entry.title}. Tune to this program.`}
                    >
                      {entry.thumbnailUrl ? <img src={entry.thumbnailUrl} alt="" /> : null}
                      <span><i>{entryIsNow || entry.status === "live" ? "LIVE" : clock(start)}</i><strong>{entry.title}</strong></span>
                    </button>;
                  })}
                  {!entries.length ? <span className="theater-network-guide-none">No scheduled {row.label.toLowerCase()} yet</span> : null}
                </div>
              </div>
            ))}
            {now >= rangeStart && now <= rangeEnd ? <span className="theater-network-guide-now" aria-hidden><i>Now</i></span> : null}
          </div>
        </DragScrollRail>
      )}
      <p className="theater-network-guide-hint">Drag sideways through the day. Choose any network above, then tune a channel or a specific program.</p>
    </section>
  );
}
