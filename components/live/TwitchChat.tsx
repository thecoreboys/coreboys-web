"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  loadEmoteMap,
  startChatClient,
  type ChatMessage,
  type EmoteMap,
} from "@/lib/twitch-chat-client";
import { useTheme } from "@/components/providers/ThemeProvider";

const MESSAGE_LIMIT = 200;

type Status = "connecting" | "open" | "closed";

export type TwitchChatProps = {
  /** Twitch login (username) for the channel to join. */
  login: string;
  /** Twitch numeric user ID — needed for BTTV / 7TV channel emote sets. */
  userId: string;
  /** Optional accent color used for the user-name color fallback + header tint. */
  accent?: string;
  /** Optional channel display name shown in the header. */
  displayName?: string;
  /** Compact mode tightens padding/typography for the side-by-side /chat grid. */
  compact?: boolean;
  /** Twitch profile picture URL — rendered in the header next to the name. */
  avatarUrl?: string;
  /** Mark this column as a CORE member so the header gets a special badge. */
  isCore?: boolean;
  /** Optional close affordance (e.g. for non-CORE channels in the hub). */
  onClose?: () => void;
  className?: string;
};

/**
 * Read-only Twitch chat with BetterTTV + 7TV emote support. Connects
 * anonymously to Twitch IRC over WebSocket, so there's no Twitch login
 * required to view chat. To actually send messages users hit the
 * "Open in Twitch" link, which pops the official chat in a new window.
 */
