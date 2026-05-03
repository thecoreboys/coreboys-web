"use client";

import Script from "next/script";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Eye, Gauge, MessageSquare, Radio, RotateCcw, Wifi, WifiOff } from "lucide-react";
import { TwitchChat } from "@/components/live/TwitchChat";
import { useLiveStatus } from "@/hooks/useLiveStatus";

/**
 * Live stream monitor. Mounts a Twitch JS player (not the bare iframe)
 * so we can pull realtime telemetry via `player.getPlaybackStats()`
 * once a second:
 *
 *   - bufferSize             (s)
 *   - hlsLatencyBroadcaster  (s)        → "latency to broadcaster"
 *   - playbackRate           (bytes/s)  → download bitrate
 *   - fps                    (number)
 *   - displayResolution / videoResolution
 *   - codecs
 *   - skippedFrames
 *
 * Connection health is derived from buffer size + skipped-frames trend
 * + broadcaster latency, so the user sees a single "Healthy / Watch /
 * Unstable" pill rather than having to interpret the raw numbers.
 *
 * The chat panel is the existing TwitchChat component, hard-wired to
 * the member's login + user_id so 7TV / BTTV channel emotes resolve.
 */

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Twitch?: any;
  }
}

type Stats = {
  fps: number | null;
  bufferSize: number | null; // seconds
  hlsLatencyBroadcaster: number | null; // seconds
  playbackRate: number | null; // bytes/sec
  videoResolution: string | null;
  displayResolution: string | null;
  codecs: string | null;
  skippedFrames: number | null;
};

const EMPTY_STATS: Stats = {
  fps: null,
  bufferSize: null,
  hlsLatencyBroadcaster: null,
  playbackRate: null,
  videoResolution: null,
  displayResolution: null,
  codecs: null,
  skippedFrames: null,
};

const HISTORY_LEN = 60; // seconds of bitrate samples kept for the sparkline

export type MonitorClientProps = {
  slug: string;
  login: string;
  displayName: string;
  accent: string;
  userId: string;
  /** Streamer's Twitch profile image — rendered in the chat panel
   *  header. Falls through to the channel-name initial if missing. */
  avatarUrl?: string;
};

