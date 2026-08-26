"use client";

import { useMemo, type CSSProperties, type KeyboardEvent } from "react";
import { ArrowRight, Play, Radio, RotateCcw, Smartphone } from "lucide-react";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { useBrowserTimeZone } from "@/hooks/useBrowserTimeZone";
import {
  mediaTypeLabel,
  type GuideNetworkGroup,
  type GuideNetworkRow,
  type NetworkChannelMode,
} from "@/lib/watch/channels";
import { itemToPlayable } from "@/lib/watch/playable";
import type { WatchItem } from "@/lib/watch/types";
import { watchAttributionLabel } from "@/lib/watch/display-label";
import { twitchLiveChatLogin } from "@/lib/watch/player-companion";
import { DragScrollRail } from "./DragScrollRail";

const CHANNEL_COLUMNS = [
  { kind: "live", label: "Live", detail: "Twitch + broadcasts" },
  { kind: "videos", label: "Videos", detail: "YouTube" },
  { kind: "shorts", label: "Shorts", detail: "Vertical video" },
  { kind: "continuous", label: "24/7", detail: "Always on" },
] as const satisfies ReadonlyArray<{
  kind: NetworkChannelMode;
  label: GuideNetworkRow["label"];
  detail: string;
}>;

function isPlayingItem(item: WatchItem, current: { key: string } | null): boolean {
  return Boolean(current && itemToPlayable(item)?.key === current.key);
}

function channelIcon(kind: NetworkChannelMode, size = 15) {
  if (kind === "live") return <Radio size={size} aria-hidden />;
  if (kind === "shorts") return <Smartphone size={size} aria-hidden />;
  if (kind === "continuous") return <RotateCcw size={size} aria-hidden />;
  return <Play size={size} fill="currentColor" aria-hidden />;
}