export function TwitchChat({
  login,
  userId,
  accent = "#ff6a00",
  displayName,
  compact = false,
  avatarUrl,
  isCore = false,
  onClose,
  className = "",
}: TwitchChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<Status>("connecting");
  const [autoScroll, setAutoScroll] = useState(true);
  const [emoteMap, setEmoteMap] = useState<EmoteMap | null>(null);
  const [playerParent, setPlayerParent] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // Suppress scroll-handler reactions during programmatic scrolls so the
  // act of pinning to bottom doesn't accidentally flip autoScroll off
  // when subpixel rounding leaves us > threshold from the floor.
  const programmaticScrollRef = useRef(false);
  const { theme } = useTheme();

  // Twitch player iframe requires the hostname as `parent` and refuses
  // to render until it's set, so defer mounting until we have it.
  useEffect(() => {
    setPlayerParent(window.location.hostname);
  }, []);

  // Load emote sets once per (login, userId).
  useEffect(() => {
    let cancelled = false;
    loadEmoteMap(userId).then((map) => {
      if (!cancelled) setEmoteMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Open IRC once we have an emote map.
  useEffect(() => {
    if (!emoteMap) return;
    const dispose = startChatClient({
      channel: login,
      emoteMap,
      onStatus: setStatus,
      onMessage: (msg) => {
        setMessages((prev) => {
          const next = prev.length >= MESSAGE_LIMIT ? prev.slice(-MESSAGE_LIMIT + 1) : prev.slice();
          next.push(msg);
          return next;
        });
      },
    });
    return dispose;
  }, [login, emoteMap]);

  // Auto-scroll to newest unless the user has scrolled up.
  // Wraps in a programmatic-scroll guard so the resulting `scroll`
  // event doesn't trip the onScroll handler below.
  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollerRef.current;
    if (!el) return;
    programmaticScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
    // Two raf ticks to outlast the scroll event the assignment fires.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
    });
  }, [messages, autoScroll]);

  // Only react to USER scrolls. The threshold is generous (120px) so
  // small rounding bumps from images loading / emote layout shifts
  // don't kick the user out of follow-mode.
  const onScroll = () => {
    if (programmaticScrollRef.current) return;
    const el = scrollerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    setAutoScroll(distanceFromBottom < 120);
  };

  const popoutHref = useMemo(
    () =>
      `https://www.twitch.tv/popout/${login}/chat?popout=${typeof window !== "undefined" ? window.location.host : ""}`,
    [login],
  );

  const statusLabel = status === "open" ? "Connected" : status === "connecting" ? "Connecting…" : "Reconnecting…";
  const statusDot =
    status === "open" ? "bg-emerald-400" : status === "connecting" ? "bg-amber-400" : "bg-rose-400";

  return (
    <section
      aria-label={`${displayName ?? login} live Twitch chat`}
      className={`flex h-full flex-col overflow-hidden rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] ${className}`}
      style={{ boxShadow: `inset 0 0 0 1px ${accent}1a` }}
    >
      {/* Header */}
      <header
        className={`flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--rule)] ${compact ? "px-2.5 py-2" : "px-3 py-2.5"}`}
        style={{ background: `linear-gradient(180deg, ${accent}1f, transparent)` }}
      >
        <a
          href={`https://www.twitch.tv/${login}`}
          target="_blank"
          rel="noopener noreferrer"
          draggable={false}
          aria-label={`Watch ${displayName ?? login} on Twitch`}
          className="group/header -mx-1 -my-0.5 flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-[color:var(--bg)]/40 cursor-pointer"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              draggable={false}
              className="h-7 w-7 shrink-0 rounded-full ring-1 ring-inset transition-transform group-hover/header:scale-105"
              style={{ ["--tw-ring-color" as string]: accent }}
            />
          ) : (
            <span
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--bg)] text-[10px] font-bold uppercase"
              style={{ color: accent }}
            >
              {(displayName ?? login)[0]}
            </span>
          )}
          <span className="flex min-w-0 flex-col leading-tight">
            <span
              className={`truncate font-bold tracking-tight text-[color:var(--ink)] transition-colors group-hover/header:text-[color:var(--core)] ${compact ? "text-[12px]" : "text-[13px]"}`}
            >
              {displayName ?? login}
            </span>
            <span className="inline-flex items-center gap-1.5 truncate text-[10px] font-medium tracking-tight text-[color:var(--ink-dim)] transition-colors group-hover/header:text-[color:var(--ink)]">
              <span className={`inline-block h-1 w-1 rounded-full ${statusDot}`} aria-hidden />
              {statusLabel}
            </span>
          </span>
        </a>
        <div className="flex shrink-0 items-center gap-1.5">
          {!isCore ? (
            <span className="rounded border border-[color:var(--rule)] bg-[color:var(--bg)] px-1.5 py-0.5 text-[10px] font-medium tracking-tight text-[color:var(--ink-dim)]">
              Guest
            </span>
          ) : null}
          <a
            href={popoutHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] text-[color:var(--ink-dim)] transition-all hover:-translate-y-px hover:border-[color:var(--ink)] hover:bg-[color:var(--surface)] hover:text-[color:var(--ink)] hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.4)] active:translate-y-0"
            aria-label="Open in Twitch"
          >
            <ExternalLink size={12} />
          </a>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label={`Hide ${displayName ?? login}`}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] text-[color:var(--ink-dim)] transition-all hover:-translate-y-px hover:border-[color:var(--core)] hover:bg-[color:var(--core)]/10 hover:text-[color:var(--core)] hover:shadow-[0_4px_12px_-4px_rgba(255,106,0,0.4)] active:translate-y-0"
            >
              <span className="text-[15px] font-semibold leading-none">×</span>
            </button>
          ) : null}
        </div>
      </header>

      {/* Tiny live preview — muted, autoplay; offline shows Twitch's
          channel placeholder card. */}
      {playerParent ? (
        <div className="shrink-0 border-b border-[color:var(--rule)] bg-black">
          <iframe
            key={`${login}-${playerParent}`}
            src={`https://player.twitch.tv/?channel=${encodeURIComponent(login)}&parent=${encodeURIComponent(playerParent)}&muted=true&autoplay=true`}
            title={`${displayName ?? login} live stream`}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            className={`block w-full ${compact ? "h-[120px]" : "h-[160px]"}`}
          />
        </div>
      ) : null}

      {/* Messages */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        data-lenis-prevent
        className={`flex-1 overflow-y-auto overscroll-contain ${compact ? "px-3 py-2" : "px-4 py-3"}`}
        role="log"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
            {emoteMap ? "Waiting for chat…" : "Loading emotes…"}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {messages.map((m) => (
              <Message key={m.id} message={m} accent={accent} compact={compact} theme={theme} />
            ))}
          </ul>
        )}
      </div>

      {/* Resume auto-scroll prompt */}
      {!autoScroll ? (
        <button
          type="button"
          onClick={() => {
            setAutoScroll(true);
            const el = scrollerRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
          className="shrink-0 border-t border-[color:var(--rule)] bg-[color:var(--bg)] py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
        >
          Jump to latest ↓
        </button>
      ) : null}
    </section>
  );
}