export function MonitorClient({
  slug,
  login,
  displayName,
  accent,
  userId,
  avatarUrl,
}: MonitorClientProps) {
  const containerId = `tw-monitor-${slug}`;
  const [parent, setParent] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [history, setHistory] = useState<Array<{ ts: number; rate: number }>>([]);
  const [skippedTrend, setSkippedTrend] = useState<number[]>([]);
  const [fpsTrend, setFpsTrend] = useState<number[]>([]);
  const [isLive, setIsLive] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Chat-rate state. Each entry is the timestamp of an incoming chat
  // message; we count entries within the last 60s for "chats / min" and
  // average across the time the page has been open for "avg / min".
  const chatTimesRef = useRef<number[]>([]);
  const allTimeChatCount = useRef<number>(0);
  const pageOpenedAt = useRef<number>(Date.now());
  const [chatPerMin, setChatPerMin] = useState(0);
  const [chatAvgPerMin, setChatAvgPerMin] = useState(0);
  const [chatRateHistory, setChatRateHistory] = useState<number[]>([]);
  const handleChatMessage = useCallback(() => {
    chatTimesRef.current.push(Date.now());
    allTimeChatCount.current += 1;
  }, []);

  // Chat-rate ticker — recomputes the rolling 60s window count, the
  // long-run average, and pushes a sample into the chartable history
  // every 5 seconds. Decoupled from the 1Hz telemetry poll because
  // chat metrics aren't sensitive to second-level resolution and we
  // want the displayed averages to feel stable (no per-second jitter).
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const cutoff = now - 60_000;
      chatTimesRef.current = chatTimesRef.current.filter((t) => t >= cutoff);
      const perMin = chatTimesRef.current.length;
      setChatPerMin(perMin);
      const minutesOpen = Math.max(1 / 60, (now - pageOpenedAt.current) / 60_000);
      setChatAvgPerMin(
        Math.round((allTimeChatCount.current / minutesOpen) * 10) / 10,
      );
      setChatRateHistory((prev) => {
        const out = [...prev, perMin];
        // ~12 samples/min × 5 minutes of history.
        return out.length > 60 ? out.slice(-60) : out;
      });
    }, 5_000);
    return () => clearInterval(id);
  }, []);

  // Viewer-count state — pulled from /api/live via useLiveStatus.
  const { data: liveData } = useLiveStatus();
  const liveEntry = useMemo(
    () => liveData?.live.find((e) => e.login.toLowerCase() === login.toLowerCase()),
    [liveData, login],
  );
  const currentViewers = liveEntry?.isLive ? liveEntry.viewerCount ?? null : null;
  const [viewerHistory, setViewerHistory] = useState<number[]>([]);
  useEffect(() => {
    if (currentViewers == null) return;
    setViewerHistory((prev) => {
      const next = [...prev, currentViewers];
      return next.length > 30 ? next.slice(-30) : next; // ~30 minutes of samples
    });
  }, [currentViewers]);
  const avgViewers = useMemo(() => {
    if (viewerHistory.length === 0) return null;
    return Math.round(viewerHistory.reduce((a, b) => a + b, 0) / viewerHistory.length);
  }, [viewerHistory]);

  useEffect(() => {
    setParent(window.location.hostname);
  }, []);

  // Instantiate the Twitch.Player once the script is loaded AND we know
  // the embedding hostname. Re-running the effect when login changes
  // (parameterized route swap) tears down the old player first.
  useEffect(() => {
    if (!scriptReady || !parent) return;
    if (typeof window === "undefined" || !window.Twitch) return;

    // Tear down a previous player by emptying the host div — the
    // Twitch SDK doesn't expose a destroy() method, so the cleanest
    // reset is to drop the iframe it injected.
    const host = document.getElementById(containerId);
    if (host) host.innerHTML = "";

    try {
      const player = new window.Twitch.Player(containerId, {
        channel: login,
        parent: [parent],
        autoplay: true,
        muted: true,
        width: "100%",
        height: "100%",
        // Hide the giant "WATCH ON TWITCH" / channel info overlays — we
        // already have a header with the channel name on this page.
        layout: "video",
      });
      playerRef.current = player;

      const TwitchPlayer = window.Twitch.Player;
      player.addEventListener(TwitchPlayer.ONLINE, () => setIsLive(true));
      player.addEventListener(TwitchPlayer.OFFLINE, () => setIsLive(false));
      player.addEventListener(TwitchPlayer.READY, () => setError(null));
      player.addEventListener(TwitchPlayer.ENDED, () => setIsLive(false));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mount Twitch player");
    }

    return () => {
      playerRef.current = null;
    };
  }, [scriptReady, parent, login, containerId]);

  // Telemetry poll. The official method is `getPlaybackStats()` — older
  // forks/wrappers expose `getStats()` so we try both, and we wrap in
  // Promise.resolve since some historical SDK builds returned a Promise.
  useEffect(() => {
    let cancelled = false;
    const id = setInterval(async () => {
      const player = playerRef.current;
      if (!player) return;
      const reader =
        typeof player.getPlaybackStats === "function"
          ? player.getPlaybackStats.bind(player)
          : typeof player.getStats === "function"
            ? player.getStats.bind(player)
            : null;
      if (!reader) return;
      try {
        const raw = await Promise.resolve(reader());
        if (cancelled || !raw || typeof raw !== "object") return;
        const next: Stats = {
          fps: numOrNull(raw.fps),
          bufferSize: numOrNull(raw.bufferSize),
          hlsLatencyBroadcaster: numOrNull(raw.hlsLatencyBroadcaster),
          playbackRate: numOrNull(raw.playbackRate),
          videoResolution: strOrNull(raw.videoResolution),
          displayResolution: strOrNull(raw.displayResolution),
          codecs: strOrNull(raw.codecs),
          skippedFrames: numOrNull(raw.skippedFrames),
        };
        setStats(next);
        if (next.playbackRate != null) {
          setHistory((prev) => {
            const out = [...prev, { ts: Date.now(), rate: next.playbackRate! }];
            return out.length > HISTORY_LEN ? out.slice(-HISTORY_LEN) : out;
          });
        }
        if (next.skippedFrames != null) {
          setSkippedTrend((prev) => {
            const out = [...prev, next.skippedFrames!];
            return out.length > 10 ? out.slice(-10) : out;
          });
        }
        if (next.fps != null) {
          setFpsTrend((prev) => {
            const out = [...prev, next.fps!];
            return out.length > 30 ? out.slice(-30) : out;
          });
        }
      } catch {
        /* keep polling — transient errors during SPA transitions etc. */
      }
    }, 1_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const reload = useCallback(() => {
    const host = document.getElementById(containerId);
    if (host) host.innerHTML = "";
    setStats(EMPTY_STATS);
    setHistory([]);
    setSkippedTrend([]);
    setIsLive(null);
    // Re-trigger the mount effect by toggling parent state.
    setParent((p) => (p ? `${p}` : p));
    if (parent && window.Twitch) {
      try {
        const player = new window.Twitch.Player(containerId, {
          channel: login,
          parent: [parent],
          autoplay: true,
          muted: true,
          width: "100%",
          height: "100%",
          layout: "video",
        });
        playerRef.current = player;
      } catch {
        /* ignore */
      }
    }
  }, [containerId, login, parent]);

  // Derived health pill — tries to assign blame between the broadcaster
  // and the viewer. Heuristics:
  //   • Streamer issue: hlsLatencyBroadcaster keeps climbing (>20s) OR
  //     the broadcaster's FPS is sliding (typical encoder/CPU starvation
  //     signature on the streamer's side, while viewer buffer is fine).
  //   • Your connection: viewer buffer collapses below 0.5s OR skipped
  //     frames are climbing rapidly while broadcaster latency stays
  //     normal (your network can't keep up with the segment cadence).
  //   • Watch: borderline values that don't yet meet the bad thresholds.
  //   • Healthy: everything inside the comfortable window.
  const health = useMemo(() => {
    const { bufferSize, hlsLatencyBroadcaster, fps } = stats;
    const droppedDelta = (() => {
      if (skippedTrend.length < 2) return 0;
      return (skippedTrend.at(-1) ?? 0) - (skippedTrend.at(-2) ?? 0);
    })();
    const fpsDrop = (() => {
      if (fpsTrend.length < 5) return 0;
      const recent = fpsTrend.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const baseline = fpsTrend.slice(0, -3).reduce((a, b) => a + b, 0) /
        Math.max(1, fpsTrend.length - 3);
      return baseline - recent;
    })();
    if (bufferSize == null && hlsLatencyBroadcaster == null) {
      return {
        label: "Connecting",
        tone: "neutral" as const,
        explain: "Waiting for the player to report stats.",
      };
    }
    // Streamer-side red flags first — viewer can't fix these.
    if (
      (hlsLatencyBroadcaster != null && hlsLatencyBroadcaster > 25) ||
      (fps != null && fps < 20) ||
      fpsDrop > 5
    ) {
      return {
        label: "Streamer issue",
        tone: "bad" as const,
        explain:
          "Broadcaster latency or FPS is degraded — likely the streamer's encoder, GPU, or upstream network.",
      };
    }
    // Viewer-side red flags — buffer collapse + drops with healthy
    // broadcaster latency means YOUR pipe can't keep up.
    if (
      (bufferSize != null && bufferSize < 0.5) ||
      droppedDelta > 8
    ) {
      return {
        label: "Your connection",
        tone: "bad" as const,
        explain:
          "Buffer is depleting and frames are being skipped on this device — likely viewer-side bandwidth or CPU.",
      };
    }
    // Borderline — flag without blaming.
    if (
      (bufferSize != null && bufferSize < 1) ||
      droppedDelta > 0 ||
      (hlsLatencyBroadcaster != null && hlsLatencyBroadcaster > 15) ||
      fpsDrop > 2
    ) {
      return {
        label: "Watch",
        tone: "warn" as const,
        explain:
          "Slight buffer / latency wobble — usually transient, monitor for a minute.",
      };
    }
    return {
      label: "Good connection",
      tone: "good" as const,
      explain: "Buffer healthy, broadcaster latency low, no recent drops.",
    };
  }, [stats, skippedTrend, fpsTrend]);

  // Download bitrate (current poll) is just the latest playbackRate.
  // Bandwidth estimate uses the 90th-percentile of the last 30 samples,
  // which gives a sense of "what your connection has been able to
  // sustain" rather than a noisy instantaneous reading.
  const downloadBitrateKbps = useMemo(
    () => playbackRateToKbps(stats.playbackRate),
    [stats.playbackRate],
  );
  const bandwidthEstimateKbps = useMemo(() => {
    if (history.length === 0) return null;
    const sorted = history.map((h) => h.rate).sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9));
    return playbackRateToKbps(sorted[idx] ?? null);
  }, [history]);

  return (
    <>
      <Script
        src="https://player.twitch.tv/js/embed/v1.js"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onLoad={() => setScriptReady(true)}
      />
      <div className="bg-[color:var(--bg)]">
        <div className="mx-auto grid max-w-[1800px] gap-4 px-4 py-4 md:px-8 md:py-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          {/* Left column: player + stats. Right column: chat. Stack on mobile. */}
          <div className="flex flex-col gap-4">
            <section
              aria-label={`${displayName} live stream`}
              className="relative overflow-hidden rounded-xl border border-[color:var(--rule)] bg-black ring-1 ring-inset"
              style={{
                ["--tw-ring-color" as string]: `${accent}66`,
                aspectRatio: "16 / 9",
              }}
            >
              <div id={containerId} className="absolute inset-0 h-full w-full" />
              {/* Health + reload pinned to the player corner so it's always glanceable. */}
              <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
                <HealthPill health={health} live={isLive} />
              </div>
              <button
                type="button"
                onClick={reload}
                aria-label="Reload player"
                className="pointer-events-auto absolute right-3 top-3 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-white/20 bg-black/55 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/75 hover:text-white"
              >
                <RotateCcw size={13} />
              </button>
              {error ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center text-[12px] text-[color:var(--ink-dim)]">
                  {error}
                </div>
              ) : null}
            </section>

            <StatsGrid
              stats={stats}
              downloadKbps={downloadBitrateKbps}
              bandwidthKbps={bandwidthEstimateKbps}
              history={history}
              fpsTrend={fpsTrend}
              accent={accent}
              chatPerMin={chatPerMin}
              chatAvgPerMin={chatAvgPerMin}
              chatRateHistory={chatRateHistory}
              currentViewers={currentViewers}
              avgViewers={avgViewers}
              viewerHistory={viewerHistory}
            />
          </div>

          <div className="lg:h-[calc(100vh-200px)] lg:min-h-[520px]">
            {userId ? (
              <TwitchChat
                login={login}
                userId={userId}
                accent={accent}
                displayName={displayName}
                avatarUrl={avatarUrl}
                isCore
                compact
                className="h-full"
                onMessage={handleChatMessage}
              />
            ) : (
              <div className="flex h-full min-h-[520px] items-center justify-center rounded-xl border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] p-8 text-center">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
                  Twitch credentials missing — chat unavailable
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function HealthPill({
  health,
  live,
}: {
  health: {
    label: string;
    tone: "good" | "warn" | "bad" | "neutral";
    explain: string;
  };
  live: boolean | null;
}) {
  const palette: Record<string, { bg: string; text: string; border: string }> = {
    good: { bg: "rgba(16,185,129,0.18)", text: "#10b981", border: "rgba(16,185,129,0.55)" },
    warn: { bg: "rgba(234,179,8,0.18)", text: "#facc15", border: "rgba(234,179,8,0.55)" },
    bad: { bg: "rgba(239,68,68,0.18)", text: "#fb7185", border: "rgba(239,68,68,0.55)" },
    neutral: { bg: "rgba(255,255,255,0.08)", text: "#e5e7eb", border: "rgba(255,255,255,0.25)" },
  };
  const tone = live === false ? "neutral" : health.tone;
  const label = live === false ? "Offline" : health.label;
  const c = palette[tone]!;
  return (
    <span
      role="status"
      title={live === false ? "Channel is offline" : health.explain}
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] backdrop-blur-sm"
      style={{ background: c.bg, color: c.text, borderColor: c.border }}
    >
      {live === false ? <WifiOff size={10} /> : <Wifi size={10} />}
      {label}
    </span>
  );
}

function StatsGrid({
  stats,
  downloadKbps,
  bandwidthKbps,
  history,
  fpsTrend,
  accent,
  chatPerMin,
  chatAvgPerMin,
  chatRateHistory,
  currentViewers,
  avgViewers,
  viewerHistory,
}: {
  stats: Stats;
  downloadKbps: number | null;
  bandwidthKbps: number | null;
  history: Array<{ ts: number; rate: number }>;
  fpsTrend: number[];
  accent: string;
  chatPerMin: number;
  chatAvgPerMin: number;
  chatRateHistory: number[];
  currentViewers: number | null;
  avgViewers: number | null;
  viewerHistory: number[];
}) {
  // Every card uses the same chrome: same min-height, same icon size,
  // same value/sub typography, same optional faded sparkline painted in
  // the background. Cards without a time-series get the chrome only.
  const downloadPoints = history.map((h) => h.rate);
  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      <StatCard
        icon={<Gauge size={12} />}
        label="Download bitrate"
        value={downloadKbps != null ? downloadKbps.toLocaleString("en-US") : "—"}
        unit={downloadKbps != null ? "kbps" : undefined}
        sub="current segment"
        background={downloadPoints}
        accent={accent}
      />
      <StatCard
        icon={<Wifi size={12} />}
        label="Bandwidth est."
        value={bandwidthKbps != null ? bandwidthKbps.toLocaleString("en-US") : "—"}
        unit={bandwidthKbps != null ? "kbps" : undefined}
        sub="rolling 90th %"
        background={downloadPoints}
        accent={accent}
      />
      <StatCard
        icon={<Activity size={12} />}
        label="FPS"
        value={stats.fps != null ? Math.round(stats.fps).toString() : "—"}
        sub={
          stats.skippedFrames != null
            ? `${stats.skippedFrames.toLocaleString("en-US")} dropped`
            : "frames per second"
        }
        background={fpsTrend}
        accent={accent}
      />
      <StatCard
        icon={<Radio size={12} />}
        label="Latency"
        value={fmtSeconds(stats.hlsLatencyBroadcaster)}
        sub="to broadcaster"
      />
      <StatCard
        icon={<Gauge size={12} />}
        label="Buffer"
        value={fmtSeconds(stats.bufferSize)}
        sub="ahead of playhead"
      />
      <StatCard
        icon={<Eye size={12} />}
        label="Viewers"
        value={currentViewers != null ? currentViewers.toLocaleString("en-US") : "—"}
        sub={avgViewers != null ? `${avgViewers.toLocaleString("en-US")} avg` : "live count"}
        background={viewerHistory}
        accent={accent}
      />
      <StatCard
        icon={<MessageSquare size={12} />}
        label="Chats / min"
        value={chatPerMin.toLocaleString("en-US")}
        sub={
          chatAvgPerMin > 0
            ? `${chatAvgPerMin.toLocaleString("en-US")} avg`
            : "last 60s"
        }
        background={chatRateHistory}
        accent={accent}
      />
      <StatCard
        icon={<Activity size={12} />}
        label="Resolution"
        value={stats.videoResolution ?? "—"}
        sub="max from streamer"
      />
    </section>
  );
}

function StatCard({
  icon,
  label,
  value,
  unit,
  sub,
  background,
  accent,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  /** Small unit (e.g. "kbps") shown to the right of the value. */
  unit?: string;
  sub?: string;
  /** Time-series painted faintly behind the number. Optional. */
  background?: number[];
  accent?: string;
}) {
  return (
    <div className="relative flex h-full min-h-[108px] flex-col overflow-hidden rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-3">
      {background && background.length > 1 && accent ? (
        <BackgroundChart points={background} accent={accent} />
      ) : null}
      <div
        className="relative z-10 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[color:var(--ink)]"
        style={{ textShadow: "0 1px 4px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.65)" }}
      >
        {icon ?? null}
        <span className="truncate">{label}</span>
      </div>
      <div className="relative z-10 mt-auto flex items-baseline gap-1.5">
        <p
          className="text-[24px] font-bold tabular-nums leading-none text-[color:var(--ink)]"
          style={{ textShadow: "0 1px 6px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.65)" }}
        >
          {value}
        </p>
        {unit ? (
          <span
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink)]"
            style={{ textShadow: "0 1px 4px rgba(0,0,0,0.85)" }}
          >
            {unit}
          </span>
        ) : null}
      </div>
      {sub ? (
        <p
          className="relative z-10 mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)]"
          style={{ textShadow: "0 1px 4px rgba(0,0,0,0.85)" }}
        >
          {sub}
        </p>
      ) : null}
    </div>
  );
}

