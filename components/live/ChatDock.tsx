"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FilterLines,
  XClose,
} from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { ChannelLogo } from "@/components/live/ChannelLogo";
import { ChatComposer } from "@/components/live/ChatComposer";
import {
  passportIdentityAccent,
  type PassportChatIdentity,
} from "@/lib/passport/chat-identity";
import {
  ChatFeed,
  EMPTY_CHAT_FILTERS,
  type ChatFeedFilters,
  type ChatRoleFilter,
} from "@/components/live/ChatFeed";
import {
  ChatSessionProvider,
  useOptionalChatSession,
  useChatSession,
  type ChatSessionChannel,
} from "@/components/live/ChatSession";
import type { ChatMessage } from "@/lib/twitch-chat-client";
import type { ChatViewMode } from "@/lib/chat-layouts";
import { usePassportIdentity } from "@/hooks/usePassport";

export type ChatDockProps = {
  channels: ChatSessionChannel[];
  mode?: ChatViewMode;
  onModeChange?: (mode: ChatViewMode) => void;
  focusedLogin?: string;
  onFocusedLoginChange?: (login: string) => void;
  onFocusChannel?: (login: string) => void;
  onMoveChannel?: (login: string, direction: -1 | 1) => void;
  onCloseChannel?: (login: string) => void;
  textScale?: number;
  showTimestamps?: boolean;
  maxConnected?: number;
  dataSaver?: boolean;
  paused?: boolean;
  showToolbar?: boolean;
  showComposer?: boolean;
  focusedHeaderActions?: ReactNode;
  nameplate?: string | null;
  className?: string;
};

const normalize = (login: string) => login.toLowerCase();
const DEFAULT_CHAT_HISTORY_LIMIT = 1000;
const CHAT_IDENTITY_SAMPLE_LIMIT = 1000;
const MIN_SEPARATE_CHAT_COLUMN_WIDTH = 300;
const CHAT_COLUMN_GAP = 12;
const MAX_SEPARATE_CHAT_COLUMNS = 3;
const CHAT_IDENTITY_CACHE_TTL = 45_000;

type IdentityCacheEntry = {
  expiresAt: number;
  identity: PassportChatIdentity | null;
};

// Shared across mounts: rearranging a Room Studio dock should not request the
// same passport identity batch again moments later.
const publicIdentityCache = new Map<string, IdentityCacheEntry>();

function sameIdentityMap(
  previous: Record<string, PassportChatIdentity>,
  next: Record<string, PassportChatIdentity>,
): boolean {
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  if (previousKeys.length !== nextKeys.length) return false;
  return previousKeys.every((key) => previous[key] === next[key]);
}

export function getSeparateChatColumnCount(availableWidth: number, channelCount: number): number {
  if (channelCount <= 1) return 1;
  const safeWidth = Number.isFinite(availableWidth) ? Math.max(0, availableWidth) : 0;
  const supportedColumns = Math.floor((safeWidth + CHAT_COLUMN_GAP) / (MIN_SEPARATE_CHAT_COLUMN_WIDTH + CHAT_COLUMN_GAP));
  return Math.max(1, Math.min(MAX_SEPARATE_CHAT_COLUMNS, channelCount, supportedColumns));
}

/**
 * Reusable chat surface for /chat, Theater, and multiview. One provider owns
 * the IRC connection; merged, column, and focused views are just projections.
 */
export function ChatDock({
  channels,
  maxConnected = 6,
  dataSaver = false,
  paused = false,
  ...props
}: ChatDockProps) {
  const connectedChannels = channels.slice(0, Math.max(1, Math.min(8, maxConnected)));
  // Multiview keeps a room-level session mounted while the visual dock moves
  // between the side panel, below-grid, and floating positions.  Reusing that
  // provider means a placement change does not tear down IRC/WebSocket state
  // or lose the 1,000-message buffer. Standalone uses still own their session.
  const sharedSession = useOptionalChatSession();
  const content = (
    <ChatDockContent
      {...props}
      channels={channels}
      connectedChannels={connectedChannels}
      dataSaver={dataSaver}
    />
  );

  if (sharedSession) return content;

  return (
    <ChatSessionProvider
      channels={connectedChannels}
      enabled={!paused}
      // Data Saver limits active media and background work, never the room's
      // promised message history. Virtualized rendering keeps this 1,000-row
      // buffer inexpensive even on lower-power devices.
      perChannelLimit={DEFAULT_CHAT_HISTORY_LIMIT}
      mergedLimit={DEFAULT_CHAT_HISTORY_LIMIT}
    >
      {content}
    </ChatSessionProvider>
  );
}

