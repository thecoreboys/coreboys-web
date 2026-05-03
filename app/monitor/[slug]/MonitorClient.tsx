"use client";

import Script from "next/script";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Gauge, Radio, RotateCcw, Wifi, WifiOff } from "lucide-react";
import { TwitchChat } from "@/components/live/TwitchChat";

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
};

export function MonitorClient({
  slug,
  login,
  displayName,
  accent,
  userId,
}: MonitorClientProps) {
  const containerId = `tw-monitor-${slug}`;
  const [parent, setParent] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [history, setHistory] = useState<Array<{ ts: number; rate: number }>>([]);
  const [skippedTrend, setSkippedTrend] = useState<number[]>([]);
  const [isLive, setIsLive] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  // Derived health pill: combines buffer + broadcaster latency + the
  // recent skipped-frames delta to give the viewer a one-glance read.
  const health = useMemo(() => {
    const { bufferSize, hlsLatencyBroadcaster } = stats;
    const droppedDelta = (() => {
      if (skippedTrend.length < 2) return 0;
      return (skippedTrend.at(-1) ?? 0) - (skippedTrend.at(-2) ?? 0);
    })();
    if (bufferSize == null && hlsLatencyBroadcaster == null) {
      return { label: "Connecting", tone: "neutral" as const };
    }
    if (
      (bufferSize != null && bufferSize < 0.5) ||
      droppedDelta > 5 ||
      (hlsLatencyBroadcaster != null && hlsLatencyBroadcaster > 30)
    ) {
      return { label: "Unstable", tone: "bad" as const };
    }
    if (
      (bufferSize != null && bufferSize < 1) ||
      droppedDelta > 0 ||
      (hlsLatencyBroadcaster != null && hlsLatencyBroadcaster > 12)
    ) {
      return { label: "Watch", tone: "warn" as const };
    }
    return { label: "Healthy", tone: "good" as const };
  }, [stats, skippedTrend]);

  // Bandwidth estimate — average of the last few seconds of
  // playbackRate (smooth out per-segment download spikes).
  const bandwidthEstimate = useMemo(() => {
    if (history.length === 0) return null;
    const slice = history.slice(-10);
    const sum = slice.reduce((a, b) => a + b.rate, 0);
    return sum / slice.length;
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
              <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2">
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
              bandwidth={bandwidthEstimate}
              history={history}
              accent={accent}
            />
          </div>

          <div className="lg:h-[calc(100vh-200px)] lg:min-h-[520px]">
            {userId ? (
              <TwitchChat
                login={login}
                userId={userId}
                accent={accent}
                displayName={displayName}
                avatarUrl={undefined}
                isCore
                compact
                className="h-full"
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
  health: { label: string; tone: "good" | "warn" | "bad" | "neutral" };
  live: boolean | null;
}) {
  const palette: Record<string, { bg: string; text: string; border: string }> = {
    good: { bg: "rgba(16,185,129,0.18)", text: "#10b981", border: "rgba(16,185,129,0.55)" },
    warn: { bg: "rgba(234,179,8,0.18)", text: "#facc15", border: "rgba(234,179,8,0.55)" },
    bad: { bg: "rgba(239,68,68,0.18)", text: "#fb7185", border: "rgba(239,68,68,0.55)" },
    neutral: { bg: "rgba(255,255,255,0.08)", text: "#e5e7eb", border: "rgba(255,255,255,0.25)" },
  };
  const c = palette[health.tone]!;
  return (
    <span
      className="pointer-events-none inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] backdrop-blur-sm"
      style={{ background: c.bg, color: c.text, borderColor: c.border }}
    >
      {live === false ? <WifiOff size={10} /> : <Wifi size={10} />}
      {live === false ? "Offline" : health.label}
    </span>
  );
}

function StatsGrid({
  stats,
  bandwidth,
  history,
  accent,
}: {
  stats: Stats;
  bandwidth: number | null;
  history: Array<{ ts: number; rate: number }>;
  accent: string;
}) {
  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      <StatCard
        icon={<Gauge size={12} />}
        label="Bitrate"
        value={fmtBitrate(stats.playbackRate)}
        sub={bandwidth != null ? `${fmtBitrate(bandwidth)} avg` : undefined}
        sparkline={
          history.length > 1 ? (
            <Sparkline points={history.map((h) => h.rate)} accent={accent} />
          ) : undefined
        }
      />
      <StatCard
        icon={<Activity size={12} />}
        label="FPS"
        value={stats.fps != null ? Math.round(stats.fps).toString() : "—"}
        sub={stats.skippedFrames != null ? `${stats.skippedFrames.toLocaleString("en-US")} dropped` : undefined}
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
        label="Resolution"
        value={stats.videoResolution ?? "—"}
        sub={stats.displayResolution && stats.displayResolution !== stats.videoResolution
          ? `→ ${stats.displayResolution}`
          : undefined}
      />
      <StatCard
        label="Codec"
        value={stats.codecs ?? "—"}
        sub="video / audio"
        valueClass="text-[12px] tracking-tight"
      />
    </section>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  sparkline,
  valueClass,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  sparkline?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-3">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
        {icon ?? null}
        {label}
      </div>
      <p
        className={`mt-1.5 font-bold tabular-nums leading-none text-[color:var(--ink)] ${
          valueClass ?? "text-[20px]"
        }`}
      >
        {value}
      </p>
      {sub ? (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
          {sub}
        </p>
      ) : null}
      {sparkline ? <div className="mt-2">{sparkline}</div> : null}
    </div>
  );
}

function Sparkline({ points, accent }: { points: number[]; accent: string }) {
  if (points.length < 2) return null;
  const W = 120;
  const H = 22;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const x = (i: number) => (W * i) / (points.length - 1);
  const y = (v: number) => H - ((v - min) / range) * (H - 2) - 1;
  const d = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="block">
      <path d={d} fill="none" stroke={accent} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function fmtBitrate(bps: number | null): string {
  if (bps == null || bps <= 0) return "—";
  // playbackRate is bytes/sec; convert to bits/sec then to Mbps/Kbps.
  const bits = bps * 8;
  if (bits >= 1_000_000) return `${(bits / 1_000_000).toFixed(1)} Mbps`;
  if (bits >= 1_000) return `${Math.round(bits / 1_000)} Kbps`;
  return `${Math.round(bits)} bps`;
}

function fmtSeconds(s: number | null): string {
  if (s == null) return "—";
  if (s < 1) return `${Math.round(s * 1000)} ms`;
  return `${s.toFixed(1)} s`;
}