/** Glow-y full-bleed line chart painted behind the card content. Uses
 *  a saturated gradient fill, a doubled-up stroke (one wide+blurred for
 *  the glow, one crisp on top), and stays low enough opacity that the
 *  number on top still reads. */
function BackgroundChart({ points, accent }: { points: number[]; accent: string }) {
  const W = 100;
  const H = 100;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const x = (i: number) => (W * i) / (points.length - 1);
  const y = (v: number) => H - ((v - min) / range) * (H - 4) - 2;
  const linePath = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");
  const fillPath = `${linePath} L ${W} ${H} L 0 ${H} Z`;
  const id = Math.abs(hashString(accent + points.length)).toString(36);
  const gradientId = `bg-grad-${id}`;
  const glowId = `bg-glow-${id}`;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
      style={{ filter: `drop-shadow(0 0 6px ${accent}66)` }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity={0.85} />
          <stop offset="100%" stopColor={accent} stopOpacity={0} />
        </linearGradient>
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>
      {/* Translucent fill region under the line. */}
      <path d={fillPath} fill={`url(#${gradientId})`} opacity={0.55} />
      {/* Wide blurred stroke = the glow itself. */}
      <path
        d={linePath}
        fill="none"
        stroke={accent}
        strokeOpacity={0.9}
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        filter={`url(#${glowId})`}
      />
      {/* Crisp top line. */}
      <path
        d={linePath}
        fill="none"
        stroke={accent}
        strokeOpacity={1}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Twitch's modern embed player returns `playbackRate` already in kbps
 * (the same number you see in the player's own "Video Stats" overlay).
 * Older docs say bytes/sec, but in practice the SDK has shifted units
 * over the years and treating it as kbps directly matches what the
 * player UI shows. We just round — fractional kbps is noise.
 *
 * Defensive bound: if the value comes back implausibly small (<10
 * kbps for a live stream) AND we suspect the legacy bytes/sec encoding,
 * we fall back to the ×8/1000 conversion. This means switching SDK
 * versions doesn't break the display.
 */
function playbackRateToKbps(raw: number | null): number | null {
  if (raw == null || raw <= 0) return null;
  // Live HLS streams are normally 1,000–8,000 kbps. If the raw value
  // is in that band, it's already kbps.
  if (raw >= 100 && raw <= 50_000) return Math.round(raw);
  // If it's much larger, treat it as bytes/sec (legacy SDK shape).
  if (raw > 50_000) return Math.round((raw * 8) / 1000);
  // Anything < 100 looks like the SDK is reporting in Mbps.
  return Math.round(raw * 1000);
}

function fmtSeconds(s: number | null): string {
  if (s == null) return "—";
  if (s < 1) return `${Math.round(s * 1000)} ms`;
  return `${s.toFixed(1)} s`;
}
