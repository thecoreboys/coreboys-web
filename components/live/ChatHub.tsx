"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Maximize01,
  Minimize01,
  Minus,
  Monitor01,
  Monitor04,
  Plus,
  RefreshCcw01,
  Settings01,
  XClose,
} from "@untitledui/icons";
import { ChatDock } from "@/components/live/ChatDock";
import { ChatStreamPlayer } from "@/components/live/ChatStreamPlayer";
import { ChannelLogo } from "@/components/live/ChannelLogo";
import { useChatLayouts } from "@/components/live/useChatLayouts";
import { accountChatLayoutSync } from "@/components/live/chat-layout-sync";
import { formatHandleDisplay } from "@/lib/watch/display-label";
import {
  BUILT_IN_CHAT_LAYOUTS,
  chatColumnGridClass,
  parseChatLayout,
  serializeChatLayout,
  shouldRenderChatStreams,
  type ChatLayoutSnapshot,
  type ChatViewMode,
} from "@/lib/chat-layouts";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Avatar } from "@/components/base/avatar/avatar";
import { BadgeWithDot } from "@/components/base/badges/badges";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { useLiveStatus } from "@/hooks/useLiveStatus";

const TEXT_SCALE_MIN = 0.7;
const TEXT_SCALE_MAX = 1.8;
const TEXT_SCALE_STEP = 0.1;

function clampScale(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(TEXT_SCALE_MIN, Math.min(TEXT_SCALE_MAX, Math.round(n * 10) / 10));
}

const STORAGE_KEY = "coreboys-chat-hub:v1";
const WORKSPACE_STORAGE_KEY = "coreboys-chat-workspace:v1";

export type ChatChannel = {
  /** Twitch login. */
  login: string;
  /** Twitch numeric user ID — required for BTTV/7TV. */
  userId: string;
  /** Display name (Twitch's display_name or stage name). */
  displayName: string;
  /** Twitch profile picture URL. */
  avatarUrl?: string;
  /** Member-accent color, falls back to Twitch purple for guests. */
  accent: string;
  /** Whether this channel is one of the six CORE members. */
  isCore: boolean;
  /** For CORE members only — slug for the comm/portrait link. */
  slug?: string;
  /** For CORE members only — comm logo path. */
  commLogo?: string;
  /** For CORE members only — comm name. */
  commName?: string;
};

type Persisted = {
  /** Logins the viewer has explicitly hidden — wins over auto-show. */
  hidden: string[];
  /** Logins the viewer has explicitly pinned visible — wins over the
   *  default "hide if offline" behavior. */
  shown?: string[];
  guests: Array<Pick<ChatChannel, "login" | "userId" | "displayName" | "avatarUrl">>;
  /** Login order — applied to both core + guest channels. Anything not
   *  listed here falls to its natural position at the end. */
  order?: string[];
  /** Multiplier applied to chat font + emote sizing across every tile. */
  textScale?: number;
  /** Whether the multistream player grid is visible above the chats. */
  streamsVisible?: boolean;
};

export type ChatHubProps = {
  coreChannels: ChatChannel[];
};

/**
 * Customizable chat hub. Renders the six CORE channels by default plus
 * any guest channels the viewer has added. State (hidden core members,
 * guest channels) persists to localStorage; nothing leaves the browser.
 *
 * The settings panel is a slide-down sheet anchored under the page title.
 * Modern UI — checkboxes for the six CORE members, a small input + Add
 * button for guest channels, "reset to defaults" link at the bottom.
 */