function ChatDockContent({
  channels,
  connectedChannels,
  mode,
  onModeChange,
  focusedLogin,
  onFocusedLoginChange,
  onFocusChannel,
  onMoveChannel,
  onCloseChannel,
  textScale = 1,
  showTimestamps = false,
  dataSaver,
  showToolbar = true,
  showComposer = true,
  focusedHeaderActions,
  nameplate,
  className = "",
}: Omit<ChatDockProps, "maxConnected" | "paused"> & {
  connectedChannels: ChatSessionChannel[];
  dataSaver: boolean;
}) {
  const session = useChatSession();
  const [internalMode, setInternalMode] = useState<ChatViewMode>("combined");
  const [internalFocus, setInternalFocus] = useState(channels[0]?.login.toLowerCase() ?? "");
  const [internalSeparateTab, setInternalSeparateTab] = useState(channels[0]?.login.toLowerCase() ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<ChatFeedFilters>(EMPTY_CHAT_FILTERS);
  const [reply, setReply] = useState<{ message: ChatMessage; channelLogin: string } | null>(null);
  const [viewerLogin, setViewerLogin] = useState<string | null>(null);
  const [publicIdentities, setPublicIdentities] = useState<Record<string, PassportChatIdentity>>({});
  const dockRef = useRef<HTMLDivElement | null>(null);
  const [separateColumnCount, setSeparateColumnCount] = useState(1);

  const selectedMode = mode ?? internalMode;
  const connectedSet = useMemo(
    () => new Set(connectedChannels.map((channel) => normalize(channel.login))),
    [connectedChannels],
  );
  const fallbackFocus =
    channels.find((channel) => connectedSet.has(normalize(channel.login)))?.login ?? channels[0]?.login ?? "";
  const selectedFocus =
    (focusedLogin && channels.some((channel) => normalize(channel.login) === normalize(focusedLogin))
      ? focusedLogin
      : channels.some((channel) => normalize(channel.login) === normalize(internalFocus))
        ? internalFocus
        : fallbackFocus).toLowerCase();
  const focusedChannel = channels.find((channel) => normalize(channel.login) === selectedFocus);
  const passportIdentity = usePassportIdentity(
    selectedMode === "focused" ? focusedChannel?.passportChannelSlug ?? null : null,
  );
  const chatIdentity = useMemo<PassportChatIdentity | null>(() => {
    if (!passportIdentity.signedIn && !nameplate) return null;
    return {
      siteUser: passportIdentity.signedIn,
      title: passportIdentity.title?.name ?? null,
      nameplate: passportIdentity.nameplate?.name ?? nameplate ?? null,
      frame: passportIdentity.frame?.name ?? null,
      theme: passportIdentity.theme?.name ?? null,
      accent: passportIdentityAccent(
        passportIdentity.frame?.asset,
        passportIdentity.theme?.asset,
        passportIdentity.nameplate?.asset,
      ),
      featuredCard: passportIdentity.featuredCard
        ? {
            name: passportIdentity.featuredCard.name,
            artworkUrl: passportIdentity.featuredCard.artworkUrl,
            rarity: passportIdentity.featuredCard.rarity,
            serialNumber: passportIdentity.featuredCard.serialNumber,
          }
        : null,
      badges: passportIdentity.badges.map((badge) => ({
        code: badge.code,
        name: badge.name,
        tier: badge.tier,
      })),
      reactions: passportIdentity.reactionCodes.map((code) => code.replace(/[-_]+/g, " ")),
    };
  }, [nameplate, passportIdentity]);
  const identityChannel = selectedMode === "focused" ? focusedChannel?.passportChannelSlug ?? "" : "";
  const identityLogins = useMemo(() => [...new Set(session.mergedMessages
    .slice(-CHAT_IDENTITY_SAMPLE_LIMIT)
    .map((message) => normalize(message.user))
    .filter((login) => /^[a-z0-9_]{1,25}$/.test(login)))]
    .slice(-40), [session.mergedMessages]);
  const identityLoginsKey = identityLogins.join(",");
  const requestedIdentityLogins = useMemo(
    () => identityLoginsKey ? identityLoginsKey.split(",") : [],
    [identityLoginsKey],
  );

  useEffect(() => {
    const now = Date.now();
    for (const [key, entry] of publicIdentityCache) {
      if (entry.expiresAt <= now) publicIdentityCache.delete(key);
    }
    const cached: Record<string, PassportChatIdentity> = {};
    const missing: string[] = [];
    for (const login of requestedIdentityLogins) {
      const cachedEntry = publicIdentityCache.get(`${identityChannel}|${login}`);
      if (cachedEntry && cachedEntry.expiresAt > now) {
        if (cachedEntry.identity) cached[login] = cachedEntry.identity;
      } else {
        missing.push(login);
      }
    }
    setPublicIdentities((previous) => sameIdentityMap(previous, cached) ? previous : cached);
    if (missing.length === 0) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ logins: missing.join(",") });
      if (identityChannel) params.set("channel", identityChannel);
      fetch(`/api/passport/chat-identities?${params}`, {
        credentials: "same-origin",
        signal: controller.signal,
      })
        .then((response) => response.ok ? response.json() : { identities: {} })
        .then((payload: { identities?: Record<string, PassportChatIdentity> }) => {
          if (controller.signal.aborted) return;
          const expiresAt = Date.now() + CHAT_IDENTITY_CACHE_TTL;
          const resolved: Record<string, PassportChatIdentity> = { ...cached };
          for (const login of missing) {
            const identity = payload.identities?.[login] ?? null;
            publicIdentityCache.set(`${identityChannel}|${login}`, { expiresAt, identity });
            if (identity) resolved[login] = identity;
          }
          setPublicIdentities((previous) => sameIdentityMap(previous, resolved) ? previous : resolved);
        })
        .catch(() => {
          // A transient identity request should not erase badges already shown.
        });
    }, 260);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [identityChannel, requestedIdentityLogins]);

  const setMode = useCallback((next: ChatViewMode) => {
    setInternalMode(next);
    onModeChange?.(next);
  }, [onModeChange]);

  const setFocus = useCallback((login: string, enterFocusedMode = false) => {
    const normalized = normalize(login);
    setInternalFocus(normalized);
    onFocusedLoginChange?.(normalized);
    onFocusChannel?.(normalized);
    if (enterFocusedMode) setMode("focused");
  }, [onFocusChannel, onFocusedLoginChange, setMode]);

  const handleReply = useCallback((message: ChatMessage) => {
    setReply({ message, channelLogin: message.channelLogin });
  }, []);

  const handleCombinedFocus = useCallback((login: string) => setFocus(login, true), [setFocus]);

  const filteredChannels = filters.channelLogins;
  const totalActivity = connectedChannels.reduce(
    (total, channel) => total + (session.activityByChannel[normalize(channel.login)] ?? 0),
    0,
  );
  const statuses = connectedChannels.map(
    (channel) => session.statusByChannel[normalize(channel.login)] ?? "connecting",
  );
  const mergedStatus = statuses.every((status) => status === "open")
    ? "open"
    : statuses.some((status) => status === "connecting")
      ? "connecting"
      : statuses.some((status) => status === "open")
        ? "open"
        : statuses[0] ?? "closed";
  const roomModeSummaries = connectedChannels.flatMap((channel) => {
    const state = session.roomStateByChannel[normalize(channel.login)];
    if (!state) return [];
    const modes = [
      state.subscribersOnly ? "subscribers" : null,
      state.emoteOnly ? "emotes" : null,
      state.uniqueChat ? "unique chat" : null,
      state.slowSeconds ? `${state.slowSeconds}s slow` : null,
      state.followersOnlyMinutes !== undefined ? `${state.followersOnlyMinutes}m followers` : null,
    ].filter(Boolean);
    return modes.length ? [`${channel.displayName}: ${modes.join(", ")}`] : [];
  });

  const toggleFilterChannel = (login: string) => {
    const all = channels.map((channel) => normalize(channel.login));
    const current = filters.channelLogins ?? all;
    const next = current.includes(normalize(login))
      ? current.filter((candidate) => candidate !== normalize(login))
      : [...current, normalize(login)];
    setFilters((previous) => ({
      ...previous,
      channelLogins: next.length === all.length ? undefined : next,
    }));
  };

  const toggleRole = (role: ChatRoleFilter) => {
    const roles = filters.roles ?? [];
    setFilters((previous) => ({
      ...previous,
      roles: roles.includes(role) ? roles.filter((candidate) => candidate !== role) : [...roles, role],
    }));
  };

  useEffect(() => {
    const dock = dockRef.current;
    if (!dock || typeof ResizeObserver === "undefined") return;
    const updateColumnCount = (width: number) => {
      const nextColumnCount = getSeparateChatColumnCount(width, channels.length);
      setSeparateColumnCount((previous) => previous === nextColumnCount ? previous : nextColumnCount);
    };
    updateColumnCount(dock.clientWidth);
    const observer = new ResizeObserver(([entry]) => updateColumnCount(entry?.contentRect.width ?? dock.clientWidth));
    observer.observe(dock);
    return () => observer.disconnect();
  }, [channels.length]);

  const separateUsesTabs = selectedMode === "columns" && channels.length > 1 && separateColumnCount < 2;
  const separateTabLogin = channels.some((channel) => normalize(channel.login) === normalize(internalSeparateTab))
    ? normalize(internalSeparateTab)
    : fallbackFocus.toLowerCase();
  const separateTabChannel = channels.find((channel) => normalize(channel.login) === separateTabLogin);
  const gridColumns = separateColumnCount >= 3 ? "grid-cols-3" : separateColumnCount === 2 ? "grid-cols-2" : "grid-cols-1";

  return (
    <div ref={dockRef} className={`flex min-h-0 flex-col gap-3 ${className}`}>
      {showToolbar ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div data-cursor-context="chat view" className="inline-flex rounded-lg bg-secondary p-0.5 ring-1 ring-inset ring-secondary" aria-label="Chat view">
            {([
              ["combined", "One room"],
              ["columns", "Separate"],
              ["focused", "Focus"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={selectedMode === value}
                onClick={() => setMode(value)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand ${
                  selectedMode === value
                    ? "bg-primary text-primary shadow-xs"
                    : "text-tertiary hover:text-primary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            color={filtersOpen ? "secondary" : "tertiary"}
            iconLeading={FilterLines}
            onPress={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
          >
            Filters
          </Button>
        </div>
      ) : null}

      {(selectedMode === "focused" || separateUsesTabs) && channels.length > 1 ? (
        <div className="-mx-1 flex shrink-0 gap-1.5 overflow-x-auto px-1 pb-1" aria-label={selectedMode === "focused" ? "Focused chat channel" : "Separate chat channel"}>
          {channels.map((channel) => {
            const login = normalize(channel.login);
            const selected = selectedMode === "focused" ? login === selectedFocus : login === separateTabLogin;
            return (
              <button
                key={login}
                type="button"
                onClick={() => {
                  if (selectedMode === "focused") setFocus(login);
                  else setInternalSeparateTab(login);
                }}
                aria-pressed={selected}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg py-1 pl-1 pr-2.5 text-sm font-semibold ring-1 ring-inset transition focus:outline-none focus:ring-2 focus:ring-brand ${
                  selected ? "bg-primary text-primary ring-brand" : "bg-secondary text-tertiary ring-secondary"
                }`}
              >
                <ChannelLogo
                  name={channel.displayName}
                  logoUrl={channel.channelLogoUrl}
                  logoName={channel.channelLogoName}
                  avatarUrl={channel.avatarUrl}
                />
                {channel.displayName}
              </button>
            );
          })}
        </div>
      ) : null}

      {filtersOpen ? (
        <div className="shrink-0 rounded-xl bg-secondary p-3 ring-1 ring-inset ring-secondary">
          <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_2fr]">
            <label className="text-xs font-medium text-tertiary">
              Search messages
              <input
                type="search"
                value={filters.query ?? ""}
                onChange={(event) => setFilters((previous) => ({ ...previous, query: event.target.value }))}
                placeholder="Name or keyword"
                className="mt-1 w-full rounded-lg bg-primary px-3 py-2 text-sm text-primary ring-1 ring-inset ring-secondary placeholder:text-placeholder focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </label>
            <div>
              <p className="text-xs font-medium text-tertiary">Channels</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {channels.map((channel) => {
                  const checked = filteredChannels === undefined || filteredChannels.includes(normalize(channel.login));
                  return (
                    <button
                      key={channel.login}
                      type="button"
                      aria-pressed={checked}
                      onClick={() => toggleFilterChannel(channel.login)}
                      className={`inline-flex items-center gap-1.5 rounded-lg py-1 pl-1 pr-2.5 text-xs font-semibold ring-1 ring-inset ${checked ? "bg-primary text-primary ring-brand" : "text-quaternary ring-secondary"}`}
                    >
                      <ChannelLogo
                        name={channel.displayName}
                        logoUrl={channel.channelLogoUrl}
                        logoName={channel.channelLogoName}
                        avatarUrl={channel.avatarUrl}
                      />
                      {channel.displayName}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <FilterToggle label="Mentions + replies" checked={Boolean(filters.mentionsOnly)} onChange={(checked) => setFilters((previous) => ({ ...previous, mentionsOnly: checked }))} />
            <FilterToggle label="Hide bots" checked={Boolean(filters.hideBots)} onChange={(checked) => setFilters((previous) => ({ ...previous, hideBots: checked }))} />
            <FilterToggle label="Emotes only" checked={Boolean(filters.emotesOnly)} onChange={(checked) => setFilters((previous) => ({ ...previous, emotesOnly: checked }))} />
            {(["moderator", "vip", "subscriber"] as const).map((role) => (
              <FilterToggle key={role} label={role === "moderator" ? "Mods" : role === "vip" ? "VIPs" : "Subscribers"} checked={(filters.roles ?? []).includes(role)} onChange={() => toggleRole(role)} />
            ))}
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <FilterListInput label="Muted users" value={filters.mutedUsers ?? []} placeholder="username, anotheruser" onChange={(mutedUsers) => setFilters((previous) => ({ ...previous, mutedUsers }))} />
            <FilterListInput label="Muted words" value={filters.mutedTerms ?? []} placeholder="word, phrase" onChange={(mutedTerms) => setFilters((previous) => ({ ...previous, mutedTerms }))} />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="text-xs text-quaternary">
              <p>{dataSaver ? "Data Saver reduces background work; your 1,000-message history stays available." : "Filters only affect what you see."}</p>
              {roomModeSummaries.length ? <p className="mt-1">Room modes · {roomModeSummaries.join(" · ")}</p> : null}
            </div>
            <Button size="sm" color="link-gray" onPress={() => setFilters(EMPTY_CHAT_FILTERS)}>
              Clear filters
            </Button>
          </div>
        </div>
      ) : null}

      {channels.length > connectedChannels.length ? (
        <p className="shrink-0 text-xs text-quaternary">
          {channels.length - connectedChannels.length} chat{channels.length - connectedChannels.length === 1 ? " is" : "s are"} paused by the connection limit.
        </p>
      ) : null}

      {session.notices.at(-1) ? (
        <p className="shrink-0 rounded-lg bg-warning-secondary px-3 py-2 text-xs text-warning-primary" role="status">
          {session.notices.at(-1)?.message}
        </p>
      ) : null}

      <div className="min-h-[320px] flex-1">
        {selectedMode === "combined" ? (
          <ChatFeed
            messages={session.mergedMessages}
            channels={channels}
            status={mergedStatus}
            merged
            filters={filters}
            textScale={textScale}
            showTimestamps={showTimestamps}
            activity={totalActivity}
            onReply={handleReply}
            onFocusChannel={handleCombinedFocus}
            viewerLogin={viewerLogin}
            viewerIdentity={chatIdentity}
            passportIdentities={publicIdentities}
            className="h-full"
          />
        ) : selectedMode === "focused" ? (
          <ChatFeed
            messages={session.messagesByChannel[selectedFocus] ?? []}
            channels={focusedChannel ? [focusedChannel] : []}
            status={session.statusByChannel[selectedFocus] ?? (connectedSet.has(selectedFocus) ? "connecting" : "paused")}
            filters={{ ...filters, channelLogins: selectedFocus ? [selectedFocus] : [] }}
            textScale={textScale}
            showTimestamps={showTimestamps}
            activity={session.activityByChannel[selectedFocus] ?? 0}
            onReply={handleReply}
            viewerLogin={viewerLogin}
            viewerIdentity={chatIdentity}
            passportIdentities={publicIdentities}
            className="h-full"
            headerActions={focusedHeaderActions}
          />
        ) : separateUsesTabs ? (
          <ChatFeed
            messages={session.messagesByChannel[separateTabLogin] ?? []}
            channels={separateTabChannel ? [separateTabChannel] : []}
            status={session.statusByChannel[separateTabLogin] ?? (connectedSet.has(separateTabLogin) ? "connecting" : "paused")}
            filters={{ ...filters, channelLogins: separateTabLogin ? [separateTabLogin] : [] }}
            textScale={textScale}
            showTimestamps={showTimestamps}
            activity={session.activityByChannel[separateTabLogin] ?? 0}
            onReply={handleReply}
            viewerLogin={viewerLogin}
            viewerIdentity={chatIdentity}
            passportIdentities={publicIdentities}
            className="h-full"
            headerActions={separateTabChannel ? (
              <span className="flex items-center gap-0.5">
                {onMoveChannel ? (
                  <>
                    <ButtonUtility size="xs" color="tertiary" icon={ChevronLeft} tooltip="Move earlier" aria-label={`Move ${separateTabChannel.displayName} earlier`} disabled={channels.findIndex((channel) => normalize(channel.login) === separateTabLogin) === 0} onClick={() => onMoveChannel(separateTabLogin, -1)} />
                    <ButtonUtility size="xs" color="tertiary" icon={ChevronRight} tooltip="Move later" aria-label={`Move ${separateTabChannel.displayName} later`} disabled={channels.findIndex((channel) => normalize(channel.login) === separateTabLogin) === channels.length - 1} onClick={() => onMoveChannel(separateTabLogin, 1)} />
                  </>
                ) : null}
                {onCloseChannel ? (
                  <ButtonUtility size="xs" color="tertiary" icon={XClose} tooltip="Hide chat" aria-label={`Hide ${separateTabChannel.displayName}`} onClick={() => onCloseChannel(separateTabLogin)} />
                ) : null}
              </span>
            ) : undefined}
          />
        ) : (
          <div className={`grid h-full min-h-0 gap-3 ${gridColumns}`}>
            {channels.map((channel, index) => {
              const login = normalize(channel.login);
              return (
                <div
                  key={login}
                  className="min-h-[320px] focus:outline-none focus:ring-2 focus:ring-brand"
                  role="group"
                  tabIndex={0}
                  aria-label={`${channel.displayName} chat. Alt Left or Alt Right moves this column.`}
                  onKeyDown={(event) => {
                    if (!event.altKey) return;
                    if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      onMoveChannel?.(login, -1);
                    } else if (event.key === "ArrowRight") {
                      event.preventDefault();
                      onMoveChannel?.(login, 1);
                    }
                  }}
                >
                  <ChatFeed
                    messages={session.messagesByChannel[login] ?? []}
                    channels={[channel]}
                    status={session.statusByChannel[login] ?? (connectedSet.has(login) ? "connecting" : "paused")}
                    filters={{ ...filters, channelLogins: [login] }}
                    textScale={textScale}
                    showTimestamps={showTimestamps}
                    activity={session.activityByChannel[login] ?? 0}
                    onReply={handleReply}
                    viewerLogin={viewerLogin}
                    viewerIdentity={chatIdentity}
                    passportIdentities={publicIdentities}
                    className="h-full"
                    headerActions={
                      <span className="flex items-center gap-0.5">
                        {onMoveChannel ? (
                          <>
                            <ButtonUtility size="xs" color="tertiary" icon={ChevronLeft} tooltip="Move earlier" aria-label={`Move ${channel.displayName} earlier`} disabled={index === 0} onClick={() => onMoveChannel(login, -1)} />
                            <ButtonUtility size="xs" color="tertiary" icon={ChevronRight} tooltip="Move later" aria-label={`Move ${channel.displayName} later`} disabled={index === channels.length - 1} onClick={() => onMoveChannel(login, 1)} />
                          </>
                        ) : null}
                        {onCloseChannel ? (
                          <ButtonUtility size="xs" color="tertiary" icon={XClose} tooltip="Hide chat" aria-label={`Hide ${channel.displayName}`} onClick={() => onCloseChannel(login)} />
                        ) : null}
                      </span>
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showComposer ? (
        <ChatComposer
          channels={channels}
          preferredTarget={selectedMode === "focused" ? selectedFocus : undefined}
          reply={reply}
          onClearReply={() => setReply(null)}
          raid={session.lastRaid}
          onDismissRaid={session.dismissRaid}
          onFollowRaid={(login) => setFocus(login, true)}
          nameplate={nameplate}
          passportIdentity={chatIdentity}
          onViewerLoginChange={setViewerLogin}
        />
      ) : null}
    </div>
  );
}

function FilterToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-primary px-2.5 py-1.5 text-xs font-medium text-secondary ring-1 ring-inset ring-secondary">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-brand-600" />
      {label}
    </label>
  );
}

function FilterListInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string[];
  placeholder: string;
  onChange: (value: string[]) => void;
}) {
  return (
    <label className="text-xs font-medium text-tertiary">
      {label}
      <input
        value={value.join(", ")}
        onChange={(event) => onChange(event.target.value.split(",").map((part) => part.trim()).filter(Boolean))}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg bg-primary px-3 py-2 text-sm text-primary ring-1 ring-inset ring-secondary placeholder:text-placeholder focus:outline-none focus:ring-2 focus:ring-brand"
      />
    </label>
  );
}