function Message({
  message,
  accent,
  compact,
  theme,
}: {
  message: ChatMessage;
  accent: string;
  compact: boolean;
  theme: "dark" | "light";
}) {
  const color = readableColor(message.color || accent, theme);
  const sizeClass = compact ? "text-[12px] leading-snug" : "text-[13px] leading-snug";
  const emoteClass = compact ? "h-[20px]" : "h-[24px]";
  return (
    <li className={`break-words text-[color:var(--ink)] ${sizeClass}`}>
      <span
        className="font-semibold"
        style={{ color }}
      >
        {message.displayName}
      </span>
      <span className="text-[color:var(--ink-faint)]">: </span>
      {message.tokens.map((t, i) => {
        if (t.kind === "text") {
          // eslint-disable-next-line react/no-array-index-key
          return <span key={i}>{t.text}</span>;
        }
        return (
          // eslint-disable-next-line react/no-array-index-key
          <span key={i} className="group/emote relative inline-flex align-middle">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={t.url}
              alt={t.code}
              className={`inline-block ${emoteClass} -my-0.5 align-middle`}
              loading="lazy"
              decoding="async"
            />
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-[color:var(--rule-strong)] bg-[color:var(--bg)] px-2 py-1 text-[10px] font-medium text-[color:var(--ink)] opacity-0 shadow-lg transition-opacity duration-150 group-hover/emote:opacity-100"
            >
              {t.code}{" "}
              <span className="text-[color:var(--ink-faint)]">· {t.provider}</span>
            </span>
          </span>
        );
      })}
    </li>
  );
}

/**
 * Twitch lets users pick any hex color for their name. Some pick black
 * (illegible on dark mode), some pick near-white (illegible on light
 * mode). Pull the luminance into a safe band per theme so every name is
 * readable while preserving the user's chosen hue.
 */
function readableColor(hex: string, theme: "dark" | "light"): string {
  const m = /^#?([0-9a-f]{3,8})$/i.exec(hex.trim());
  if (!m) return theme === "dark" ? "#e5e7eb" : "#0a0a0a";
  let h = m[1]!;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6);
  if (h.length !== 6) return theme === "dark" ? "#e5e7eb" : "#0a0a0a";
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  // Convert to HSL.
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let hh = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) hh = ((g - b) / d) % 6;
    else if (max === g) hh = (b - r) / d + 2;
    else hh = (r - g) / d + 4;
    hh *= 60;
    if (hh < 0) hh += 360;
  }
  // Clamp lightness so dark hues never bottom out and light hues never
  // top out. Bands are deliberately wide to keep the user's hue intact.
  const minL = theme === "dark" ? 0.55 : 0.18;
  const maxL = theme === "dark" ? 0.85 : 0.5;
  const safeL = Math.min(maxL, Math.max(minL, l));
  // HSL → RGB.
  const c = (1 - Math.abs(2 * safeL - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const mAdj = safeL - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) [rp, gp, bp] = [c, x, 0];
  else if (hh < 120) [rp, gp, bp] = [x, c, 0];
  else if (hh < 180) [rp, gp, bp] = [0, c, x];
  else if (hh < 240) [rp, gp, bp] = [0, x, c];
  else if (hh < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  const to = (n: number) =>
    Math.round((n + mAdj) * 255).toString(16).padStart(2, "0");
  return `#${to(rp)}${to(gp)}${to(bp)}`;
}
