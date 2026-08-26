"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ArrowDown, CornerUpLeft, MessageChatCircle } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { BadgeWithDot } from "@/components/base/badges/badges";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { ChannelLogo } from "@/components/live/ChannelLogo";
import type { PassportChatIdentity } from "@/lib/passport/chat-identity";
import { useTheme } from "@/components/providers/ThemeProvider";
import type { ChatSessionChannel } from "@/components/live/ChatSession";
import { useTwitchBadgesByChannel } from "@/hooks/useTwitchBadges";
import type { ChatConnectionStatus, ChatMessage, ChatToken } from "@/lib/twitch-chat-client";
import type { TwitchChatBadgeDetail } from "@/lib/twitch";

export type ChatRoleFilter = "moderator" | "vip" | "subscriber";

export type ChatFeedFilters = {
  channelLogins?: string[];
  query?: string;
  mentionsOnly?: boolean;
  roles?: ChatRoleFilter[];
  hideBots?: boolean;
  emotesOnly?: boolean;
  mutedUsers?: string[];
  mutedTerms?: string[];
};

export const EMPTY_CHAT_FILTERS: ChatFeedFilters = {};

/**
 * Chat sessions retain a larger provider-side buffer, but the feed starts
 * with a familiar, focused amount of history. More can be revealed without
 * ever adding the whole room history to the DOM at once.
 */
export const CHAT_HISTORY_PAGE_SIZE = 240;
export const CHAT_VIRTUAL_OVERSCAN_PX = 680;
export const CHAT_ESTIMATED_ROW_HEIGHT = 34;
const CHAT_ROW_GAP = 2;

export type VirtualChatMetrics = {
  offsets: number[];
  totalHeight: number;
};

export type VirtualChatWindow = {
  start: number;
  end: number;
};

export function chatMessageKey(message: Pick<ChatMessage, "channelLogin" | "id">): string {
  return `${message.channelLogin}:${message.id}`;
}

/** Returns the first index in the current tail/history window. */
export function getChatHistoryStart(total: number, historyWindowSize: number): number {
  return Math.max(0, total - Math.max(CHAT_HISTORY_PAGE_SIZE, historyWindowSize));
}

/**
 * Build a light prefix table for a virtualized message list. The table is
 * deliberately data-only: it lets the React tree render only the rows near
 * the viewport while still preserving ordinary native scrolling semantics.
 */
export function buildVirtualChatMetrics(
  messages: readonly Pick<ChatMessage, "channelLogin" | "id">[],
  measuredHeights: ReadonlyMap<string, number>,
  estimatedRowHeight = CHAT_ESTIMATED_ROW_HEIGHT,
): VirtualChatMetrics {
  const offsets = new Array<number>(messages.length);
  let cursor = 0;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message) continue;
    offsets[index] = cursor;
    cursor += Math.max(1, measuredHeights.get(chatMessageKey(message)) ?? estimatedRowHeight);
  }
  return { offsets, totalHeight: cursor };
}

function firstOffsetAtOrAfter(offsets: readonly number[], target: number): number {
  let lower = 0;
  let upper = offsets.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if ((offsets[middle] ?? 0) < target) lower = middle + 1;
    else upper = middle;
  }
  return lower;
}

/**
 * Finds the small, buffered range that should actually be mounted. It stays
 * bounded even after a user has revealed every earlier message in a room.
 */
export function getVirtualChatWindow(
  metrics: VirtualChatMetrics,
  scrollTop: number,
  viewportHeight: number,
  overscan = CHAT_VIRTUAL_OVERSCAN_PX,
): VirtualChatWindow {
  const count = metrics.offsets.length;
  if (count === 0) return { start: 0, end: 0 };

  const startTarget = Math.max(0, scrollTop - overscan);
  const endTarget = Math.max(startTarget, scrollTop + Math.max(1, viewportHeight) + overscan);
  const start = Math.max(0, firstOffsetAtOrAfter(metrics.offsets, startTarget) - 1);
  const end = Math.min(count, Math.max(start + 1, firstOffsetAtOrAfter(metrics.offsets, endTarget) + 1));
  return { start, end };
}

const normalize = (value: string) => value.trim().toLowerCase();