export function ChatHub({ coreChannels }: ChatHubProps) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [guests, setGuests] = useState<ChatChannel[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftLogin, setDraftLogin] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [mobileActive, setMobileActive] = useState<string | null>(null);
  const [textScale, setTextScale] = useState<number>(1);
  const [streamsVisible, setStreamsVisible] = useState<boolean>(true);
  const [playerParent, setPlayerParent] = useState<string | null>(null);
  const fullscreenRootRef = useRef<HTMLDivElement | null>(null);
  const [legacyNameplate, setLegacyNameplate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ChatViewMode>("combined");
  const [chatPlacement, setChatPlacement] = useState<"right" | "left" | "below">("right");
  const [maxConnected, setMaxConnected] = useState(6);
  const [dataSaver, setDataSaver] = useState(false);
  const [layoutName, setLayoutName] = useState("");
  const [layoutNotice, setLayoutNotice] = useState<string | null>(null);
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);
  const { layouts, save: saveNamedLayout, remove: removeNamedLayout } = useChatLayouts({
    sync: accountChatLayoutSync,
  });

  // Twitch's player iframe rejects requests until the embedding host
  // is sent as `parent=`. Defer mounting the stream grid until we know
  // the hostname client-side.
  useEffect(() => {
    setPlayerParent(window.location.hostname);
  }, []);

  useEffect(() => {
    fetch("/api/account/loyalty", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { card?: { houseStatus?: string } } | null) => {
        const s = d?.card?.houseStatus;
        if (s === "super") setLegacyNameplate("House Super");
        else if (s === "og-path") setLegacyNameplate("OG path");
        else setLegacyNameplate(null);
      })
      .catch(() => {});
  }, []);

  // Real browser fullscreen via the Fullscreen API. Sync the local
  // boolean with the actual document.fullscreenElement so the user
  // exiting via ESC / browser chrome flips our state too.
  const toggleFullscreen = useCallback(() => {
    const el = fullscreenRootRef.current ?? document.documentElement;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onChange = () => {
      const isFs = !!document.fullscreenElement;
      setFullscreen(isFs);
      // Collapse the customize sheet when entering fullscreen so the
      // chat grid gets the full viewport.
      if (isFs) setSettingsOpen(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Hydrate persisted state.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Persisted;
      if (Array.isArray(parsed.hidden)) {
        setHidden(new Set(parsed.hidden.map((s) => s.toLowerCase())));
      }
      if (Array.isArray(parsed.shown)) {
        setShown(new Set(parsed.shown.map((s) => s.toLowerCase())));
      }
      if (Array.isArray(parsed.guests)) {
        setGuests(
          parsed.guests.map((g) => ({
            login: g.login.toLowerCase(),
            userId: g.userId,
            displayName: g.displayName || g.login,
            avatarUrl: g.avatarUrl,
            accent: "#9146FF",
            isCore: false,
          })),
        );
      }
      if (Array.isArray(parsed.order)) {
        setOrder(parsed.order.map((s) => s.toLowerCase()));
      }
      if (typeof parsed.textScale === "number" && Number.isFinite(parsed.textScale)) {
        setTextScale(clampScale(parsed.textScale));
      }
      if (typeof parsed.streamsVisible === "boolean") {
        setStreamsVisible(parsed.streamsVisible);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const saved = parseChatLayout(localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? "");
      if (saved) {
        setViewMode(saved.mode);
        setMobileActive(saved.focusedLogin ?? null);
        setTextScale(clampScale(saved.textScale));
        setStreamsVisible(saved.streamsVisible);
        setMaxConnected(saved.maxConnected);
        setDataSaver(saved.dataSaver);
        if (saved.channelLogins.length > 0) {
          const selected = new Set(saved.channelLogins);
          setOrder(saved.channelLogins);
          setHidden(
            new Set(
              coreChannels
                .map((channel) => channel.login.toLowerCase())
                .filter((login) => !selected.has(login)),
            ),
          );
          setShown(selected);
        }
      }
    } finally {
      setWorkspaceHydrated(true);
    }
  }, [coreChannels]);

  const persist = useCallback(
    (
      nextHidden: Set<string>,
      nextShown: Set<string>,
      nextGuests: ChatChannel[],
      nextOrder: string[],
      nextTextScale: number,
      nextStreamsVisible: boolean,
    ) => {
      const payload: Persisted = {
        hidden: [...nextHidden],
        shown: [...nextShown],
        guests: nextGuests.map((g) => ({
          login: g.login,
          userId: g.userId,
          displayName: g.displayName,
          avatarUrl: g.avatarUrl,
        })),
        order: nextOrder,
        textScale: nextTextScale,
        streamsVisible: nextStreamsVisible,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        /* ignore */
      }
    },
    [],
  );

  // Live status — drives the auto-hide-when-offline default. SWR
  // refresh interval lives in useLiveStatus (60s).
  const { data: liveData } = useLiveStatus();
  const liveByLogin = useMemo(() => {
    const set = new Set<string>();
    for (const e of liveData?.live ?? []) {
      if (e.isLive) set.add(e.login.toLowerCase());
    }
    return set;
  }, [liveData]);

  /**
   * Toggle the effective visibility of a CORE channel:
   *   - hidden ∪ shown encode the user's explicit overrides
   *   - default: visible iff live, hidden otherwise
   *   - clicking ON  → drop from hidden, pin in shown when offline
   *   - clicking OFF → add to hidden, drop from shown
   */
  const toggleChannelVisibility = useCallback(
    (login: string, isCurrentlyVisible: boolean) => {
      const lower = login.toLowerCase();
      const isLive = liveByLogin.has(lower);
      const nextHidden = new Set(hidden);
      const nextShown = new Set(shown);
      if (isCurrentlyVisible) {
        nextHidden.add(lower);
        nextShown.delete(lower);
      } else {
        nextHidden.delete(lower);
        if (!isLive) nextShown.add(lower);
        // No need to explicitly mark live channels as shown — the
        // default for live IS show, so just removing them from hidden
        // is sufficient.
      }
      setHidden(nextHidden);
      setShown(nextShown);
      persist(nextHidden, nextShown, guests, order, textScale, streamsVisible);
    },
    [hidden, shown, liveByLogin, guests, order, persist, textScale, streamsVisible],
  );

  const removeGuest = useCallback(
    (login: string) => {
      setGuests((prev) => {
        const next = prev.filter((g) => g.login.toLowerCase() !== login.toLowerCase());
        persist(hidden, shown, next, order, textScale, streamsVisible);
        return next;
      });
    },
    [hidden, shown, order, persist, textScale, streamsVisible],
  );

  /** Move `dragged` to before/after `target`. */
  const reorder = useCallback(
    (dragged: string, target: string, side: "before" | "after") => {
      if (dragged === target) return;
      const all = [...coreChannels.map((c) => c.login.toLowerCase()), ...guests.map((g) => g.login.toLowerCase())];
      const seen = new Set(all);
      // Build the current effective order: stored order ∪ any new logins.
      const current = [...order.filter((l) => seen.has(l)), ...all.filter((l) => !order.includes(l))];
      const fromIdx = current.indexOf(dragged);
      if (fromIdx < 0) return;
      current.splice(fromIdx, 1);
      const toIdx = current.indexOf(target);
      if (toIdx < 0) return;
      current.splice(side === "before" ? toIdx : toIdx + 1, 0, dragged);
      setOrder(current);
      persist(hidden, shown, guests, current, textScale, streamsVisible);
    },
    [coreChannels, guests, hidden, shown, order, persist, textScale, streamsVisible],
  );

  const adjustTextScale = useCallback(
    (delta: number) => {
      setTextScale((prev) => {
        const next = clampScale(prev + delta);
        persist(hidden, shown, guests, order, next, streamsVisible);
        return next;
      });
    },
    [hidden, shown, guests, order, persist, streamsVisible],
  );

  const resetTextScale = useCallback(() => {
    setTextScale(1);
    persist(hidden, shown, guests, order, 1, streamsVisible);
  }, [hidden, shown, guests, order, persist, streamsVisible]);

  const toggleStreams = useCallback(() => {
    setStreamsVisible((prev) => {
      const next = !prev;
      persist(hidden, shown, guests, order, textScale, next);
      return next;
    });
  }, [hidden, shown, guests, order, persist, textScale]);

  const addGuest = useCallback(async () => {
    const cleaned = draftLogin.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!cleaned) {
      setAddError("Enter a Twitch username");
      return;
    }
    if (coreChannels.some((c) => c.login.toLowerCase() === cleaned)) {
      setAddError("That's a CORE member — already in the hub");
      return;
    }
    if (guests.some((g) => g.login.toLowerCase() === cleaned)) {
      setAddError("Already added");
      return;
    }

    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch(`/api/twitch/user/${encodeURIComponent(cleaned)}`);
      if (!res.ok) {
        setAddError(res.status === 404 ? "Twitch user not found" : "Couldn't look up that user");
        return;
      }
      const data: { id: string; login: string; displayName: string; profileImageUrl: string | null } =
        await res.json();
      const next: ChatChannel = {
        login: data.login.toLowerCase(),
        userId: data.id,
        displayName: data.displayName,
        avatarUrl: data.profileImageUrl ?? undefined,
        accent: "#9146FF",
        isCore: false,
      };
      const nextGuests = [...guests, next];
      setGuests(nextGuests);
      persist(hidden, shown, nextGuests, order, textScale, streamsVisible);
      setDraftLogin("");
    } catch {
      setAddError("Network error — try again");
    } finally {
      setAdding(false);
    }
  }, [draftLogin, coreChannels, guests, hidden, shown, order, persist, textScale, streamsVisible]);

  const reset = useCallback(() => {
    setHidden(new Set());
    setShown(new Set());
    setGuests([]);
    setOrder([]);
    setTextScale(1);
    setStreamsVisible(true);
    setViewMode("combined");
    setMobileActive(null);
    setMaxConnected(6);
    setDataSaver(false);
    persist(new Set(), new Set(), [], [], 1, true);
  }, [persist]);

  /** Effective visibility per CORE channel:
   *    - explicit `hidden` always wins (hide it regardless of state)
   *    - otherwise: live channels show; offline channels show only if
   *      pinned in `shown` … UNLESS no one is currently live, in which
   *      case the chat page falls back to showing everyone so the room
   *      isn't empty when the entire group is offline. */
  const anyoneLive = liveByLogin.size > 0;
  const isCoreVisible = useCallback(
    (login: string): boolean => {
      const lower = login.toLowerCase();
      if (hidden.has(lower)) return false;
      if (liveByLogin.has(lower)) return true;
      if (shown.has(lower)) return true;
      return !anyoneLive;
    },
    [hidden, shown, liveByLogin, anyoneLive],
  );

  const visibleCore = useMemo(
    () => coreChannels.filter((c) => isCoreVisible(c.login)),
    [coreChannels, isCoreVisible],
  );

  const visible: ChatChannel[] = useMemo(() => {
    const merged = [...visibleCore, ...guests];
    if (order.length === 0) return merged;
    const byLogin = new Map(merged.map((c) => [c.login.toLowerCase(), c] as const));
    const sorted: ChatChannel[] = [];
    for (const login of order) {
      const ch = byLogin.get(login);
      if (ch) {
        sorted.push(ch);
        byLogin.delete(login);
      }
    }
    // Append any channels not in the saved order (newcomers).
    for (const ch of byLogin.values()) sorted.push(ch);
    return sorted;
  }, [visibleCore, guests, order]);

  const currentLayout = useMemo<ChatLayoutSnapshot>(
    () => ({
      version: 1,
      mode: viewMode,
      channelLogins: visible.map((channel) => channel.login.toLowerCase()),
      focusedLogin: mobileActive ?? visible[0]?.login.toLowerCase(),
      textScale,
      streamsVisible,
      maxConnected,
      dataSaver,
    }),
    [viewMode, visible, mobileActive, textScale, streamsVisible, maxConnected, dataSaver],
  );

  useEffect(() => {
    if (!workspaceHydrated) return;
    try {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, serializeChatLayout(currentLayout));
    } catch {
      /* local preferences are optional */
    }
  }, [currentLayout, workspaceHydrated]);

  const applyLayout = useCallback(
    (snapshot: ChatLayoutSnapshot) => {
      const selectedLogins = snapshot.channelLogins.length
        ? snapshot.channelLogins
        : visible.map((channel) => channel.login.toLowerCase());
      const selected = new Set(selectedLogins);
      const nextHidden = new Set(
        coreChannels
          .map((channel) => channel.login.toLowerCase())
          .filter((login) => !selected.has(login)),
      );
      const nextShown = new Set(selectedLogins);
      setHidden(nextHidden);
      setShown(nextShown);
      setOrder(selectedLogins);
      setViewMode(snapshot.mode);
      setMobileActive(snapshot.focusedLogin ?? selectedLogins[0] ?? null);
      setTextScale(clampScale(snapshot.textScale));
      setStreamsVisible(snapshot.streamsVisible);
      setMaxConnected(snapshot.maxConnected);
      setDataSaver(snapshot.dataSaver);
      persist(
        nextHidden,
        nextShown,
        guests,
        selectedLogins,
        clampScale(snapshot.textScale),
        snapshot.streamsVisible,
      );
      setLayoutNotice("Layout applied.");
    },
    [coreChannels, guests, persist, visible],
  );

  // Default the mobile active chat to the first visible channel; when the
  // active one disappears (hidden / removed), fall back to the first.
  const activeMobileLogin = (() => {
    if (mobileActive && visible.some((c) => c.login.toLowerCase() === mobileActive)) {
      return mobileActive;
    }
    return visible[0]?.login.toLowerCase() ?? null;
  })();

  const showStreamWall = workspaceHydrated && shouldRenderChatStreams(streamsVisible, dataSaver) && playerParent && visible.length > 0;
  const chatDock = visible.length === 0 ? (
    <div className="flex min-h-[320px] items-center justify-center rounded-xl bg-secondary p-8 ring-1 ring-inset ring-secondary">
      <EmptyState size="sm">
        <EmptyState.Header><FeaturedIcon icon={Monitor01} size="lg" color="gray" theme="modern" /></EmptyState.Header>
        <EmptyState.Content><EmptyState.Title>No channels visible</EmptyState.Title><EmptyState.Description>Open Customize and turn channels back on, or add a guest channel.</EmptyState.Description></EmptyState.Content>
      </EmptyState>
    </div>
  ) : (
    <ChatDock
      channels={visible.map((channel) => ({ login: channel.login, userId: channel.userId, displayName: channel.displayName, avatarUrl: channel.avatarUrl, channelLogoUrl: channel.commLogo, channelLogoName: channel.commName, accent: channel.accent, isCore: channel.isCore, passportChannelSlug: channel.slug }))}
      mode={viewMode}
      onModeChange={setViewMode}
      focusedLogin={activeMobileLogin ?? undefined}
      onFocusedLoginChange={setMobileActive}
      textScale={textScale}
      maxConnected={maxConnected}
      dataSaver={dataSaver}
      nameplate={legacyNameplate}
      onCloseChannel={(login) => { const channel = visible.find((candidate) => candidate.login.toLowerCase() === login); if (!channel) return; if (channel.isCore) toggleChannelVisibility(channel.login, true); else removeGuest(channel.login); }}
      onMoveChannel={(login, direction) => { const index = visible.findIndex((channel) => channel.login.toLowerCase() === login); const target = visible[index + direction]; if (!target) return; reorder(login, target.login.toLowerCase(), direction < 0 ? "before" : "after"); }}
      className={fullscreen ? "min-h-0 flex-1 px-4 pb-4" : "h-[calc(100svh-260px)] min-h-[480px] max-h-[780px] sm:h-[calc(100svh-180px)] sm:min-h-[520px]"}
    />
  );

  return (
    <div
      ref={fullscreenRootRef}
      className={`bg-primary ${fullscreen ? "flex h-screen flex-col overflow-hidden" : ""}`}
    >
      {/* Action bar — eyebrow + live count on the left, controls on the right. */}
      <div
        className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${
          fullscreen ? "shrink-0 px-4 pt-4 pb-3" : "mb-6"
        }`}
      >
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-brand-secondary">Live channels</p>
          {anyoneLive ? (
            <BadgeWithDot type="pill-color" color="error" size="sm">
              {liveByLogin.size} live now
            </BadgeWithDot>
          ) : (
            <BadgeWithDot type="pill-color" color="gray" size="sm">
              All offline
            </BadgeWithDot>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          color={settingsOpen ? "secondary" : "tertiary"}
          onPress={() => setSettingsOpen((v) => !v)}
          aria-expanded={settingsOpen}
          iconLeading={Settings01}
        >
          Customize
        </Button>
        <Button
          size="sm"
          color={streamsVisible ? "primary" : "tertiary"}
          onPress={toggleStreams}
          isDisabled={dataSaver}
          aria-pressed={streamsVisible}
          iconLeading={streamsVisible ? Monitor04 : Monitor01}
        >
          {streamsVisible ? "Hide streams" : "Show streams"}
        </Button>
        <Button
          size="sm"
          color="tertiary"
          onPress={toggleFullscreen}
          aria-pressed={fullscreen}
          iconLeading={fullscreen ? Minimize01 : Maximize01}
        >
          {fullscreen ? "Exit fullscreen" : "Fullscreen"}
        </Button>
        </div>
      </div>

      {/* Settings panel */}
      {settingsOpen ? (
        <div className="mb-6 rounded-xl bg-secondary p-4 ring-1 ring-inset ring-secondary md:p-5">
          <p className="text-md font-semibold text-primary">
            Customize
          </p>
          <p className="mt-1 text-sm text-tertiary">
            Toggle members on or off, or add another Twitch channel.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {coreChannels.map((c) => {
              const visible = isCoreVisible(c.login);
              const isLive = liveByLogin.has(c.login.toLowerCase());
              return (
                <button
                  key={c.login}
                  type="button"
                  onClick={() => toggleChannelVisibility(c.login, visible)}
                  aria-pressed={visible}
                  title={
                    isLive
                      ? `${c.displayName} is live`
                      : `${c.displayName} is offline — toggle on to pin visible`
                  }
                  className={`group flex items-center gap-2.5 rounded-lg px-2 py-2 text-left ring-1 ring-inset transition-colors cursor-pointer ${
                    visible
                      ? "bg-primary ring-brand text-primary"
                      : "bg-secondary ring-secondary opacity-70 hover:opacity-100"
                  }`}
                >
                  <Avatar
                    size="sm"
                    src={c.avatarUrl}
                    alt={c.displayName}
                    initials={c.displayName[0]}
                    status={isLive ? "online" : undefined}
                  />
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate text-sm font-semibold text-primary">
                      {c.displayName}
                    </span>
                    <span className="mt-0.5 truncate text-xs text-tertiary">
                      {isLive ? "Live now" : "Offline"}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                      visible ? "bg-brand-solid" : "bg-quaternary"
                    }`}
                  >
                    <span
                      className={`mx-0.5 inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
                        visible ? "translate-x-3" : "translate-x-0"
                      }`}
                    />
                  </span>
                </button>
              );
            })}
          </div>

          {/* Text size control — applies to every chat tile. */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-tertiary">
              Text size
            </p>
            <div className="inline-flex items-center gap-1 rounded-lg bg-primary p-0.5 ring-1 ring-inset ring-secondary">
              <ButtonUtility
                size="sm"
                color="tertiary"
                onClick={() => adjustTextScale(-TEXT_SCALE_STEP)}
                disabled={textScale <= TEXT_SCALE_MIN + 1e-6}
                aria-label="Decrease chat text size"
                tooltip="Decrease text size"
                icon={Minus}
              />
              <span
                className="min-w-[44px] text-center text-sm tabular-nums text-primary"
                aria-live="polite"
              >
                {Math.round(textScale * 100)}%
              </span>
              <ButtonUtility
                size="sm"
                color="tertiary"
                onClick={() => adjustTextScale(TEXT_SCALE_STEP)}
                disabled={textScale >= TEXT_SCALE_MAX - 1e-6}
                aria-label="Increase chat text size"
                tooltip="Increase text size"
                icon={Plus}
              />
            </div>
            <Button
              size="sm"
              color="link-gray"
              onPress={resetTextScale}
              isDisabled={Math.abs(textScale - 1) < 1e-6}
              iconLeading={RefreshCcw01}
            >
              Reset
            </Button>
            <span className="text-xs text-quaternary">
              Applies to every chat
            </span>
          </div>

          {guests.length > 0 ? (
            <div className="mt-5">
              <p className="text-sm font-semibold text-tertiary">
                Guests · {guests.length}
              </p>
              <ul className="mt-3 flex flex-wrap items-center gap-2">
                {guests.map((g) => (
                  <li
                    key={g.login}
                    className="inline-flex items-center gap-2 rounded-full bg-primary py-1 pl-1 pr-1.5 ring-1 ring-inset ring-secondary"
                  >
                    <Avatar size="xs" src={g.avatarUrl} alt={g.displayName} initials={g.displayName[0]} />
                    <span className="text-sm font-medium text-primary">
                      {g.displayName}
                    </span>
                    <ButtonUtility
                      size="xs"
                      color="tertiary"
                      onClick={() => removeGuest(g.login)}
                      aria-label={`Remove ${g.displayName}`}
                      tooltip={`Remove ${g.displayName}`}
                      icon={XClose}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!adding) addGuest();
            }}
            className="mt-5 flex flex-wrap items-center gap-2"
          >
            <label
              htmlFor="add-guest"
              className="text-sm font-medium text-tertiary"
            >
              Add guest
            </label>
            <div className="relative flex-1 min-w-[220px]">
              <span className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center text-sm text-quaternary">
                twitch.tv/
              </span>
              <input
                id="add-guest"
                type="text"
                value={draftLogin}
                onChange={(e) => {
                  setDraftLogin(e.target.value);
                  setAddError(null);
                }}
                placeholder="username"
                className="w-full rounded-lg bg-primary py-2 pl-[88px] pr-3 text-sm text-primary ring-1 ring-inset ring-secondary shadow-xs transition-shadow placeholder:text-placeholder focus:outline-none focus:ring-2 focus:ring-brand"
                disabled={adding}
              />
            </div>
            <Button
              type="submit"
              size="sm"
              color="primary"
              isDisabled={adding}
              isLoading={adding}
              showTextWhileLoading
              iconLeading={adding ? undefined : Plus}
            >
              {adding ? "Adding…" : "Add channel"}
            </Button>
            <Button
              type="button"
              size="sm"
              color="link-gray"
              onPress={reset}
              iconLeading={RefreshCcw01}
            >
              Reset
            </Button>
          </form>
          {addError ? (
            <p className="mt-2 text-sm font-medium text-error-primary">{addError}</p>
          ) : null}

          <details className="mt-5 rounded-lg bg-primary ring-1 ring-inset ring-secondary">
            <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-secondary focus:outline-none focus:ring-2 focus:ring-brand">
              Layouts &amp; performance <span aria-hidden className="text-quaternary">⌄</span>
            </summary>
            <div className="border-t border-secondary p-3">
              <p className="text-xs font-medium text-quaternary">Quick layouts</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {BUILT_IN_CHAT_LAYOUTS.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    size="sm"
                    color="secondary"
                    onPress={() => applyLayout(preset.layout)}
                  >
                    {preset.name}
                  </Button>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4">
                <label className="text-xs font-medium text-tertiary">
                  Chat placement
                  <select value={chatPlacement} onChange={(event) => setChatPlacement(event.target.value as typeof chatPlacement)} className="ml-2 rounded-md bg-secondary px-2 py-1.5 text-sm text-primary ring-1 ring-inset ring-secondary">
                    <option value="right">Right of streams</option>
                    <option value="left">Left of streams</option>
                    <option value="below">Below streams</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-tertiary">
                  Active chat limit
                  <select
                    value={maxConnected}
                    onChange={(event) => setMaxConnected(Number(event.target.value))}
                    className="ml-2 rounded-md bg-secondary px-2 py-1.5 text-sm text-primary ring-1 ring-inset ring-secondary"
                  >
                    {[1, 2, 4, 6, 8].map((count) => <option key={count} value={count}>{count}</option>)}
                  </select>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-tertiary">
                  <input
                    type="checkbox"
                    checked={dataSaver}
                    onChange={(event) => {
                      setDataSaver(event.target.checked);
                      if (event.target.checked) setStreamsVisible(false);
                    }}
                    className="accent-brand-600"
                  />
                  Data saver
                </label>
              </div>

              <form
                className="mt-4 flex flex-wrap items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!layoutName.trim()) {
                    setLayoutNotice("Name the layout first.");
                    return;
                  }
                  saveNamedLayout(layoutName, currentLayout);
                  setLayoutName("");
                  setLayoutNotice("Layout saved locally and synced when signed in.");
                }}
              >
                <input
                  value={layoutName}
                  onChange={(event) => setLayoutName(event.target.value)}
                  maxLength={48}
                  placeholder="My game-night layout"
                  className="min-w-[220px] flex-1 rounded-lg bg-secondary px-3 py-2 text-sm text-primary ring-1 ring-inset ring-secondary placeholder:text-placeholder focus:outline-none focus:ring-2 focus:ring-brand"
                />
                <Button type="submit" size="sm" color="primary">Save current</Button>
              </form>

              {layouts.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {layouts.map((saved) => (
                    <li key={saved.id} className="inline-flex items-center rounded-full bg-secondary p-0.5 ring-1 ring-inset ring-secondary">
                      <button type="button" onClick={() => applyLayout(saved.layout)} className="rounded-full px-2.5 py-1 text-xs font-semibold text-secondary hover:text-primary">
                        {saved.name}
                      </button>
                      <ButtonUtility
                        size="xs"
                        color="tertiary"
                        icon={XClose}
                        tooltip={`Delete ${saved.name}`}
                        aria-label={`Delete ${saved.name}`}
                        onClick={() => removeNamedLayout(saved.id)}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
              {layoutNotice ? <p className="mt-2 text-xs text-quaternary" role="status">{layoutNotice}</p> : null}
            </div>
          </details>
        </div>
      ) : null}

      {showStreamWall ? (
        <section aria-label="Watch and chat layout" className={chatPlacement === "below" ? "flex flex-col gap-5" : "grid gap-5 lg:grid-cols-[minmax(19rem,.58fr)_minmax(0,1fr)]"}>
          {chatPlacement === "left" ? chatDock : null}
          <StreamGrid channels={visible} parent={playerParent!} />
          {chatPlacement !== "left" ? chatDock : null}
        </section>
      ) : chatDock}
    </div>
  );
}

/**
 * Multistream player grid — drops one controlled Twitch player per visible
 * channel above the chats. Each player requests muted autoplay and exposes
 * only CORE controls; the provider iframe remains inert below the surface.
 *
 * Tiles keep a 16:9 aspect ratio so the row heights stay even regardless
 * of how many streams are visible, and the column count scales with the
 * total — same step pattern as the chat grid below.
 */
function StreamGrid({
  channels,
  parent,
}: {
  channels: ChatChannel[];
  parent: string;
}) {
  return (
    <section
      aria-label="Live multistream"
      className={`mb-5 grid gap-3 ${chatColumnGridClass(channels.length)}`}
    >
      {channels.map((c) => (
        <article
          key={c.login}
          className="min-w-0 overflow-hidden rounded-xl bg-secondary ring-1 ring-inset ring-secondary"
        >
          <header className="flex items-center gap-2.5 border-b border-secondary px-3 py-2">
            <ChannelLogo
              name={c.displayName}
              logoUrl={c.commLogo}
              logoName={c.commName}
              avatarUrl={c.avatarUrl}
              size="sm"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-primary">{c.displayName}</span>
              <span className="block truncate text-xs text-quaternary">@{formatHandleDisplay(c.login)}</span>
            </span>
          </header>
          <ChatStreamPlayer channel={c} parent={parent} />
        </article>
      ))}
    </section>
  );
}
