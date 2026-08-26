"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowDown, LinkExternal01, XClose } from "@untitledui/icons";
import {
  loadEmoteMap,
  startChatClient,
  type ChatMessage,
  type ChatConnectionStatus,
  type EmoteMap,
  type RaidEvent,
} from "@/lib/twitch-chat-client";
import { Badge, BadgeWithDot } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useTwitchBadges } from "@/hooks/useTwitchBadges";
import { formatHandleDisplay } from "@/lib/watch/display-label";

const MESSAGE_LIMIT = 200;

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
  /** When set, the chat header shows a single "Monitor" link to
   *  /monitor/<slug> instead of the Open-in-Twitch + close buttons.
   *  Used by the chat hub for CORE channels — guests don't have a
   *  monitor route and so still get the original buttons. */
  monitorSlug?: string;
  /** Multiplier applied to message + emote sizing. 1.0 = default. */
  textScale?: number;
  /** Fires whenever a new chat message arrives. Used by the monitor
   *  page to derive a chat-per-minute rate without running a second
   *  IRC connection. */
  onMessage?: (message: ChatMessage) => void;
  onReply?: (message: ChatMessage, channelLogin: string) => void;
  onRaid?: (raid: RaidEvent) => void;
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
  textScale = 1,
  onMessage,
  onReply,
  onRaid,
  monitorSlug,
  className = "",
}: TwitchChatProps) {
  // Latest onMessage in a ref so the IRC effect doesn't have to depend
  // on it (would otherwise rewire the WebSocket on every render).
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);
  const baseFontPx = compact ? 12 : 13;
  const baseEmotePx = compact ? 20 : 24;
  const fontPx = baseFontPx * textScale;
  const emotePx = baseEmotePx * textScale;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatConnectionStatus>("connecting");
  const [autoScroll, setAutoScroll] = useState(true);
  const [emoteMap, setEmoteMap] = useState<EmoteMap | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // Suppress scroll-handler reactions during programmatic scrolls so the
  // act of pinning to bottom doesn't accidentally flip autoScroll off
  // when subpixel rounding leaves us > threshold from the floor.
  const programmaticScrollRef = useRef(false);
  const { resolvedTheme: theme } = useTheme();
  const { urlFor } = useTwitchBadges(userId);

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
      onRaid,
      onMessage: (msg) => {
        onMessageRef.current?.(msg);
        setMessages((prev) => {
          const next = prev.length >= MESSAGE_LIMIT ? prev.slice(-MESSAGE_LIMIT + 1) : prev.slice();
          next.push(msg);
          return next;
        });
      },
    });
    return dispose;
  }, [login, emoteMap, onRaid]);

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

  const statusLabel = status === "open" ? "Connected" : status === "paused" ? "Paused" : status === "connecting" ? "Connecting…" : "Reconnecting…";
  const statusColor: "success" | "warning" | "error" | "gray" =
    status === "open" ? "success" : status === "paused" ? "gray" : status === "connecting" ? "warning" : "error";
  const channelName = displayName ?? formatHandleDisplay(login);

  return (
    <section
      aria-label={`${channelName} live Twitch chat`}
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
          aria-label={`Watch ${channelName} on Twitch`}
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
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--bg)] text-xs font-bold uppercase"
              style={{ color: accent }}
            >
              {channelName[0]}
            </span>
          )}
          <span className="flex min-w-0 flex-col leading-tight">
            <span
              className={`truncate font-bold tracking-tight text-[color:var(--ink)] transition-colors group-hover/header:text-[color:var(--core)] ${compact ? "text-xs" : "text-sm"}`}
            >
              {channelName}
            </span>
            <BadgeWithDot type="pill-color" size="sm" color={statusColor} className="-ml-0.5 mt-0.5 w-max">
              {statusLabel}
            </BadgeWithDot>
          </span>
        </a>
        <div className="flex shrink-0 items-center gap-1.5">
          {!isCore ? (
            <Badge type="pill-color" size="sm" color="gray">
              Guest
            </Badge>
          ) : null}
          {monitorSlug ? (
            // Single Monitor pill — replaces the open-in-Twitch + close
            // buttons for CORE channels in the hub. Guests fall through
            // to the original buttons since they have no monitor route.
            <Button
              href={`/monitor/${monitorSlug}` as `/monitor/${string}`}
              size="xs"
              color="secondary"
              iconLeading={Activity}
              aria-label={`Open monitor for ${channelName}`}
            >
              Monitor
            </Button>
          ) : (
            <>
              <ButtonUtility
                href={popoutHref}
                target="_blank"
                rel="noopener noreferrer"
                size="xs"
                color="secondary"
                tooltip="Open in Twitch"
                aria-label="Open in Twitch"
                icon={LinkExternal01}
              />
              {onClose ? (
                <ButtonUtility
                  size="xs"
                  color="secondary"
                  onClick={onClose}
                  tooltip={`Hide ${channelName}`}
                  aria-label={`Hide ${channelName}`}
                  icon={XClose}
                />
              ) : null}
            </>
          )}
        </div>
      </header>

      {/* Messages — overflow-x-hidden so long usernames / unbreakable
          tokens never push a horizontal scrollbar. Long content wraps
          via overflow-wrap on the message <li>. */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        data-lenis-prevent
        className={`flex-1 overflow-x-hidden overflow-y-auto overscroll-contain ${compact ? "px-3 py-2" : "px-4 py-3"}`}
        role="log"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="text-xs text-quaternary">
            {emoteMap ? "Waiting for chat…" : "Loading emotes…"}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {messages.map((m) => (
              <Message
                key={m.id}
                message={m}
                accent={accent}
                theme={theme}
                fontPx={fontPx}
                emotePx={emotePx}
                badgeUrl={urlFor}
                onReply={onReply ? () => onReply(m, login) : undefined}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Resume auto-scroll prompt */}
      {!autoScroll ? (
        <div className="shrink-0 border-t border-[color:var(--rule)] bg-[color:var(--bg)] p-2">
          <Button
            size="sm"
            color="primary"
            className="w-full"
            iconTrailing={ArrowDown}
            onPress={() => {
              setAutoScroll(true);
              const el = scrollerRef.current;
              if (el) el.scrollTop = el.scrollHeight;
            }}
          >
            Jump to latest
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function Message({
  message,
  accent,
  theme,
  fontPx,
  emotePx,
  badgeUrl,
  onReply,
}: {
  message: ChatMessage;
  accent: string;
  theme: "dark" | "light";
  fontPx: number;
  emotePx: number;
  badgeUrl: (setId: string, version: string) => string | null;
  onReply?: () => void;
}) {
  const color = readableColor(message.color || accent, theme);
  const time = new Date(message.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const mention = message.raw.includes("@");
  return (
    <li
      className={`rounded-xl px-1.5 py-1 leading-snug text-[color:var(--ink)] ${onReply ? "cursor-pointer hover:bg-[color:var(--bg)]/60" : ""} ${mention ? "bg-[color:var(--bg)]/35" : ""}`}
      onClick={onReply}
      title={onReply ? `Reply to ${message.displayName}` : undefined}
      style={{
        fontSize: `${fontPx}px`,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
      }}
    >
      <span className="mr-1.5 font-mono text-[0.85em] tabular-nums text-[color:var(--ink-faint)]">{time}</span>
      {message.badges.length > 0 ? (
        <span className="mr-1 inline-flex items-center gap-0.5 align-middle">
          {message.badges.slice(0, 4).map((b) => {
            const src = badgeUrl(b.setId, b.version);
            if (!src) return null;
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${b.setId}-${b.version}`}
                src={src}
                alt={b.setId}
                title={b.setId.replace(/-/g, " ")}
                className="inline-block align-middle"
                style={{ height: `${Math.round(fontPx * 1.05)}px`, width: `${Math.round(fontPx * 1.05)}px` }}
              />
            );
          })}
        </span>
      ) : null}
      <span className="font-semibold" style={{ color }}>
        {message.displayName}
      </span>
      <span className="text-[color:var(--ink-faint)]"> · </span>
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
              className="inline-block -my-0.5 align-middle"
              style={{ height: `${emotePx}px` }}
              loading="lazy"
              decoding="async"
            />

            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-[color:var(--rule-strong)] bg-[color:var(--bg)] px-2 py-1 text-xs font-medium text-[color:var(--ink)] opacity-0 shadow-lg transition-opacity duration-150 group-hover/emote:opacity-100"
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