function hasRole(message: ChatMessage, role: ChatRoleFilter): boolean {
  const sets = new Set(message.badges.map((badge) => badge.setId.toLowerCase()));
  if (role === "moderator") return sets.has("moderator") || sets.has("broadcaster") || sets.has("staff");
  if (role === "vip") return sets.has("vip");
  return sets.has("subscriber") || sets.has("founder");
}

function isLikelyBot(message: ChatMessage): boolean {
  const login = normalize(message.user);
  return login.endsWith("bot") || login === "streamelements" || login === "nightbot";
}

function onlyEmotes(tokens: ChatToken[]): boolean {
  return tokens.every((token) => token.kind === "emote" || token.text.trim() === "");
}

export function filterChatMessages(
  messages: ChatMessage[],
  filters: ChatFeedFilters = EMPTY_CHAT_FILTERS,
): ChatMessage[] {
  const channelSet = filters.channelLogins !== undefined
    ? new Set(filters.channelLogins.map(normalize))
    : null;
  const query = normalize(filters.query ?? "");
  const mutedUsers = new Set((filters.mutedUsers ?? []).map(normalize));
  const mutedTerms = (filters.mutedTerms ?? []).map(normalize).filter(Boolean);
  const roles = filters.roles ?? [];

  return messages.filter((message) => {
    const body = normalize(message.raw);
    if (channelSet && !channelSet.has(normalize(message.channelLogin))) return false;
    if (query && !body.includes(query) && !normalize(message.displayName).includes(query)) return false;
    if (filters.mentionsOnly && !message.raw.includes("@") && !message.reply) return false;
    if (roles.length > 0 && !roles.some((role) => hasRole(message, role))) return false;
    if (filters.hideBots && isLikelyBot(message)) return false;
    if (filters.emotesOnly && !onlyEmotes(message.tokens)) return false;
    if (mutedUsers.has(normalize(message.user))) return false;
    if (mutedTerms.some((term) => body.includes(term))) return false;
    return true;
  });
}