function broadcastTime(item: WatchItem, locale: string, timeZone: string): string | null {
  const value = item.live?.startedAt ?? item.publishedAt;
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toLocaleString(locale, {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function itemCountLabel(row: GuideNetworkRow): string {
  const noun = row.kind === "live" ? "broadcast" : "title";
  return `${row.items.length} ${noun}${row.items.length === 1 ? "" : "s"}`;
}

function emptyCopy(networkName: string, kind: NetworkChannelMode): string {
  if (kind === "live") return `${networkName} has no connected live feed yet.`;
  if (kind === "shorts") return "No connected vertical videos yet.";
  if (kind === "continuous") return "No videos are ready for rotation yet.";
  return "No connected videos yet.";
}

export function GuideChannelMatrix({ networks }: { networks: GuideNetworkGroup[] }) {
  const player = usePlayer();
  const viewer = useBrowserTimeZone();

  const tunedNetworkSlug = useMemo(() => {
    if (!player.channel) return null;
    return networks.find((group) =>
      group.rows.some((row) => row.channel.id === player.channel?.id),
    )?.network.slug ?? null;
  }, [networks, player.channel]);

  function tuneRow(row: GuideNetworkRow, start?: WatchItem) {
    if (!row.items.length) return;
    const selected = start ?? row.items[0];
    player.playChannel(row.channel, row.items, selected ?? 0);
    const playable = selected ? itemToPlayable(selected) : null;
    if (row.kind === "live" && twitchLiveChatLogin(playable)) {
      player.setCompanionView("chat");
      player.setQueueOpen(true);
    }
  }

  function handleTimelineKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const timeline = event.currentTarget;
    const step = Math.max(240, timeline.clientWidth * 0.72);
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      timeline.scrollBy({ left: -step, behavior });
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      timeline.scrollBy({ left: step, behavior });
    } else if (event.key === "Home") {
      event.preventDefault();
      timeline.scrollTo({ left: 0, behavior });
    } else if (event.key === "End") {
      event.preventDefault();
      timeline.scrollTo({ left: timeline.scrollWidth, behavior });
    }
  }

  return (
    <section className="guide-channel-matrix" aria-labelledby="guide-channels-title" data-guide-channel-matrix>
      <div className="guide-channel-matrix-heading">
        <div>
          <p className="watch-kicker">Network timeline</p>
          <h2 id="guide-channels-title">Pick a channel</h2>
          <p>
            Move across each network from Live to Videos, Shorts, and its always-on 24/7 channel.
            Select any block to start that full lineup.
          </p>
        </div>
        {player.channel ? (
          <span className="guide-channel-now" aria-live="polite">
            <span aria-hidden />
            Now playing · {player.channel.title}
          </span>
        ) : null}
      </div>

      <DragScrollRail
        className="guide-channel-timeline-scroll"
        wheelToX
        tabIndex={0}
        role="region"
        aria-label="Network channel timeline. Drag, swipe, scroll, or use the left and right arrow keys to browse channels."
        onKeyDown={handleTimelineKey}
        data-lenis-prevent
      >
        <div className="guide-channel-timeline-board">
          <div className="guide-channel-timeline-head" aria-hidden>
            <span className="guide-channel-timeline-network guide-channel-timeline-sticky">Network</span>
            {CHANNEL_COLUMNS.map((column, index) => (
              <span key={column.kind} className="guide-channel-timeline-column">
                <i>{String(index + 1).padStart(2, "0")}</i>
                <span>{channelIcon(column.kind, 14)}</span>
                <strong>{column.label}</strong>
                <small>{column.detail}</small>
              </span>
            ))}
          </div>

          {networks.map((group) => {
            const tuned = tunedNetworkSlug === group.network.slug;
            const regionId = `guide-network-${group.network.slug}`;
            return (
              <section
                key={group.network.slug}
                id={regionId}
                aria-labelledby={`${regionId}-title`}
                className={`guide-channel-timeline-row${tuned ? " is-tuned" : ""}`}
                style={{ "--guide-network-accent": group.network.accent } as CSSProperties}
              >
                <div className="guide-channel-timeline-network guide-channel-timeline-sticky">
                  <span className="guide-network-logo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={group.network.artwork} alt="" />
                  </span>
                  <span className="guide-network-copy">
                    <strong id={`${regionId}-title`}>{group.network.name}</strong>
                    <small>{group.network.host}</small>
                  </span>
                  {tuned ? (
                    <span className="guide-channel-network-playing" title="A channel from this network is playing">
                      <Radio size={13} aria-hidden />
                      <span>On now</span>
                    </span>
                  ) : null}
                </div>

                {CHANNEL_COLUMNS.map((column) => {
                  const row = group.rows.find((candidate) => candidate.kind === column.kind);
                  const active = Boolean(row && player.channel?.id === row.channel.id);
                  const featured = row?.items.find((item) => isPlayingItem(item, player.current)) ?? row?.items[0];
                  const liveFeatured = Boolean(featured && row?.kind === "live" && (featured.kind === "live" || featured.format === "live"));
                  const available = Boolean(row?.items.length);
                  const airedAt = viewer.ready && featured && row?.kind === "live"
                    ? broadcastTime(featured, viewer.locale, viewer.timeZone)
                    : null;

                  return (
                    <div key={column.kind} className={`guide-channel-timeline-slot is-${column.kind}`}>
                      <button
                        type="button"
                        className={`guide-channel-timeline-card${active ? " is-active" : ""}${liveFeatured ? " is-live" : ""}`}
                        onClick={() => row && tuneRow(row, featured)}
                        disabled={!available}
                        aria-pressed={active}
                        aria-label={row && available
                          ? `${active ? "Playing" : "Play"} ${row.channel.title}`
                          : `${group.network.name} ${column.label} is unavailable`}
                      >
                        <span className="guide-channel-timeline-media">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={featured?.poster || group.network.artwork} alt="" loading="lazy" />
                          <i>{active ? "Playing" : liveFeatured ? "Live" : column.kind === "continuous" ? "24/7" : featured ? mediaTypeLabel(featured) : "Offline"}</i>
                        </span>
                        <span className="guide-channel-timeline-copy">
                          <span className="guide-channel-timeline-meta">
                            <span>{active ? "On now" : available && row ? itemCountLabel(row) : "Unavailable"}</span>
                            {available ? channelIcon(column.kind, 13) : null}
                          </span>
                          <strong>{featured?.title ?? emptyCopy(group.network.name, column.kind)}</strong>
                          <small>
                            {featured
                              ? `${watchAttributionLabel(featured)}${airedAt ? ` · ${airedAt}` : ""}`
                              : column.detail}
                          </small>
                          <span className="guide-channel-timeline-action">
                            {active ? "Playing now" : available ? "Play channel" : "Not available"}
                            {available ? <ArrowRight size={13} aria-hidden /> : null}
                          </span>
                        </span>
                      </button>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      </DragScrollRail>
      <p className="guide-channel-timeline-hint">Drag or scroll sideways to see every channel.</p>
    </section>
  );
}