export function ChatFeed({
  messages,
  channels,
  status,
  title,
  merged = false,
  filters = EMPTY_CHAT_FILTERS,
  textScale = 1,
  showTimestamps = false,
  className = "",
  activity = 0,
  onReply,
  onFocusChannel,
  headerActions,
  viewerLogin,
  viewerIdentity,
  passportIdentities = {},
}: {
  messages: ChatMessage[];
  channels: ChatSessionChannel[];
  status?: ChatConnectionStatus;
  title?: string;
  merged?: boolean;
  filters?: ChatFeedFilters;
  textScale?: number;
  showTimestamps?: boolean;
  className?: string;
  activity?: number;
  onReply?: (message: ChatMessage) => void;
  onFocusChannel?: (channelLogin: string) => void;
  headerActions?: React.ReactNode;
  viewerLogin?: string | null;
  viewerIdentity?: PassportChatIdentity | null;
  passportIdentities?: Record<string, PassportChatIdentity>;
}) {
  const [autoScroll, setAutoScroll] = useState(true);
  // Preserve the existing progressive-history behavior, while virtualizing
  // the currently available history. Repeatedly choosing "Show earlier" no
  // longer turns the feed into a 1,000+ row DOM tree.
  const [historyWindowSize, setHistoryWindowSize] = useState(CHAT_HISTORY_PAGE_SIZE);
  const [metricVersion, setMetricVersion] = useState(0);
  const [scrollState, setScrollState] = useState({ top: 0, viewportHeight: 1 });
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const rowHeightsRef = useRef(new Map<string, number>());
  const metricsRef = useRef<VirtualChatMetrics>({ offsets: [], totalHeight: 0 });
  const programmaticScrollRef = useRef(false);
  const programmaticScrollFrameRef = useRef<number | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const metricFrameRef = useRef<number | null>(null);
  const autoScrollRef = useRef(autoScroll);
  const measurementSignature = `${textScale}:${showTimestamps}:${merged}:${Boolean(onReply)}`;
  const previousMeasurementSignatureRef = useRef(measurementSignature);
  const historyControlHeightRef = useRef(0);
  const pendingPrependRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const { resolvedTheme: theme } = useTheme();
  const { detailFor: badgeDetailFor } = useTwitchBadgesByChannel(channels);
  const channelByLogin = useMemo(
    () => new Map(channels.map((channel) => [normalize(channel.login), channel])),
    [channels],
  );
  const visibleMessages = useMemo(
    () => filterChatMessages(messages, filters),
    [messages, filters],
  );
  const historyStart = getChatHistoryStart(visibleMessages.length, historyWindowSize);
  const historyMessages = useMemo(
    () => visibleMessages.slice(historyStart),
    [historyStart, visibleMessages],
  );
  const virtualMetrics = useMemo(
    () => buildVirtualChatMetrics(historyMessages, rowHeightsRef.current),
    [historyMessages, metricVersion],
  );
  metricsRef.current = virtualMetrics;
  const virtualWindow = useMemo(
    () => getVirtualChatWindow(virtualMetrics, scrollState.top, scrollState.viewportHeight),
    [scrollState.top, scrollState.viewportHeight, virtualMetrics],
  );
  const virtualMessages = useMemo(
    () => historyMessages.slice(virtualWindow.start, virtualWindow.end),
    [historyMessages, virtualWindow.end, virtualWindow.start],
  );
  const hasEarlierMessages = historyStart > 0;
  historyControlHeightRef.current = hasEarlierMessages ? 40 : 0;

  const scheduleScrollState = useCallback(() => {
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const nextTop = Math.max(0, scroller.scrollTop - historyControlHeightRef.current);
      const nextViewportHeight = Math.max(1, scroller.clientHeight);
      setScrollState((current) => (
        Math.abs(current.top - nextTop) < 1 && current.viewportHeight === nextViewportHeight
          ? current
          : { top: nextTop, viewportHeight: nextViewportHeight }
      ));

      if (!programmaticScrollRef.current) {
        const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
        const nextAutoScroll = distance < 120;
        setAutoScroll((current) => current === nextAutoScroll ? current : nextAutoScroll);
      }
    });
  }, []);

  const markProgrammaticScroll = useCallback(() => {
    programmaticScrollRef.current = true;
    if (programmaticScrollFrameRef.current !== null) {
      cancelAnimationFrame(programmaticScrollFrameRef.current);
    }
    programmaticScrollFrameRef.current = requestAnimationFrame(() => {
      programmaticScrollFrameRef.current = requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
        programmaticScrollFrameRef.current = null;
      });
    });
  }, []);

  const scheduleMetricRebuild = useCallback(() => {
    // A ResizeObserver can fire once for each visible emote/badge row. Batch
    // those measurements into one lightweight prefix-table update per frame.
    if (metricFrameRef.current !== null) return;
    metricFrameRef.current = requestAnimationFrame(() => {
      metricFrameRef.current = null;
      setMetricVersion((current) => current + 1);
      scheduleScrollState();
    });
  }, [scheduleScrollState]);

  const scrollToLatest = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    markProgrammaticScroll();
    scroller.scrollTop = scroller.scrollHeight;
    scheduleScrollState();
  }, [markProgrammaticScroll, scheduleScrollState]);

  const onRowHeight = useCallback((key: string, index: number, measuredHeight: number) => {
    const nextHeight = Math.max(CHAT_ROW_GAP + 1, Math.ceil(measuredHeight) + CHAT_ROW_GAP);
    const previousHeight = rowHeightsRef.current.get(key) ?? CHAT_ESTIMATED_ROW_HEIGHT;
    if (Math.abs(nextHeight - previousHeight) < 1) return;

    const scroller = scrollerRef.current;
    const priorOffset = metricsRef.current.offsets[index] ?? index * CHAT_ESTIMATED_ROW_HEIGHT;
    rowHeightsRef.current.set(key, nextHeight);

    // Keep the message under the reader's eye in place if a row above it
    // wraps, loads an emote, or receives a badge image.
    const visibleTop = scroller
      ? Math.max(0, scroller.scrollTop - historyControlHeightRef.current)
      : 0;
    if (scroller && !autoScrollRef.current && priorOffset < visibleTop) {
      markProgrammaticScroll();
      scroller.scrollTop += nextHeight - previousHeight;
    }
    scheduleMetricRebuild();
  }, [markProgrammaticScroll, scheduleMetricRebuild]);

  useEffect(() => {
    autoScrollRef.current = autoScroll;
  }, [autoScroll]);

  useEffect(() => {
    scheduleScrollState();
    const scroller = scrollerRef.current;
    if (!scroller || typeof ResizeObserver === "undefined") return undefined;
    let width = scroller.clientWidth;
    const observer = new ResizeObserver(() => {
      if (Math.abs(scroller.clientWidth - width) > 1) {
        width = scroller.clientWidth;
        // Wrapped chat rows need fresh measurements after the dock changes
        // width. The virtualizer immediately falls back to its safe estimate.
        rowHeightsRef.current.clear();
        scheduleMetricRebuild();
      }
      scheduleScrollState();
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [scheduleMetricRebuild, scheduleScrollState]);

  useLayoutEffect(() => {
    if (previousMeasurementSignatureRef.current === measurementSignature) return;
    previousMeasurementSignatureRef.current = measurementSignature;
    rowHeightsRef.current.clear();
    scheduleMetricRebuild();
  }, [measurementSignature, scheduleMetricRebuild]);

  useEffect(() => {
    const maxCachedRows = Math.max(CHAT_HISTORY_PAGE_SIZE * 2, visibleMessages.length + CHAT_HISTORY_PAGE_SIZE);
    if (rowHeightsRef.current.size <= maxCachedRows) return;
    const currentKeys = new Set(visibleMessages.map(chatMessageKey));
    for (const key of rowHeightsRef.current.keys()) {
      if (!currentKeys.has(key)) rowHeightsRef.current.delete(key);
    }
  }, [visibleMessages]);

  useLayoutEffect(() => {
    const pending = pendingPrependRef.current;
    if (!pending) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    pendingPrependRef.current = null;
    markProgrammaticScroll();
    scroller.scrollTop = Math.max(0, scroller.scrollHeight - (pending.scrollHeight - pending.scrollTop));
    scheduleScrollState();
  }, [historyStart, markProgrammaticScroll, scheduleScrollState, virtualMetrics.totalHeight]);

  useLayoutEffect(() => {
    if (!autoScroll) return;
    scrollToLatest();
  }, [autoScroll, historyMessages, scrollToLatest, virtualMetrics.totalHeight]);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    if (programmaticScrollFrameRef.current !== null) cancelAnimationFrame(programmaticScrollFrameRef.current);
    if (metricFrameRef.current !== null) cancelAnimationFrame(metricFrameRef.current);
  }, []);

  const revealEarlierMessages = useCallback(() => {
    const scroller = scrollerRef.current;
    if (scroller) {
      pendingPrependRef.current = { scrollHeight: scroller.scrollHeight, scrollTop: scroller.scrollTop };
    }
    setHistoryWindowSize((current) => Math.min(visibleMessages.length, current + CHAT_HISTORY_PAGE_SIZE));
  }, [visibleMessages.length]);

  const statusLabel =
    status === "open"
      ? "Connected"
      : status === "paused"
        ? "Paused"
        : status === "connecting"
          ? "Connecting"
          : "Reconnecting";
  const statusColor: "success" | "warning" | "error" | "gray" =
    status === "open" ? "success" : status === "paused" ? "gray" : status === "connecting" ? "warning" : "error";
  const headerChannel = channels[0];

  return (
    <section
      aria-label={`${title ?? (merged ? "Combined" : channels[0]?.displayName ?? "Live")} chat`}
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl bg-secondary ring-1 ring-inset ring-secondary ${className}`}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-secondary px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {!merged && headerChannel ? (
            <ChannelLogo
              name={headerChannel.displayName}
              logoUrl={headerChannel.channelLogoUrl}
              logoName={headerChannel.channelLogoName}
              avatarUrl={headerChannel.avatarUrl}
            />
          ) : (
            <MessageChatCircle className="size-4 shrink-0 text-brand-secondary" aria-hidden />
          )}
          <span className="truncate text-sm font-semibold text-primary">
            {title ?? (merged ? "One room" : channels[0]?.displayName ?? "Chat")}
          </span>
          <BadgeWithDot type="pill-color" size="sm" color={statusColor}>
            {statusLabel}
          </BadgeWithDot>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-quaternary">
          {activity > 0 ? <span title="Messages in the last minute">{activity}/min</span> : null}
          {headerActions}
        </div>
      </header>

      <div
        ref={scrollerRef}
        data-lenis-prevent
        role="log"
        aria-live="polite"
        aria-relevant="additions removals"
        onScroll={() => {
          if (programmaticScrollRef.current) return;
          scheduleScrollState();
        }}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-2.5"
      >
        {visibleMessages.length === 0 ? (
          <p className="px-1 py-2 text-xs text-quaternary">
            {messages.length > 0 ? "No messages match these filters." : "Waiting for chat…"}
          </p>
        ) : (
          <>
            {hasEarlierMessages ? (
              <div className="flex h-10 items-start px-1">
                <button
                  type="button"
                  onClick={revealEarlierMessages}
                  className="min-h-8 rounded-lg px-2 text-[10px] font-semibold text-tertiary ring-1 ring-secondary transition hover:bg-primary hover:text-primary"
                >
                  Show earlier messages
                </button>
              </div>
            ) : null}
            <ul
              className="relative"
              style={{ height: `${Math.max(1, virtualMetrics.totalHeight)}px` }}
              aria-setsize={historyMessages.length}
            >
              {virtualMessages.map((message, localIndex) => {
                const index = virtualWindow.start + localIndex;
                const top = virtualMetrics.offsets[index] ?? index * CHAT_ESTIMATED_ROW_HEIGHT;
                const channel = channelByLogin.get(normalize(message.channelLogin));
                return (
                  <VirtualizedChatMessageRow
                    key={chatMessageKey(message)}
                    rowKey={chatMessageKey(message)}
                    rowIndex={index}
                    top={top}
                    onHeight={onRowHeight}
                    message={message}
                    channel={channel}
                    merged={merged}
                    theme={theme}
                    textScale={textScale}
                    showTimestamps={showTimestamps}
                    badgeDetailFor={badgeDetailFor}
                    onReply={onReply}
                    onFocusChannel={onFocusChannel}
                    viewerIdentity={viewerLogin && normalize(message.user) === normalize(viewerLogin)
                      ? viewerIdentity ?? passportIdentities[normalize(message.user)] ?? null
                      : passportIdentities[normalize(message.user)] ?? null}
                  />
                );
              })}
            </ul>
          </>
        )}
      </div>

      {!autoScroll ? (
        <div className="shrink-0 border-t border-secondary p-2">
          <Button
            size="sm"
            color="primary"
            className="w-full"
            iconTrailing={ArrowDown}
            onPress={() => {
              setAutoScroll(true);
              scrollToLatest();
            }}
          >
            Jump to latest
          </Button>
        </div>
      ) : null}
    </section>
  );
}

type ChatMessageRowProps = {
  message: ChatMessage;
  channel?: ChatSessionChannel;
  merged: boolean;
  theme: "dark" | "light";
  textScale: number;
  showTimestamps: boolean;
  badgeDetailFor: (
    channelLogin: string,
    setId: string,
    version: string,
  ) => TwitchChatBadgeDetail | null;
  onReply?: (message: ChatMessage) => void;
  onFocusChannel?: (channelLogin: string) => void;
  viewerIdentity?: PassportChatIdentity | null;
  virtualStyle?: CSSProperties;
  ariaPosInSet?: number;
};

const VirtualizedChatMessageRow = memo(function VirtualizedChatMessageRow({
  rowKey,
  rowIndex,
  top,
  onHeight,
  ...row
}: ChatMessageRowProps & {
  rowKey: string;
  rowIndex: number;
  top: number;
  onHeight: (key: string, index: number, height: number) => void;
}) {
  const rowRef = useRef<HTMLLIElement | null>(null);

  useLayoutEffect(() => {
    const element = rowRef.current;
    if (!element) return undefined;
    const measure = () => onHeight(rowKey, rowIndex, element.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onHeight, rowIndex, rowKey]);

  return (
    <ChatMessageRow
      ref={rowRef}
      {...row}
      ariaPosInSet={rowIndex + 1}
      virtualStyle={{ position: "absolute", top, left: 0, width: "fit-content", maxWidth: "100%" }}
    />
  );
});

const ChatMessageRow = memo(forwardRef<HTMLLIElement, ChatMessageRowProps>(function ChatMessageRow({
  message,
  channel,
  merged,
  theme,
  textScale,
  showTimestamps,
  badgeDetailFor,
  onReply,
  onFocusChannel,
  viewerIdentity,
  virtualStyle,
  ariaPosInSet,
}, ref) {
  const fontPx = 13 * textScale;
  const emotePx = 22 * textScale;
  const authorColor = readableChatColor(message.color || channel?.accent || "#9146ff", theme);
  const time = showTimestamps
    ? new Date(message.receivedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  return (
    <li
      ref={ref}
      className="group/message w-fit max-w-full rounded-lg px-1.5 py-1 leading-snug text-primary transition-colors hover:bg-primary focus-within:bg-primary"
      style={{ ...virtualStyle, fontSize: `${fontPx}px`, overflowWrap: "anywhere", wordBreak: "break-word" }}
      aria-posinset={ariaPosInSet}
    >
      {time ? <span className="mr-1.5 font-mono text-[0.78em] tabular-nums text-quaternary">{time}</span> : null}
      {merged ? (
        <button
          type="button"
          onClick={() => onFocusChannel?.(message.channelLogin)}
          className="mr-1.5 inline-flex rounded-md align-middle transition-[filter,transform] hover:brightness-125 active:scale-[0.96] focus:outline-none focus:ring-2 focus:ring-brand"
          title={`Focus ${channel?.displayName ?? message.channelLogin}`}
          aria-label={`Focus ${channel?.displayName ?? message.channelLogin} chat`}
        >
          <ChannelLogo
            name={channel?.displayName ?? message.channelLogin}
            logoUrl={channel?.channelLogoUrl}
            logoName={channel?.channelLogoName}
            avatarUrl={channel?.avatarUrl}
          />
        </button>
      ) : null}
      {message.reply ? (
        <span className="mr-1 text-[0.82em] text-quaternary" title={message.reply.parentBody}>
          ↳ {message.reply.parentDisplayName ?? message.reply.parentUserLogin ?? "reply"}
        </span>
      ) : null}
      {message.badges.length > 0 ? (
        <span className="mr-1 inline-flex items-center gap-0.5 align-middle">
          {message.badges.slice(0, 4).map((badge) => {
            const detail = badgeDetailFor(message.channelLogin, badge.setId, badge.version);
            if (!detail) return null;
            return (
              <Tooltip
                key={`${badge.setId}-${badge.version}`}
                title={detail.title}
                description={detail.description}
                placement="top"
                delay={180}
              >
                <TooltipTrigger
                  className="inline-flex cursor-help rounded-sm align-middle focus-visible:ring-2 focus-visible:ring-brand"
                  aria-label={`${detail.title}: ${detail.description}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={detail.url}
                    alt=""
                    className="inline-block size-[1.05em] align-middle"
                    loading="lazy"
                    decoding="async"
                  />
                </TooltipTrigger>
              </Tooltip>
            );
          })}
        </span>
      ) : null}
      <a
        href={`https://www.twitch.tv/${encodeURIComponent(message.user)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`${viewerIdentity ? "inline-flex items-center rounded-md border bg-primary px-1 py-0.5" : "rounded-sm"} font-semibold underline-offset-2 transition-[filter,text-decoration-color] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
        style={{ color: authorColor, borderColor: viewerIdentity?.accent }}
        title={`Open ${message.displayName}'s Twitch profile${viewerIdentity?.frame ? ` · ${viewerIdentity.frame} Passport frame` : ""}`}
      >
        {message.displayName}
      </a>
      {viewerIdentity?.siteUser ? <span className="ml-1 inline-flex rounded-full border border-brand-secondary/35 bg-brand-primary px-1.5 py-0.5 align-middle text-[0.68em] font-semibold uppercase tracking-wide text-brand-secondary" title="This Twitch account is connected to a CORE site account">CORE site user</span> : null}
      {viewerIdentity?.nameplate || viewerIdentity?.title ? <span className="ml-1 inline-flex rounded-full bg-brand-primary px-1.5 py-0.5 align-middle text-[0.68em] font-semibold uppercase tracking-wide text-brand-secondary" title="Active CORE Passport nameplate">{viewerIdentity.nameplate ?? viewerIdentity.title}</span> : null}
      {viewerIdentity?.badges.slice(0, 3).map((badge) => <span key={badge.code} className="ml-0.5 inline-flex size-[1.15em] items-center justify-center rounded-full border border-brand-secondary bg-brand-primary align-middle text-[0.7em] font-bold text-brand-secondary" title={`${badge.name} · ${badge.tier}`} aria-label={`${badge.name} Passport badge`}>★</span>)}
      {viewerIdentity?.featuredCard ? (
        <span className="ml-0.5 inline-flex align-middle" title={`Featured Moment Card: ${viewerIdentity.featuredCard.name}${viewerIdentity.featuredCard.serialNumber ? ` #${viewerIdentity.featuredCard.serialNumber}` : ""}`}>
          {viewerIdentity.featuredCard.artworkUrl ? <img src={viewerIdentity.featuredCard.artworkUrl} alt="" className="inline-block size-[1.25em] rounded-sm object-cover ring-1 ring-brand-secondary" loading="lazy" /> : <span className="inline-flex size-[1.15em] items-center justify-center rounded-sm bg-brand-primary text-brand-secondary">◆</span>}
        </span>
      ) : null}
      <span className="text-quaternary"> · </span>
      {message.tokens.map((token, index) =>
        token.kind === "text" ? (
          // eslint-disable-next-line react/no-array-index-key
          <span key={index}>{token.text}</span>
        ) : (
          // eslint-disable-next-line react/no-array-index-key
          <Tooltip
            key={index}
            title={token.code}
            description={emoteProviderDescription(token.provider)}
            placement="top"
            delay={180}
          >
            <TooltipTrigger
              className="group/emote relative inline-flex cursor-help rounded-sm align-middle focus-visible:ring-2 focus-visible:ring-brand"
              aria-label={`${token.code}, ${emoteProviderDescription(token.provider)}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={token.url}
                alt=""
                className="inline-block -my-0.5 align-middle"
                style={{ height: `${emotePx}px` }}
                loading="lazy"
                decoding="async"
              />
            </TooltipTrigger>
          </Tooltip>
        ),
      )}
      {onReply ? (
        <button
          type="button"
          onClick={() => onReply(message)}
          className="chat-message-reply ml-1 inline-flex min-h-6 cursor-pointer items-center gap-1 rounded-md bg-secondary px-1.5 py-1 align-middle text-[0.78em] font-semibold leading-none text-quaternary ring-1 ring-inset ring-secondary transition-[color,background-color,opacity,transform] hover:bg-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label={`Reply to ${message.displayName}`}
        >
          <CornerUpLeft className="size-3" aria-hidden />
          <span>Reply</span>
        </button>
      ) : null}
    </li>
  );
}));

function emoteProviderDescription(provider: "twitch" | "bttv" | "7tv"): string {
  if (provider === "twitch") return "Twitch emote";
  if (provider === "bttv") return "BetterTTV emote";
  return "7TV emote";
}

export function readableChatColor(hex: string, theme: "dark" | "light"): string {
  const match = /^#?([0-9a-f]{3,8})$/i.exec(hex.trim());
  if (!match) return theme === "dark" ? "#e5e7eb" : "#0a0a0a";
  let value = match[1] ?? "";
  if (value.length === 3) value = value.split("").map((character) => character + character).join("");
  if (value.length === 8) value = value.slice(0, 6);
  if (value.length !== 6) return theme === "dark" ? "#e5e7eb" : "#0a0a0a";
  const rgb = [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  let saturation = 0;
  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const safeLightness = Math.min(theme === "dark" ? 0.85 : 0.5, Math.max(theme === "dark" ? 0.55 : 0.18, lightness));
  return `hsl(${Math.round(hue)} ${Math.round(saturation * 100)}% ${Math.round(safeLightness * 100)}%)`;
}
