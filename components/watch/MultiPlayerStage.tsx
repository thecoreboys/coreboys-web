"use client";
/* eslint-disable @next/next/no-img-element -- Runtime media posters can come from user-added third-party URLs outside the Next Image allowlist. */

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Check,
  ChevronDown,
  ExternalLink,
  GripVertical,
  Info,
  LayoutGrid,
  ListVideo,
  LockKeyhole,
  Maximize2,
  MessageSquare,
  Minimize2,
  MoreHorizontal,
  Pause,
  PanelRight,
  PictureInPicture2,
  Pin,
  PinOff,
  Play,
  Plus,
  Radio,
  Save,
  Search,
  Share2,
  SlidersHorizontal,
  Trash2,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { ChatDock, ChatSessionProvider } from "@/components/live/chat";
import { usePlayer, type PlayerContextValue } from "@/components/providers/PlayerProvider";
import { MEMBERS } from "@/lib/members";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { useSubscription } from "@/hooks/useSubscription";
import { useWatchDiscovery, type WatchFeedbackValue } from "@/lib/watch/discovery-state";
import {
  catalogPlayables,
  contentShape,
  embedFor,
  playableFromUrl,
  type Playable,
} from "@/lib/watch/playable";
import type { WatchCatalog } from "@/lib/watch/types";
import { formatHandleDisplay } from "@/lib/watch/display-label";
import {
  AUTOPLAY_MODES,
  decodeWorkspace,
  multiviewPassportCreditTileId,
  WORKSPACE_PRESETS,
  type WorkspaceTile,
  type WorkspaceSnapshot,
  type WorkspacePreset,
} from "@/lib/watch/workspace";
import type { MultiviewLiveRoom } from "@/lib/watch/multiview-access";
import { PlayerNetworkWatermark } from "@/components/watch/PlayerNetworkWatermark";
import { OnScreenIdentityOverlay } from "@/components/watch/OnScreenIdentityOverlay";
import { PlayerAmbientBloom } from "@/components/watch/PlayerAmbientBloom";
import { WatchSelect } from "@/components/watch/WatchSelect";
import { floatingChatViewportStyle } from "@/lib/watch/floating-chat";
import {
  gridTileToNormalizedRect,
  LEGACY_FLOATING_REFERENCE_VIEWPORT,
  moveAndResolveRoomLayout,
  normalizeRoomRect,
  normalizedRectToGridPosition,
  presetNormalizedRects,
  resolvePresetRoomLayout,
  roomLayoutMatchesPreset,
  type NormalizedRect,
  type RoomLayoutTile,
} from "@/lib/watch/room-layout";

type Notice = {
  text: string;
  tone?: "default" | "error";
  actionHref?: string;
  actionLabel?: string;
} | null;
type SidebarTab = "queue" | "chat" | "details";
type SourceIntent = "tile" | "queue";
type MemberRecord = (typeof MEMBERS)[number];

const ROOM_RECIPES: Array<{
  id: string;
  label: string;
  description: string;
  preset: (typeof WORKSPACE_PRESETS)[number]["id"];
  chatDock: "left" | "right" | "bottom" | "floating";
  mixAudio: boolean;
  dataSaver: boolean;
  blocks: string;
}> = [
  { id: "watch-party", label: "Watch party", description: "One main stream, a few side views, and chat beside it.", preset: "main-three", chatDock: "right", mixAudio: false, dataSaver: false, blocks: "grid-cols-3 [&>span:first-child]:col-span-2 [&>span:first-child]:row-span-2" },
  { id: "live-desk", label: "Live desk", description: "Follow every live creator evenly with one clear audio lead.", preset: "quad", chatDock: "right", mixAudio: false, dataSaver: false, blocks: "grid-cols-2" },
  { id: "director", label: "Director", description: "A six-view room for monitoring many live sources at once.", preset: "three-two", chatDock: "floating", mixAudio: true, dataSaver: false, blocks: "grid-cols-3" },
  { id: "quiet-focus", label: "Quiet focus", description: "Keep one source active and save data in the background.", preset: "solo", chatDock: "bottom", mixAudio: false, dataSaver: true, blocks: "grid-cols-1" },
];

const CHAT_DOCK_OPTIONS: Array<{
  id: "left" | "right" | "bottom" | "floating";
  label: string;
  description: string;
}> = [
  { id: "right", label: "Side panel", description: "Keep chat beside the room controls." },
  { id: "left", label: "Left dock", description: "Keep chat beside the room from the left edge." },
  { id: "bottom", label: "Below grid", description: "Give chat a wide, calm reading area." },
  { id: "floating", label: "Floating", description: "Keep chat available without reducing the grid." },
];

function channelFor(login: string) {
  const member = MEMBERS.find((entry) => entry.twitchLogin.toLowerCase() === login.toLowerCase());
  return {
    login: login.toLowerCase(),
    displayName: member?.stageName ?? formatHandleDisplay(login),
    avatarUrl: member?.portrait,
    accent: member?.accent,
    isCore: Boolean(member),
    passportChannelSlug: member?.slug,
  };
}

function playableNativeUrl(value?: string | null): value is string {
  return Boolean(value && (value.startsWith("https://") || value.startsWith("/")));
}

function platformLabel(item: Playable) {
  if (item.platform === "youtube") return "YouTube";
  if (item.platform === "twitch") return "Twitch";
  if (item.platform === "instagram") return "Instagram";
  if (item.platform === "tiktok") return "TikTok";
  if (item.platform === "x") return "X";
  return "CORE";
}

function mediaTypeLabel(item: Playable) {
  if (item.kind === "live") return "Live";
  if (item.kind === "vod") return "Broadcast";
  if (item.kind === "clip") return "Clip";
  if (item.format === "photo") return "Photo";
  if (item.format === "short") return item.platform === "instagram" ? "Reel" : "Short";
  return "Video";
}

function formatPlaybackTime(seconds: number) {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(safe / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  const remainingSeconds = safe % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function MultiPlayerStage({
  catalog,
  autoFillLive = false,
  liveRoom = false,
  initialLiveRoom,
}: {
  catalog: WatchCatalog;
  /** Used by /chat: seed a room from the live-status source once it resolves. */
  autoFillLive?: boolean;
  /** Presents the multiview workspace as the all-live chat room. */
  liveRoom?: boolean;
  /** Server-authorized, redacted bootstrap for /multiview?live=all. */
  initialLiveRoom?: MultiviewLiveRoom;
}) {
  const player = usePlayer();
  const subscription = useSubscription();
  const discovery = useWatchDiscovery();
  const authoritativeLiveRoom = initialLiveRoom?.mode === "all-current-live";
  // The authoritative room must never rebuild redacted streams from the public
  // live-status response. Only the server-issued playable subset enters state.
  const { data: liveStatus } = useLiveStatus(!authoritativeLiveRoom);
  const searchParams = useSearchParams();
  const all = useMemo(() => catalogPlayables(catalog), [catalog]);
  const live = useMemo(() => {
    const existing = all.filter((item) => item.kind === "live");
    const seen = new Set(existing.map((item) => item.twitchLogin?.toLowerCase()).filter(Boolean));
    const runtime = (liveStatus?.live ?? []).flatMap((entry): Playable[] => {
      if (!entry.isLive || seen.has(entry.login.toLowerCase())) return [];
      const member = MEMBERS.find((candidate) => candidate.twitchLogin.toLowerCase() === entry.login.toLowerCase());
      return [{
        key: `live-${member?.slug ?? entry.login.toLowerCase()}`,
        kind: "live",
        platform: "twitch",
        title: entry.title || `${member?.stageName ?? formatHandleDisplay(entry.login)} live`,
        poster: entry.thumbnailUrl || member?.portrait || "",
        memberSlug: member?.slug ?? null,
        memberLabel: member?.stageName ?? formatHandleDisplay(entry.login),
        youtubeId: null,
        twitchLogin: entry.login,
        vodId: null,
        clipSrc: null,
        clipId: null,
        url: `https://twitch.tv/${entry.login}`,
        sourceUrl: `https://twitch.tv/${entry.login}`,
        embeddable: true,
        format: "live",
      }];
    });
    return [...existing, ...runtime];
  }, [all, liveStatus]);
  const currentLive = useMemo(() => {
    if (authoritativeLiveRoom) return live.filter((item) => item.kind === "live");
    const online = new Set((liveStatus?.live ?? []).filter((entry) => entry.isLive).map((entry) => entry.login.toLowerCase()));
    return live.filter((item) => item.kind === "live" && Boolean(item.twitchLogin && online.has(item.twitchLogin.toLowerCase())));
  }, [authoritativeLiveRoom, live, liveStatus]);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceIntent, setSourceIntent] = useState<SourceIntent>("tile");
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");
  const [layoutName, setLayoutName] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [dragTileId, setDragTileId] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [adaptivePlayerBudget, setAdaptivePlayerBudget] = useState(4);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("details");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [audioPickerOpen, setAudioPickerOpen] = useState(false);
  const [chatGuestLogin, setChatGuestLogin] = useState("");
  const importedRef = useRef(false);
  const autoLiveRoomRef = useRef(false);
  const offlineHandledRef = useRef(new Set<string>());
  const sourceOpenerRef = useRef<HTMLElement | null>(null);
  const sourceWasOpenRef = useRef(false);
  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);
  const expandedMultiview = subscription.hasFeature("multiview.expanded");
  // Saving a personal room should not be confused with the paid player-count
  // upgrade. A signed-in fan can always return to their own layout.
  const savedLayoutsAllowed = subscription.signedIn;
  const savedLayoutsLabel = subscription.signedIn ? "your account" : "a free account";
  const tileLimit = initialLiveRoom?.tileLimit ?? (expandedMultiview ? 12 : 2);
  const lockedLiveSlots = initialLiveRoom?.lockedSlots ?? [];

  const showFeatureNotice = useCallback((
    featureId: "multiview.expanded" | "multiview.saved_layouts",
    text: string,
  ) => {
    setNotice({
      text,
      actionHref: subscription.featureHref(featureId),
      actionLabel: subscription.signedIn ? "View plans" : "Sign in",
    });
  }, [subscription]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean; effectiveType?: string; addEventListener?: (type: "change", listener: () => void) => void; removeEventListener?: (type: "change", listener: () => void) => void };
    };
    const updateBudget = () => {
      const constrained = nav.connection?.saveData || ["slow-2g", "2g"].includes(nav.connection?.effectiveType ?? "");
      const lowMemory = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4;
      const lowCpu = typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 4;
      const hidden = document.visibilityState !== "visible";
      setAdaptivePlayerBudget(hidden || constrained ? 1 : lowMemory || lowCpu ? 2 : 4);
    };
    updateBudget();
    document.addEventListener("visibilitychange", updateBudget);
    nav.connection?.addEventListener?.("change", updateBudget);
    return () => {
      document.removeEventListener("visibilitychange", updateBudget);
      nav.connection?.removeEventListener?.("change", updateBudget);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => {
      if (media.matches) setMobileSidebarOpen(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!player.ready || importedRef.current || subscription.loading) return;
    importedRef.current = true;
    // The live=all room is server-authored. Ignore raw URL layouts/additions so
    // they cannot replace the redacted bootstrap before its tier cap is applied.
    if (authoritativeLiveRoom) return;
    const encoded = searchParams.get("layout");
    if (encoded) {
      const snapshot = decodeWorkspace(encoded);
      if (snapshot) {
        const freshByKey = new Map(all.map((item) => [item.key, item]));
        const importedTiles = expandedMultiview ? snapshot.tiles : snapshot.tiles.slice(0, tileLimit);
        player.importWorkspace({
          ...snapshot,
          tiles: importedTiles.map((tile) => ({
            ...tile,
            item: freshByKey.get(tile.item.key) ?? tile.item,
          })),
        });
        if (importedTiles.length < snapshot.tiles.length) {
          showFeatureNotice(
            "multiview.expanded",
            `Loaded the first ${tileLimit} players. ${subscription.requiredPlanName("multiview.expanded")} unlocks the full shared room.`,
          );
        } else {
          setNotice({ text: `Loaded “${snapshot.name}”` });
        }
        return;
      }
      setNotice({ text: "That shared layout could not be read.", tone: "error" });
    }
    const addKey = searchParams.get("add");
    const requested = addKey ? all.find((item) => item.key === addKey) : null;
    if (requested) {
      if (player.tiles.length >= tileLimit && !expandedMultiview) {
        showFeatureNotice(
          "multiview.expanded",
          `${subscription.requiredPlanName("multiview.expanded")} unlocks up to 12 simultaneous players.`,
        );
      } else {
        player.addTile(requested, { focus: true });
      }
    }
    if (searchParams.get("picker") === "1") {
      setReplaceTarget(null);
      setSourceIntent("tile");
      setSourceOpen(true);
    }
  }, [all, authoritativeLiveRoom, expandedMultiview, player, searchParams, showFeatureNotice, subscription, tileLimit]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), notice.actionHref ? 7_000 : 3_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (authoritativeLiveRoom || !liveStatus) return;
    const online = new Set(
      liveStatus.live.filter((entry) => entry.isLive).map((entry) => entry.login.toLowerCase()),
    );
    for (const tile of player.tiles) {
      const login = tile.item.kind === "live" ? tile.item.twitchLogin?.toLowerCase() : null;
      if (!login) continue;
      if (online.has(login)) {
        offlineHandledRef.current.delete(tile.id);
        if (tile.standby) player.updateTile(tile.id, { standby: false });
        continue;
      }
      if (offlineHandledRef.current.has(tile.id)) continue;
      offlineHandledRef.current.add(tile.id);
      if (player.autoplayMode === "keep-grid-full") player.finishTile(tile.id);
      else player.updateTile(tile.id, { standby: true });
    }
  }, [authoritativeLiveRoom, liveStatus, player]);

  useEffect(() => {
    const shouldFill = autoFillLive || authoritativeLiveRoom;
    if (!shouldFill || autoLiveRoomRef.current || !player.ready || subscription.loading) return;
    if (!authoritativeLiveRoom && !liveStatus) return;
    autoLiveRoomRef.current = true;
    if (authoritativeLiveRoom) {
      // Clear stale/session-restored players before mounting the server-issued
      // set. removeTile synchronously updates PlayerProvider's backing ref.
      for (const tile of player.tiles) player.removeTile(tile.id);
    }
    player.fillWithLive(currentLive, { limit: tileLimit });
    player.setChatChannels(currentLive.flatMap((item) => item.twitchLogin ? [item.twitchLogin] : []));
    player.setChatMode("combined");
    if (player.chatDock === "closed") player.setChatDock("right");
    // The Theater panel opens on Details. Chat stays connected and one click
    // away, but a newly assembled room should first explain what is playing.
    setSidebarTab("details");
    if (currentLive.length) setAudioPickerOpen(true);
    if (!currentLive.length) setNotice({ text: "No one is live right now. This room will stay ready for the next stream." });
  }, [authoritativeLiveRoom, autoFillLive, currentLive, liveStatus, player, subscription.loading, tileLimit]);

  const focused = player.focusedTile ?? player.tiles[0] ?? null;
  const audioLead = player.tiles.find((tile) => !tile.muted && !tile.standby) ?? null;
  const focusedMember = useMemo(() => {
    if (!focused) return null;
    return MEMBERS.find((entry) =>
      entry.slug === focused.item.memberSlug
      || entry.twitchLogin.toLowerCase() === focused.item.twitchLogin?.toLowerCase(),
    ) ?? null;
  }, [focused]);
  const visibleTiles = player.maximizedTileId
    ? player.tiles.filter((tile) => tile.id === player.maximizedTileId)
    : player.tiles;
  const activeIds = useMemo(() => {
    const ordered = [
      ...(focused ? [focused] : []),
      ...player.tiles.filter((tile) => tile.pinned && tile.id !== focused?.id),
      ...player.tiles.filter((tile) => !tile.pinned && tile.id !== focused?.id),
    ];
    return new Set(
      ordered
        .slice(0, player.dataSaver ? 1 : Math.min(player.maxActivePlayers, adaptivePlayerBudget))
        .map((tile) => tile.id),
    );
  }, [adaptivePlayerBudget, focused, player.dataSaver, player.maxActivePlayers, player.tiles]);
  const passportCreditTileId = useMemo(
    () => multiviewPassportCreditTileId(player.tiles, activeIds, focused?.id ?? null),
    [activeIds, focused?.id, player.tiles],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']") || event.metaKey || event.ctrlKey || event.altKey) return;
      const numbered = Number(event.key);
      if (Number.isInteger(numbered) && numbered >= 1 && numbered <= 9) {
        const tile = visibleTiles[numbered - 1];
        if (tile) {
          event.preventDefault();
          player.focusTile(tile.id, { takeAudio: false });
        }
        return;
      }
      if (event.key.toLowerCase() === "f" && focused) {
        event.preventDefault();
        player.setMaximizedTileId(player.maximizedTileId === focused.id ? null : focused.id);
      }
      if (event.key.toLowerCase() === "m" && focused) {
        event.preventDefault();
        player.updateTile(focused.id, { muted: !focused.muted });
      }
      if (event.key === "Escape" && player.maximizedTileId) {
        event.preventDefault();
        player.setMaximizedTileId(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [focused, player, visibleTiles]);

  const chatLogins = useMemo(() => Array.from(new Set([
    focused?.item.twitchLogin ?? focusedMember?.twitchLogin,
    ...player.chatChannels,
    ...player.tiles.map((tile) => tile.item.twitchLogin
      ?? MEMBERS.find((member) => member.slug === tile.item.memberSlug)?.twitchLogin),
  ].filter((login): login is string => Boolean(login)))).slice(0, 8), [focused, focusedMember, player.chatChannels, player.tiles]);
  const chatChannels = useMemo(() => chatLogins.map(channelFor), [chatLogins]);
  // This provider intentionally outlives the visual ChatDock. Changing from
  // side → bottom → floating only remounts the presentation, not the IRC
  // session or its buffered history.
  const chatConnectionLimit = player.dataSaver ? 2 : player.maxActivePlayers;
  const connectedChatChannels = useMemo(
    () => chatChannels.slice(0, Math.max(1, Math.min(8, chatConnectionLimit))),
    [chatChannels, chatConnectionLimit],
  );
  const focusedLogin = focused?.item.twitchLogin ?? focusedMember?.twitchLogin ?? chatLogins[0];
  const focusChatChannel = (login: string) => {
    const member = MEMBERS.find((entry) => entry.twitchLogin.toLowerCase() === login.toLowerCase());
    const tile = player.tiles.find((entry) =>
      entry.item.twitchLogin?.toLowerCase() === login.toLowerCase()
      || Boolean(member && entry.item.memberSlug === member.slug),
    );
    if (tile) player.focusTile(tile.id);
  };

  const needle = query.trim().toLowerCase();
  const sources = (needle
    ? all.filter((item) =>
        item.title.toLowerCase().includes(needle)
        || item.memberLabel.toLowerCase().includes(needle)
        || item.platform.toLowerCase().includes(needle))
    : [...live, ...all.filter((item) => item.kind !== "live")]
  ).slice(0, 80);

  function closeSources() {
    setSourceOpen(false);
    setReplaceTarget(null);
    setSourceIntent("tile");
  }

  function chooseSource(item: Playable) {
    if (sourceIntent === "queue") {
      const added = player.addToQueue(item, "end");
      setNotice({ text: added ? `Added “${item.title}” to Up Next` : "That title is already open or queued." });
    } else if (replaceTarget) {
      player.replaceTile(replaceTarget, item);
    } else {
      if (player.tiles.length >= tileLimit) {
        closeSources();
        if (expandedMultiview) {
          setNotice({ text: "This room already has the maximum 12 players." });
        } else {
          showFeatureNotice(
            "multiview.expanded",
            `${subscription.requiredPlanName("multiview.expanded")} adds up to 12 simultaneous players. Your current playback stays open.`,
          );
        }
        return;
      }
      const added = player.addTile(item, { focus: true });
      if (added && player.queue.length === 0) {
        const related = [
          ...all.filter((candidate) => candidate.key !== item.key && candidate.memberSlug && candidate.memberSlug === item.memberSlug),
          ...all.filter((candidate) => candidate.key !== item.key && (!item.memberSlug || candidate.memberSlug !== item.memberSlug)),
        ];
        player.refill(related.slice(0, 30));
      }
    }
    closeSources();
    setQuery("");
  }

  function addUrl() {
    const item = playableFromUrl(url);
    if (!item) {
      setNotice({ text: "Use a YouTube, Twitch, TikTok, Instagram, or direct video URL.", tone: "error" });
      return;
    }
    chooseSource(item);
    setUrl("");
  }

  async function share() {
    const code = player.shareWorkspace(layoutName || "CORE multiview");
    const link = `${window.location.origin}/multiview?layout=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(link);
      setNotice({ text: "Share link copied" });
    } catch {
      window.prompt("Copy this multiview link", link);
    }
  }

  async function save() {
    if (!savedLayoutsAllowed) {
      setNotice({
        text: "Sign in to save this room to your account.",
        actionHref: "/login?next=/multiview",
        actionLabel: "Sign in",
      });
      return;
    }
    const name = layoutName.trim() || `My ${player.tiles.length || 1}-player layout`;
    await player.saveLayout(name);
    setLayoutName(name);
    setNotice({ text: `Saved “${name}”` });
  }

  function openSources(tileId?: string, opener?: HTMLElement | null, intent: SourceIntent = "tile") {
    if (intent === "tile" && !tileId && player.tiles.length >= tileLimit) {
      if (expandedMultiview) {
        setNotice({ text: "This room already has the maximum 12 players." });
      } else {
        showFeatureNotice(
          "multiview.expanded",
          `${subscription.requiredPlanName("multiview.expanded")} unlocks up to 12 simultaneous players.`,
        );
      }
      return;
    }
    sourceOpenerRef.current = opener ?? (document.activeElement as HTMLElement | null);
    setReplaceTarget(tileId ?? null);
    setSourceIntent(intent);
    setSourceOpen(true);
  }

  function fillLive() {
    const openKeys = new Set(player.tiles.map((tile) => tile.item.key));
    const available = currentLive.filter((item) => !openKeys.has(item.key));
    const remaining = Math.max(0, tileLimit - player.tiles.length);
    if (remaining > 0) player.fillWithLive(available.slice(0, remaining), { limit: tileLimit });
    if (currentLive.length) {
      player.setChatChannels(currentLive.flatMap((item) => item.twitchLogin ? [item.twitchLogin] : []));
      setAudioPickerOpen(true);
    }
    if (available.length > remaining && !expandedMultiview) {
      showFeatureNotice(
        "multiview.expanded",
        `Added the Free room limit. ${subscription.requiredPlanName("multiview.expanded")} can show up to 12 live players together.`,
      );
    }
  }

  useEffect(() => {
    if (sourceOpen) {
      sourceWasOpenRef.current = true;
      return;
    }
    if (!sourceWasOpenRef.current) return;
    sourceWasOpenRef.current = false;
    const opener = sourceOpenerRef.current;
    sourceOpenerRef.current = null;
    window.requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus();
    });
  }, [sourceOpen]);

  const chat = chatChannels.length ? (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <form
        className="flex shrink-0 items-center gap-2 rounded-xl bg-white/[0.035] p-2 ring-1 ring-white/8"
        onSubmit={(event) => {
          event.preventDefault();
          const login = chatGuestLogin.trim().replace(/^@/, "").toLowerCase().replace(/[^a-z0-9_]/g, "");
          if (!login) return;
          player.setChatChannels([...player.chatChannels, login]);
          setChatGuestLogin("");
        }}
      >
        <label className="flex min-w-0 flex-1 items-center gap-2 text-[10px] text-white/48">
          <span className="shrink-0">Text</span>
        <input aria-label="Chat text size" type="range" min="0.7" max="1.8" step="0.1" value={player.chatTextScale} onChange={(event) => player.setChatTextScale(Number(event.target.value))} className="min-w-0 flex-1 cursor-pointer accent-white" />
        </label>
        <input value={chatGuestLogin} onChange={(event) => setChatGuestLogin(event.target.value)} placeholder="Add chat" className="min-h-9 w-20 rounded-lg bg-black/30 px-2 text-[10px] text-white outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-white/25" />
        <button type="submit" className="min-h-9 rounded-lg bg-white px-2.5 text-[10px] font-semibold text-black">Add</button>
      </form>
      <ChatDock
        channels={chatChannels}
        mode={player.chatMode}
        onModeChange={player.setChatMode}
        focusedLogin={player.chatFocusedLogin ?? focusedLogin}
        onFocusedLoginChange={player.setChatFocusedLogin}
        onFocusChannel={focusChatChannel}
        onCloseChannel={(login) => player.setChatChannels(player.chatChannels.filter((channel) => channel !== login.toLowerCase()))}
        textScale={player.chatTextScale}
        showTimestamps={player.showChatTimestamps}
        maxConnected={chatConnectionLimit}
        dataSaver={player.dataSaver}
        className="min-h-0 flex-1"
      />
    </div>
  ) : (
    <EmptyChat onAdd={() => openSources()} />
  );
  const workspaceSidebar = (
    <WorkspaceSidebar
      activeTab={sidebarTab}
      onTabChange={setSidebarTab}
      mobileOpen={mobileSidebarOpen}
      onMobileClose={closeMobileSidebar}
      forceCompactDesktop={Boolean(
        !mobile
        && !player.maximizedTileId
        && player.layoutPreset === "theater-first"
        && visibleTiles.length === 2
        && visibleTiles.some((tile) => tile.item.platform === "twitch"),
      )}
      focused={focused}
      member={focusedMember}
      tiles={visibleTiles}
      chat={player.chatDock === "bottom" || player.chatDock === "floating" ? <ChatDockPlacementNote dock={player.chatDock} /> : chat}
      onAddQueue={(opener) => openSources(undefined, opener, "queue")}
      onReplace={(tileId, opener) => openSources(tileId, opener)}
    />
  );
  const sideWidth = `${player.chatDockSize.side}px`;
  const theaterTwitchPair = Boolean(
    !mobile
    && !player.maximizedTileId
    && player.layoutPreset === "theater-first"
    && visibleTiles.length === 2
    && visibleTiles.some((tile) => tile.item.platform === "twitch"),
  );
  const roomColumns = player.chatDock === "left"
    ? theaterTwitchPair
      ? "2xl:grid-cols-[minmax(19rem,min(var(--room-chat-width),25vw))_minmax(0,1fr)]"
      : "xl:grid-cols-[minmax(19rem,min(var(--room-chat-width),25vw))_minmax(0,1fr)]"
    : theaterTwitchPair
      ? "2xl:grid-cols-[minmax(0,1fr)_minmax(19rem,min(var(--room-chat-width),25vw))]"
      : "xl:grid-cols-[minmax(0,1fr)_minmax(19rem,min(var(--room-chat-width),25vw))]";

  return (
    <ChatSessionProvider
      channels={connectedChatChannels}
      // The virtualized feed makes a full room history cheap. Data Saver
      // prioritizes the active player, but does not silently discard chat.
      perChannelLimit={1000}
      mergedLimit={1000}
    >
    <main className="min-h-[calc(100dvh-4rem)] bg-[#050506] text-white">
      <div className="mx-auto max-w-[1880px] px-3 py-4 sm:px-5 lg:px-7">
        <header className="mb-3 flex min-h-12 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[radial-gradient(circle_at_35%_25%,rgba(255,255,255,.22),transparent_40%),linear-gradient(145deg,rgba(232,0,105,.9),rgba(104,42,184,.72))] shadow-[0_12px_30px_rgba(232,0,105,.22)] ring-1 ring-white/20">
              <LayoutGrid className="size-4 text-white/70" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="hidden text-[9px] font-bold uppercase tracking-[.16em] text-white/38 sm:block">Multiview desk</p>
                <p className="truncate text-sm font-semibold tracking-tight text-white">{liveRoom || authoritativeLiveRoom ? "CORE Live Room" : "Your screening room"}</p>
                <span className="rounded-full bg-white/7 px-2 py-0.5 text-[9px] tabular-nums text-white/45">
                  {authoritativeLiveRoom
                    ? `${player.tiles.length} playable${lockedLiveSlots.length ? ` · ${lockedLiveSlots.length} locked` : ""}`
                    : `${player.tiles.length} / ${tileLimit}`}
                </span>
                {!expandedMultiview && !subscription.loading ? (
                  <Link
                    href={subscription.featureHref("multiview.expanded") as never}
                    className="inline-flex items-center gap-1 rounded-full bg-white/7 px-2 py-0.5 text-[9px] font-semibold text-white/55 ring-1 ring-inset ring-white/10 transition hover:bg-white/12 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                  >
                    <LockKeyhole className="size-2.5" aria-hidden />
                    12-player rooms
                  </Link>
                ) : null}
              </div>
              <p className="hidden truncate text-[10px] text-white/42 sm:block">{liveRoom || authoritativeLiveRoom ? "Every available CORE live stream and its chat, in one room." : `${player.layoutPreset === "freeform" ? "Custom layout" : WORKSPACE_PRESETS.find((entry) => entry.id === player.layoutPreset)?.description ?? "A cinematic room"} · ${audioLead ? `Audio lead: ${audioLead.item.memberLabel}` : player.tiles.length ? "Choose an audio lead" : "Add a stream to begin"}`}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={fillLive}
              disabled={currentLive.length === 0}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-white px-3 text-xs font-semibold text-black shadow-xs-skeuomorphic ring-1 ring-inset ring-white/90 transition hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35 disabled:ring-white/10 md:min-h-10"
            >
              <Radio className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">{currentLive.length ? "Watch live channels" : "No one live"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSetupOpen(true);
              }}
              aria-expanded={setupOpen}
              aria-controls="multiview-setup-modal"
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-xs font-semibold shadow-xs-skeuomorphic ring-1 ring-inset outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.98] md:min-h-10 ${setupOpen ? "bg-white text-black ring-white/90 hover:bg-white/90" : "bg-white/5 text-white/75 ring-white/12 hover:bg-white/10 hover:text-white hover:ring-white/20"}`}
            >
              <SlidersHorizontal className="size-3.5" aria-hidden />
              <span>Room studio</span>
            </button>
            <IconControlTooltip
              title="Open side panel"
              description="Choose Up Next, chat, or media details."
              placement="bottom"
            >
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                aria-expanded={mobileSidebarOpen}
                aria-controls="multiview-sidebar"
                className={`grid size-11 place-items-center rounded-xl bg-white/5 text-white/70 ring-1 ring-white/12 hover:bg-white/10 hover:text-white ${theaterTwitchPair ? "2xl:hidden" : "xl:hidden"}`}
                aria-label="Open Up Next, chat, or details"
              >
                <PanelRight className="size-4" aria-hidden />
              </button>
            </IconControlTooltip>
          </div>
        </header>

        {/* Keep the Theater stage usable at laptop widths. A saved wide chat
            dock still opens at its full width on large displays, but yields
            enough room for a real Twitch companion on a compact desktop. */}
        <div
          className={`grid min-h-0 items-start gap-3 ${roomColumns}`}
          style={{ "--room-chat-width": sideWidth } as CSSProperties}
        >
          {player.chatDock === "left" ? workspaceSidebar : null}
          <div className="min-w-0">
            {player.tiles.length === 0 ? (
              <EmptyStage
                liveCount={Math.min(currentLive.length, tileLimit)}
                onAdd={() => openSources()}
                onFill={fillLive}
              />
            ) : mobile ? (
              <div>
                <MobileStage
                  tile={focused ?? player.tiles[0]!}
                  tiles={player.tiles}
                  active={Boolean(focused && activeIds.has(focused.id))}
                  passportCredit={(focused ?? player.tiles[0]!).id === passportCreditTileId}
                  onReplace={openSources}
                  feedback={discovery.state.feedback[(focused ?? player.tiles[0]!).item.key]?.value ?? null}
                  onFeedback={(item, value) => discovery.setFeedback(item.key, value)}
                />
                {authoritativeLiveRoom && lockedLiveSlots.length ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Membership-locked live streams">
                    {lockedLiveSlots.map((slot) => (
                      <LockedLiveTile
                        key={slot.id}
                        ordinal={slot.ordinal}
                        playableLimit={tileLimit}
                        upgradeHref={subscription.featureHref("multiview.expanded")}
                        requiredPlan={subscription.requiredPlanName("multiview.expanded")}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <TheaterRoomSurface
                tiles={visibleTiles}
                focusedId={focused?.id ?? null}
                activeIds={activeIds}
                passportCreditTileId={passportCreditTileId}
                maximizedTileId={player.maximizedTileId}
                lockedSlots={authoritativeLiveRoom && !player.maximizedTileId ? lockedLiveSlots : []}
                playableLimit={tileLimit}
                upgradeHref={subscription.featureHref("multiview.expanded")}
                requiredPlan={subscription.requiredPlanName("multiview.expanded")}
                onReplace={openSources}
                onDragStart={setDragTileId}
                onDropOnTile={(tileId) => {
                  if (dragTileId && dragTileId !== tileId) player.swapTiles(dragTileId, tileId);
                  setDragTileId(null);
                }}
                feedbackFor={(item) => discovery.state.feedback[item.key]?.value ?? null}
                onFeedback={(item, value) => discovery.setFeedback(item.key, value)}
              />
            )}

          </div>

          {player.chatDock !== "left" ? workspaceSidebar : null}
        </div>
        {player.chatDock === "bottom" && chatChannels.length ? (
          <section style={{ height: `min(${player.chatDockSize.bottom}px, 48dvh)` }} className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-[#0e0e11] p-2 shadow-[0_24px_80px_rgba(0,0,0,.28)]" aria-label="Chat below the player grid">
            {chat}
          </section>
        ) : null}
      </div>

      {player.chatDock === "floating" && chatChannels.length ? (
        <section style={floatingChatViewportStyle(player.chatFloatingRect)} className="fixed z-50 overflow-hidden rounded-2xl border border-white/14 bg-[#101014]/95 p-2 shadow-[0_28px_110px_rgba(0,0,0,.72)] backdrop-blur-xl" aria-label="Floating chat">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold text-white/70">Floating chat</span>
            <IconControlTooltip title="Return chat to the side panel" description="Place chat back with your room controls." placement="top">
              <button type="button" onClick={() => player.setChatDock("right")} className="grid size-8 place-items-center rounded-lg text-white/50 transition hover:bg-white/8 hover:text-white" aria-label="Return chat to the side panel"><PanelRight className="size-3.5" aria-hidden /></button>
            </IconControlTooltip>
          </div>
          <div className="h-[calc(100%-2.4rem)]">{chat}</div>
        </section>
      ) : null}

      {sourceOpen ? (
        <SourceDrawer
          sources={sources}
          query={query}
          url={url}
          intent={replaceTarget ? "replace" : sourceIntent}
          openKeys={new Set([
            ...player.tiles.map((tile) => tile.item.key),
            ...(sourceIntent === "queue" ? player.queue.map((item) => item.key) : []),
          ])}
          onQuery={setQuery}
          onUrl={setUrl}
          onAddUrl={addUrl}
          onChoose={chooseSource}
          onClose={closeSources}
        />
      ) : null}

      {setupOpen ? (
        <SetupModal
          onClose={() => setSetupOpen(false)}
          layoutName={layoutName}
          onLayoutName={setLayoutName}
          onSave={() => void save()}
          canSaveLayouts={savedLayoutsAllowed}
          savedLayoutsHref={subscription.signedIn ? "/account" : "/login?next=/multiview"}
          savedLayoutsPlan={savedLayoutsLabel}
          liveCount={Math.min(currentLive.length, tileLimit)}
          onAdd={() => { setSetupOpen(false); openSources(); }}
          onFill={() => { fillLive(); setSetupOpen(false); }}
          onShare={() => void share()}
        />
      ) : null}

      {audioPickerOpen ? (
        <AudioLeadPicker
          tiles={player.tiles.filter((tile) => tile.item.kind === "live")}
          mobile={mobile}
          onClose={() => setAudioPickerOpen(false)}
          onChoose={(tileId) => {
            for (const tile of player.tiles) player.updateTile(tile.id, { muted: tile.id !== tileId });
            player.focusTile(tileId, { takeAudio: true });
            setAudioPickerOpen(false);
          }}
        />
      ) : null}

      {notice ? (
        <div role="status" className={`fixed bottom-4 left-1/2 z-[100] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl px-4 py-2.5 text-xs font-semibold shadow-2xl ${notice.tone === "error" ? "bg-red-500 text-white" : "bg-white text-black"}`}>
          <span>{notice.text}</span>
          {notice.actionHref ? (
            <Link href={notice.actionHref as never} className="shrink-0 rounded-lg bg-black px-2.5 py-1.5 text-[10px] font-semibold text-white transition hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black">
              {notice.actionLabel ?? "Learn more"}
            </Link>
          ) : null}
        </div>
      ) : null}
    </main>
    </ChatSessionProvider>
  );
}

/** React Aria keeps these hover/focus tooltips inert for touch-only presses. */
function IconControlTooltip({
  title,
  description,
  placement = "top",
  children,
}: {
  title: string;
  description: string;
  placement?: "top" | "bottom";
  children: React.ReactElement;
}) {
  return (
    <Tooltip title={title} description={description} placement={placement} offset={6}>
      {children}
    </Tooltip>
  );
}

function ToolbarButton({
  label,
  icon: Icon,
  onClick,
  primary,
  active,
  disabled,
}: {
  label: string;
  icon: typeof Plus;
  onClick: () => void;
  primary?: boolean;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex min-h-16 min-w-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl px-2 text-[10px] font-semibold shadow-xs-skeuomorphic ring-1 ring-inset outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-35 disabled:active:scale-100 ${primary ? "bg-white text-black ring-white/90 hover:bg-white/90" : active ? "bg-white/12 text-white ring-white/20" : "bg-white/5 text-white/70 ring-white/10 hover:bg-white/10 hover:text-white hover:ring-white/20"}`}
    >
      <Icon className="size-4" aria-hidden />
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

const SIDEBAR_TABS: Array<{ id: SidebarTab; label: string; accessibleLabel: string; description: string; icon: typeof ListVideo }> = [
  { id: "details", label: "Details", accessibleLabel: "Details", description: "See the focused player and a compact overview of every open tile.", icon: Info },
  { id: "queue", label: "Up next", accessibleLabel: "Up next", description: "Review and reorder what plays after the main title.", icon: ListVideo },
  { id: "chat", label: "Chat", accessibleLabel: "Chat", description: "Open the combined chat for active Twitch players.", icon: MessageSquare },
];

function WorkspaceSidebar({
  activeTab,
  onTabChange,
  mobileOpen,
  onMobileClose,
  forceCompactDesktop = false,
  focused,
  member,
  tiles,
  chat,
  onAddQueue,
  onReplace,
}: {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  /** Keep a two-Twitch Theater stage wide until the companion is usable. */
  forceCompactDesktop?: boolean;
  focused: WorkspaceTile | null;
  member: MemberRecord | null;
  tiles: WorkspaceTile[];
  chat: React.ReactNode;
  onAddQueue: (opener?: HTMLElement | null) => void;
  onReplace: (tileId: string, opener?: HTMLElement | null) => void;
}) {
  const desktopClasses = forceCompactDesktop
    ? "2xl:sticky 2xl:top-[calc(4.75rem+var(--live-ribbon-h,0px))] 2xl:z-20 2xl:flex 2xl:h-[calc(100dvh-9rem-var(--live-ribbon-h,0px))] 2xl:w-auto 2xl:min-h-[18rem] 2xl:shadow-[0_24px_90px_rgba(0,0,0,.3)]"
    : "xl:sticky xl:top-[calc(4.75rem+var(--live-ribbon-h,0px))] xl:z-20 xl:flex xl:h-[calc(100dvh-9rem-var(--live-ribbon-h,0px))] xl:w-auto xl:min-h-[18rem] xl:shadow-[0_24px_90px_rgba(0,0,0,.3)]";
  const compactHideClass = forceCompactDesktop ? "2xl:hidden" : "xl:hidden";
  useEffect(() => {
    if (!mobileOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>("#multiview-sidebar [role='tab'][aria-selected='true']")?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onMobileClose();
        return;
      }
      if (event.key !== "Tab") return;
      const sidebar = document.getElementById("multiview-sidebar");
      const focusable = Array.from(sidebar?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ) ?? []).filter((element) => element.tabIndex >= 0 && !element.hidden && element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      window.requestAnimationFrame(() => {
        if (previousFocus?.isConnected) previousFocus.focus();
      });
    };
  }, [mobileOpen, onMobileClose]);

  const selectTab = (tab: SidebarTab, focus = false) => {
    onTabChange(tab);
    if (focus) window.requestAnimationFrame(() => document.getElementById(`multiview-tab-${tab}`)?.focus());
  };

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let destination = index;
    if (event.key === "ArrowRight") destination = (index + 1) % SIDEBAR_TABS.length;
    else if (event.key === "ArrowLeft") destination = (index - 1 + SIDEBAR_TABS.length) % SIDEBAR_TABS.length;
    else if (event.key === "Home") destination = 0;
    else if (event.key === "End") destination = SIDEBAR_TABS.length - 1;
    else return;
    event.preventDefault();
    selectTab(SIDEBAR_TABS[destination]!.id, true);
  };

  return (
    <>
      {mobileOpen ? (
        <div
          className={`fixed inset-0 z-[79] cursor-default bg-black/55 backdrop-blur-[2px] ${compactHideClass}`}
          onClick={onMobileClose}
          aria-hidden="true"
        />
      ) : null}
      <aside
      id="multiview-sidebar"
      role={mobileOpen ? "dialog" : undefined}
      aria-modal={mobileOpen ? "true" : undefined}
      aria-label="Details, Up next, and chat panel"
      className={`${mobileOpen ? "fixed inset-x-3 bottom-3 z-[80] flex h-[min(72dvh,38rem)]" : "hidden"} min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(160deg,rgba(28,28,34,.98),rgba(12,12,16,.98)_46%,rgba(9,9,12,.98))] shadow-[0_28px_100px_rgba(0,0,0,.72)] ${desktopClasses}`}
    >
      <div className="hidden shrink-0 items-center justify-between border-b border-white/8 px-3 py-2.5 xl:flex">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[.15em] text-white/38">Room companion</p>
          <p className="mt-0.5 text-[10px] text-white/62">Details, queue, and separate chats.</p>
        </div>
        <span className="grid size-7 place-items-center rounded-lg bg-white/6 text-white/50 ring-1 ring-white/10"><PanelRight className="size-3.5" aria-hidden /></span>
      </div>
      <div className="flex shrink-0 items-center gap-1 border-b border-white/8 p-2">
        <div role="tablist" aria-label="Multiview sidebar" className="grid min-w-0 flex-1 grid-cols-3 gap-1 rounded-xl bg-white/[0.035] p-1">
          {SIDEBAR_TABS.map((tab, index) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <IconControlTooltip
                key={tab.id}
                title={tab.accessibleLabel}
                description={tab.description}
                placement="bottom"
              >
                <button
                  id={`multiview-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-label={tab.accessibleLabel}
                  aria-selected={selected}
                  aria-controls={`multiview-panel-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => selectTab(tab.id)}
                  onKeyDown={(event) => onTabKeyDown(event, index)}
                  className={`group inline-flex min-h-11 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-1.5 text-[10px] font-semibold transition duration-150 xl:min-h-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${selected ? "bg-white text-black shadow-sm" : "text-white/48 hover:-translate-y-px hover:bg-white/8 hover:text-white active:translate-y-0"}`}
                >
                  <Icon className="size-3.5 shrink-0" aria-hidden />
                  <span className="hidden truncate min-[300px]:inline">{tab.label}</span>
                </button>
              </IconControlTooltip>
            );
          })}
        </div>
        <IconControlTooltip title="Close panel" description="Return to the multiview player grid." placement="bottom">
          <button type="button" onClick={onMobileClose} className={`grid size-11 shrink-0 place-items-center rounded-xl text-white/50 hover:bg-white/8 hover:text-white ${compactHideClass}`} aria-label="Close sidebar">
            <X className="size-4" aria-hidden />
          </button>
        </IconControlTooltip>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div
          id="multiview-panel-queue"
          role="tabpanel"
          aria-labelledby="multiview-tab-queue"
          tabIndex={activeTab === "queue" ? 0 : -1}
          hidden={activeTab !== "queue"}
          className="h-full min-h-0 outline-none"
        >
          <UpNextPanel onAdd={onAddQueue} />
        </div>
        <div
          id="multiview-panel-chat"
          role="tabpanel"
          aria-labelledby="multiview-tab-chat"
          tabIndex={activeTab === "chat" ? 0 : -1}
          hidden={activeTab !== "chat"}
          className="h-full min-h-0 outline-none"
        >
          <div className="h-full min-h-0 p-2">{chat}</div>
        </div>
        <div
          id="multiview-panel-details"
          role="tabpanel"
          aria-labelledby="multiview-tab-details"
          tabIndex={activeTab === "details" ? 0 : -1}
          hidden={activeTab !== "details"}
          className="h-full min-h-0 outline-none"
        >
          <DetailsPanel focused={focused} member={member} tiles={tiles} onReplace={onReplace} />
        </div>
      </div>
      </aside>
    </>
  );
}

function UpNextPanel({ onAdd }: { onAdd: (opener?: HTMLElement | null) => void }) {
  const player = usePlayer();
  const queueBehavior = player.autoplayMode === "keep-grid-full"
    ? "The next player that ends takes the first one."
    : player.autoplayMode === "off"
      ? "Autoplay is off; choose a title to play it now."
      : "The first title plays next in Main.";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-white/8 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white">Up Next</p>
            <p className="mt-1 text-[10px] leading-4 text-white/38">
              {player.queue.length
                ? `${player.queue.length} title${player.queue.length === 1 ? "" : "s"} ready. ${queueBehavior}`
                : "Add a title or let recommendations fill the room."}
            </p>
          </div>
          <button type="button" onClick={(event) => onAdd(event.currentTarget)} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 text-[10px] font-semibold text-black xl:min-h-9">
            <Plus className="size-3.5" aria-hidden /> Add
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <WatchSelect
              ariaLabel="Autoplay mode"
              value={player.autoplayMode}
              onChange={(value) => player.setAutoplayMode(value as typeof player.autoplayMode)}
              options={AUTOPLAY_MODES.map((entry) => ({ id: entry.id, label: entry.label }))}
              compact
            />
          </div>
          {player.queue.length ? (
            <button type="button" onClick={player.clearQueue} className="min-h-11 rounded-lg px-2.5 text-[10px] font-medium text-white/45 ring-1 ring-white/10 hover:bg-white/7 hover:text-white xl:min-h-9">Clear</button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="space-y-2">
          {player.queue.map((item, index) => (
            <article key={item.key} className="group rounded-xl bg-white/[0.035] p-2 ring-1 ring-white/8">
              <button type="button" onClick={() => player.playFromQueue(item.key)} className="flex w-full min-w-0 items-center gap-2 text-left">
                <span className="relative block aspect-video w-20 shrink-0 overflow-hidden rounded-lg bg-black">
                  {item.poster ? <img src={item.poster} alt="" className="h-full w-full object-cover" /> : null}
                  <span className="absolute inset-0 grid place-items-center bg-black/15 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"><Play className="size-4 fill-white text-white" aria-hidden /></span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-white/32">{index === 0 ? "Next" : `${index + 1} · ${item.platform}`}</span>
                  <span className="mt-0.5 block line-clamp-2 text-[11px] font-semibold leading-4 text-white/80">{item.title}</span>
                  {item.recommendationReason ? <span className="mt-0.5 block truncate text-[9px] text-white/32">{item.recommendationReason}</span> : null}
                </span>
              </button>
              <div className="mt-2 flex justify-end gap-1 border-t border-white/6 pt-1.5">
                <IconControlTooltip title="Move earlier" description="Move this title one place up in Up Next.">
                  <button type="button" disabled={index === 0} onClick={() => player.moveQueueItem(item.key, -1)} className="grid size-11 place-items-center rounded-lg text-white/35 hover:bg-white/8 hover:text-white disabled:opacity-20 xl:size-8" aria-label={`Move ${item.title} earlier`}><ChevronDown className="size-3.5 rotate-180" aria-hidden /></button>
                </IconControlTooltip>
                <IconControlTooltip title="Move later" description="Move this title one place down in Up Next.">
                  <button type="button" disabled={index === player.queue.length - 1} onClick={() => player.moveQueueItem(item.key, 1)} className="grid size-11 place-items-center rounded-lg text-white/35 hover:bg-white/8 hover:text-white disabled:opacity-20 xl:size-8" aria-label={`Move ${item.title} later`}><ChevronDown className="size-3.5" aria-hidden /></button>
                </IconControlTooltip>
                <IconControlTooltip title="Remove from Up Next" description="Take this title out of the queue.">
                  <button type="button" onClick={() => player.removeFromQueue(item.key)} className="grid size-11 place-items-center rounded-lg text-white/35 hover:bg-white/8 hover:text-white xl:size-8" aria-label={`Remove ${item.title} from Up Next`}><X className="size-3.5" aria-hidden /></button>
                </IconControlTooltip>
              </div>
            </article>
          ))}
        </div>
        {player.queue.length === 0 ? (
          <div className="grid min-h-52 place-items-center p-5 text-center">
            <div>
              <ListVideo className="mx-auto size-5 text-white/22" aria-hidden />
              <p className="mt-3 text-xs font-semibold text-white/60">Nothing queued yet</p>
              <p className="mt-1 text-[10px] leading-4 text-white/35">Pick the next title yourself, or keep autoplay on for recommendations.</p>
              <button type="button" onClick={(event) => onAdd(event.currentTarget)} className="mt-4 min-h-10 rounded-xl bg-white px-4 text-[11px] font-semibold text-black">Add to Up Next</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DetailsPanel({
  focused,
  member,
  tiles,
  onReplace,
}: {
  focused: WorkspaceTile | null;
  member: MemberRecord | null;
  tiles: WorkspaceTile[];
  onReplace: (tileId: string, opener?: HTMLElement | null) => void;
}) {
  const player = usePlayer();
  const makeFocusedMain = () => {
    if (!focused) return;
    for (const tile of player.tiles) {
      const pinned = tile.id === focused.id;
      if (tile.pinned !== pinned) player.updateTile(tile.id, { pinned });
    }
    player.focusTile(focused.id, { takeAudio: false });
  };
  if (!focused) {
    return <div className="grid h-full min-h-52 place-items-center p-6 text-center text-xs text-white/38">Add a player to see its details.</div>;
  }
  const source = focused.item.sourceUrl ?? focused.item.url;
  const duration = focused.item.kind === "live"
    ? "Live"
    : focused.item.durationSeconds && focused.item.durationSeconds > 0
      ? formatPlaybackTime(focused.item.durationSeconds)
      : "—";
  return (
    <div className="h-full overflow-y-auto overscroll-contain p-2.5 [scrollbar-gutter:stable]">
      <section className="rounded-xl bg-white/[0.035] p-2.5 ring-1 ring-white/8" aria-label="Focused player details">
        <div className="flex min-w-0 gap-2.5">
          <span className="relative block aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-black ring-1 ring-white/10">
            {focused.item.poster ? <img src={focused.item.poster} alt="" className="h-full w-full object-cover" /> : null}
            {focused.item.kind === "live" ? <span className="absolute left-1.5 top-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-white">Live</span> : null}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-white/38">{mediaTypeLabel(focused.item)} · {platformLabel(focused.item)}</p>
            <h2 className="mt-1 line-clamp-2 text-[13px] font-semibold leading-4 text-white">{focused.item.title}</h2>
            <p className="mt-1 truncate text-[10px] text-white/48">{focused.item.memberLabel}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-2 text-[9px]">
              <div className="min-w-0"><dt className="uppercase tracking-[0.1em] text-white/30">Length</dt><dd className="mt-0.5 truncate font-semibold text-white/68">{duration}</dd></div>
              <div className="min-w-0"><dt className="uppercase tracking-[0.1em] text-white/30">Audio</dt><dd className="mt-0.5 truncate font-semibold text-white/68">{focused.muted ? "Muted" : "On"}</dd></div>
            </dl>
          </div>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2" aria-label="Focused player actions">
          <button type="button" onClick={makeFocusedMain} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-white px-2 text-[10px] font-semibold text-black transition hover:bg-white/88 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><Radio className="size-3.5" aria-hidden /> Make main</button>
          <button type="button" onClick={(event) => onReplace(focused.id, event.currentTarget)} className="min-h-10 rounded-lg px-2 text-[10px] font-semibold text-white/68 ring-1 ring-white/12 transition hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Replace</button>
          <button type="button" onClick={() => player.updateTile(focused.id, { fit: focused.fit === "cover" ? "contain" : "cover" })} className="min-h-9 rounded-lg px-2 text-[10px] font-medium text-white/52 ring-1 ring-white/10 transition hover:bg-white/8 hover:text-white">{focused.fit === "cover" ? "Fit video" : "Fill tile"}</button>
          {source ? <a href={source} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-[10px] font-medium text-white/52 ring-1 ring-white/10 transition hover:bg-white/8 hover:text-white">Open source <ExternalLink className="size-3" aria-hidden /></a> : <span />}
        </div>
      </section>

      {member ? (
        <section className="mt-2 flex min-w-0 items-center gap-2.5 rounded-xl bg-white/[0.025] p-2.5 ring-1 ring-white/8" aria-label={`${member.stageName} details`}>
          <img src={member.portrait} alt="" className="size-8 shrink-0 rounded-lg object-cover ring-1 ring-white/12" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-semibold text-white/86">{member.stageName}</p>
            <p className="mt-0.5 truncate text-[9px] text-white/36">{member.roles?.join(" · ") || "CORE creator"}</p>
          </div>
          <Link href={`/channels/${member.slug}` as never} className="shrink-0 rounded-lg px-2 py-1.5 text-[9px] font-semibold text-white/60 ring-1 ring-white/10 transition hover:bg-white/8 hover:text-white">Channel</Link>
        </section>
      ) : null}

      {tiles.length > 1 ? (
        <section className="mt-3" aria-label="Open players in this room">
          <div className="flex items-center justify-between gap-3 px-0.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/38">Open players</p>
            <span className="text-[9px] tabular-nums text-white/36">{tiles.length}</span>
          </div>
          <div className="mt-1.5 flex snap-x gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tiles.map((tile) => {
              const selected = tile.id === focused.id;
              return (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => player.focusTile(tile.id, { takeAudio: false })}
                  aria-pressed={selected}
                  className={`group flex w-28 shrink-0 snap-start flex-col overflow-hidden rounded-lg text-left ring-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${selected ? "bg-white/12 text-white ring-white/25" : "bg-white/[0.025] text-white/65 ring-white/8 hover:bg-white/[0.07] hover:text-white hover:ring-white/18"}`}
                >
                  <span className="relative block aspect-video w-full bg-black">{tile.item.poster ? <img src={tile.item.poster} alt="" className="h-full w-full object-cover transition duration-150 group-hover:scale-[1.03]" /> : null}{tile.item.kind === "live" ? <span className="absolute left-1 top-1 size-1.5 rounded-full bg-red-500" /> : null}</span>
                  <span className="block truncate px-1.5 py-1 text-[9px] font-semibold">{tile.item.memberLabel}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <button type="button" onClick={() => player.removeTile(focused.id)} className="mt-2 flex min-h-9 w-full items-center justify-between rounded-lg px-2.5 text-left text-[9px] font-medium text-white/38 ring-1 ring-white/8 transition hover:bg-red-500/10 hover:text-red-200 hover:ring-red-400/20">Remove player <Trash2 className="size-3" aria-hidden /></button>
    </div>
  );
}

function EmptyStage({ liveCount, onAdd, onFill }: { liveCount: number; onAdd: () => void; onFill: () => void }) {
  return (
    <section className="grid min-h-[62dvh] place-items-center rounded-3xl border border-dashed border-white/12 bg-gradient-to-b from-white/[0.035] to-transparent p-6 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/7 ring-1 ring-white/10"><LayoutGrid className="size-5 text-white/65" /></span>
        <h2 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">Build your room</h2>
        <p className="mt-2 text-sm leading-6 text-white/45">Start with one title. Add more when you want them—the advanced grid stays out of the way until then.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={onAdd} className="min-h-11 rounded-xl bg-white px-5 text-sm font-semibold text-black">Add a player</button>
          {liveCount ? <button type="button" onClick={onFill} className="min-h-11 rounded-xl px-5 text-sm font-semibold text-white ring-1 ring-white/15">Watch live channels</button> : <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-xl px-5 text-sm font-semibold text-white ring-1 ring-white/15">No one is live · Refresh</button>}
        </div>
      </div>
    </section>
  );
}

type RoomTileWithRect = WorkspaceTile & { rect?: NormalizedRect };
type StudioWorkspaceSnapshot = WorkspaceSnapshot & {
  snapDensity?: number;
  tiles: RoomTileWithRect[];
};

function roomTileRect(tile: WorkspaceTile, columns = 12, density = 12): NormalizedRect {
  const known = (tile as RoomTileWithRect).rect;
  return known ?? gridTileToNormalizedRect(tile, columns, density);
}

function roomRectStyle(rect: NormalizedRect, density = 12): React.CSSProperties {
  const position = normalizedRectToGridPosition(rect, density, density);
  return {
    gridColumn: `${position.col} / span ${position.colSpan}`,
    gridRow: `${position.row} / span ${position.rowSpan}`,
    minHeight: 0,
  };
}

function roomTileStyle(tile: WorkspaceTile, density = 12): React.CSSProperties {
  return roomRectStyle(roomTileRect(tile, density, density), density);
}

/**
 * The room deliberately keeps every PlayerTile in one keyed React list.  A
 * promotion only changes CSS grid geometry, so a Twitch/YouTube iframe never
 * has to move between React parents (which would restart the provider
 * player).  The main tile borrows the Theater visual hierarchy while the
 * companions stay immediately available in the same surface.
 */
function TheaterRoomSurface({
  tiles,
  focusedId: _focusedId,
  activeIds,
  passportCreditTileId,
  maximizedTileId,
  lockedSlots,
  playableLimit,
  upgradeHref,
  requiredPlan,
  onReplace,
  onDragStart,
  onDropOnTile,
  feedbackFor,
  onFeedback,
}: {
  tiles: WorkspaceTile[];
  focusedId: string | null;
  activeIds: Set<string>;
  passportCreditTileId: string | null;
  maximizedTileId: string | null;
  lockedSlots: Array<{ id: string; ordinal: number }>;
  playableLimit: number;
  upgradeHref: string;
  requiredPlan: string;
  onReplace: (id: string, opener?: HTMLElement | null) => void;
  onDragStart: (id: string | null) => void;
  onDropOnTile: (tileId: string) => void;
  feedbackFor: (item: Playable) => WatchFeedbackValue | null;
  onFeedback: (item: Playable, value: WatchFeedbackValue | null) => void;
}) {
  const player = usePlayer();
  // Selection drives details and audio, but never moves the room under the
  // viewer. A pinned tile is the deliberate main view; otherwise the first
  // source keeps the main slot until the user promotes another one.
  const main = tiles.find((tile) => tile.pinned) ?? tiles[0] ?? null;
  const companions = tiles.filter((tile) => tile.id !== main?.id);
  const mainMember = main
    ? MEMBERS.find((entry) => entry.slug === main.item.memberSlug || entry.twitchLogin.toLowerCase() === main.item.twitchLogin?.toLowerCase())
    : null;
  const pairView = tiles.length === 2 && lockedSlots.length === 0 && !maximizedTileId;
  const pairContainsTwitch = pairView && tiles.some((tile) => tile.item.platform === "twitch");
  const hasCompanions = companions.length + lockedSlots.length > 0;
  const studioDensity = Math.max(4, Math.min(24, Math.round(player.snapDensity || player.gridColumns || 12)));
  const sourceGeometry = useMemo(
    () => tiles.map((tile) => ({ id: tile.id, rect: roomTileRect(tile, studioDensity, studioDensity) })),
    [studioDensity, tiles],
  );
  // A direct Studio edit changes the preset to freeform. This extra
  // comparison also protects imported/legacy snapshots whose data still says
  // `theater-first` even though their saved rectangles were customized.
  const hasCustomGeometry = !roomLayoutMatchesPreset(player.layoutPreset, sourceGeometry, studioDensity);
  const presetGeometry = useMemo(
    () => resolvePresetRoomLayout(
      player.layoutPreset,
      tiles.map((tile) => ({ id: tile.id })),
      {
        focusedId: main?.id ?? null,
        snapDensity: studioDensity,
        twitchSafeTheaterPair: pairContainsTwitch,
      },
    ),
    [main?.id, pairContainsTwitch, player.layoutPreset, studioDensity, tiles],
  );
  const presetGeometryById = useMemo(
    () => new Map(presetGeometry.map((entry) => [entry.id, entry.rect])),
    [presetGeometry],
  );
  const lockedGeometryById = useMemo(() => {
    if (!lockedSlots.length) return new Map<string, NormalizedRect>();
    const ids = [
      ...tiles.map((tile) => ({ id: tile.id })),
      ...lockedSlots.map((slot) => ({ id: slot.id })),
    ];
    return new Map(resolvePresetRoomLayout("theater-first", ids, {
      focusedId: main?.id ?? null,
      snapDensity: studioDensity,
      twitchSafeTheaterPair: pairContainsTwitch,
    }).map((entry) => [entry.id, entry.rect]));
  }, [lockedSlots, main?.id, pairContainsTwitch, studioDensity, tiles]);

  const tileStyle = (tile: WorkspaceTile): React.CSSProperties => {
    if (hasCustomGeometry) return roomTileStyle(tile, studioDensity);
    return roomRectStyle(presetGeometryById.get(tile.id) ?? roomTileRect(tile, studioDensity, studioDensity), studioDensity);
  };

  const lockedStyle = (index: number): React.CSSProperties => {
    const slot = lockedSlots[index];
    const fallback = presetGeometry[index + tiles.length]?.rect
      ?? roomTileRect(tiles.at(-1) ?? tiles[0]!, studioDensity, studioDensity);
    return roomRectStyle(slot ? lockedGeometryById.get(slot.id) ?? fallback : fallback, studioDensity);
  };

  return (
    <section
      aria-label="Theater multiview room"
      className="relative isolate aspect-video min-h-[20rem] overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#070709] shadow-[0_34px_120px_rgba(0,0,0,.56)] sm:min-h-[26rem]"
    >
      {main && player.ambientLighting && !player.dataSaver && player.accessibilityPreset !== "calm" ? (
        <PlayerAmbientBloom source={main.item.poster} accent={mainMember?.accent ?? "#e9006f"} frame />
      ) : null}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(5,5,7,.12),rgba(5,5,7,.42))]" aria-hidden />
      <div
        className="relative z-[2] grid h-full min-h-[inherit] gap-2 p-2.5 sm:gap-3 sm:p-3"
        style={{
          gridTemplateColumns: `repeat(${studioDensity}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${studioDensity}, minmax(0, 1fr))`,
        }}
      >
        {tiles.map((tile) => (
          <PlayerTile
            key={tile.id}
            tile={tile}
            active={activeIds.has(tile.id)}
            focused={tile.id === main?.id}
            passportCredit={tile.id === passportCreditTileId}
            maximized={tile.id === maximizedTileId}
            theater
            onReplace={onReplace}
            onDragStart={onDragStart}
            onDrop={() => onDropOnTile(tile.id)}
            feedback={feedbackFor(tile.item)}
            onFeedback={onFeedback}
            style={tileStyle(tile)}
          />
        ))}
        {lockedSlots.map((slot, index) => (
          <LockedLiveTile
            key={slot.id}
            ordinal={slot.ordinal}
            playableLimit={playableLimit}
            upgradeHref={upgradeHref}
            requiredPlan={requiredPlan}
            style={lockedStyle(index)}
          />
        ))}
      </div>
      {hasCompanions ? (
        <div className="pointer-events-none absolute left-5 top-5 z-30 hidden rounded-full bg-black/55 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.13em] text-white/65 ring-1 ring-white/10 backdrop-blur-sm md:block">
          Theater view · {tiles.length} sources
        </div>
      ) : null}
    </section>
  );
}

function MobileStage({
  tile,
  tiles,
  active,
  passportCredit,
  onReplace,
  feedback,
  onFeedback,
}: {
  tile: WorkspaceTile;
  tiles: WorkspaceTile[];
  active: boolean;
  passportCredit: boolean;
  onReplace: (id: string, opener?: HTMLElement | null) => void;
  feedback: WatchFeedbackValue | null;
  onFeedback: (item: Playable, value: WatchFeedbackValue | null) => void;
}) {
  const player = usePlayer();
  const portrait = contentShape(tile.item) === "portrait";
  const member = MEMBERS.find((entry) => entry.slug === tile.item.memberSlug || entry.twitchLogin.toLowerCase() === tile.item.twitchLogin?.toLowerCase());
  const ambientActive = player.ambientLighting && !player.dataSaver && player.accessibilityPreset !== "calm";
  return (
    <section aria-label="Mobile player view">
      <div className="relative isolate">
        {ambientActive ? <PlayerAmbientBloom source={tile.item.poster} accent={member?.accent ?? "#e9006f"} frame /> : null}
        <div className="relative z-[2]">
          <PlayerTile
            tile={tile}
            active={active}
            focused
            passportCredit={passportCredit}
            maximized
            mobile
            theater
            onReplace={onReplace}
            onDragStart={() => {}}
            onDrop={() => {}}
            feedback={feedback}
            onFeedback={onFeedback}
            style={portrait
              ? { aspectRatio: "9 / 16", width: "min(100%, 19rem)", marginInline: "auto" }
              : { height: "clamp(15rem, 78vw, 20rem)" }}
          />
        </div>
      </div>
      {tiles.length > 1 ? (
        <div className="mt-3 flex snap-x gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tiles.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => player.focusTile(entry.id)}
              aria-pressed={entry.id === tile.id}
              className={`flex w-36 shrink-0 cursor-pointer snap-start items-center gap-2 rounded-lg p-2 text-left shadow-xs-skeuomorphic ring-1 ring-inset outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.98] ${entry.id === tile.id ? "bg-white/10 text-white ring-white/30" : "bg-white/[0.035] text-white/75 ring-white/10 hover:bg-white/8 hover:text-white hover:ring-white/20"}`}
            >
              <span className="relative block aspect-video w-16 shrink-0 overflow-hidden rounded-lg bg-black">
                {entry.item.poster ? <img src={entry.item.poster} alt="" className="h-full w-full object-cover" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-semibold">{entry.item.memberLabel}</span>
                <span className="block truncate text-[10px] text-white/40">{entry.muted ? "Muted" : "Playing audio"}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/**
 * A locked slot is intentionally not a PlayerTile. Its artwork is synthetic
 * and it receives no provider identity, poster, URL, or embed configuration.
 * Removing this overlay in DevTools therefore reveals no hidden player.
 */
function LockedLiveTile({
  ordinal,
  playableLimit,
  upgradeHref,
  requiredPlan,
  style,
}: {
  ordinal: number;
  playableLimit: number;
  upgradeHref: string;
  requiredPlan: string;
  style?: React.CSSProperties;
}) {
  return (
    <article
      style={style}
      data-locked-live-slot
      aria-label={`Live stream ${ordinal} is locked by the multiview membership limit`}
      className="relative isolate flex min-h-[18rem] overflow-hidden rounded-xl bg-[#0b0b0e] p-5 shadow-xl ring-1 ring-white/10"
    >
      <div aria-hidden className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_20%_15%,rgba(236,0,99,.22),transparent_38%),radial-gradient(circle_at_78%_74%,rgba(94,92,230,.24),transparent_42%),linear-gradient(135deg,#15151a,#08080a)]">
        <span className="absolute -left-12 top-1/4 size-48 rounded-full bg-fuchsia-500/15 blur-3xl" />
        <span className="absolute -right-10 bottom-0 size-56 rounded-full bg-indigo-400/15 blur-3xl" />
        <span className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:34px_34px]" />
      </div>
      <div className="relative z-10 m-auto flex max-w-xs flex-col items-center text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-black/45 text-white ring-1 ring-white/15 backdrop-blur-xl">
          <LockKeyhole className="size-5" aria-hidden />
        </span>
        <p className="mt-4 text-sm font-semibold text-white">Live stream locked</p>
        <p className="mt-1 text-xs leading-5 text-white/55">
          Your current tier supports {playableLimit} simultaneous players. {requiredPlan} unlocks the full live room.
        </p>
        <Link
          href={upgradeHref as never}
          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-white px-4 text-xs font-semibold text-black transition hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Unlock multiview
        </Link>
      </div>
    </article>
  );
}

type PlayerTileProps = {
  tile: WorkspaceTile;
  active: boolean;
  focused: boolean;
  passportCredit: boolean;
  maximized: boolean;
  mobile?: boolean;
  /** The Theater room owns the tile's dimensions; media remains contained inside it. */
  theater?: boolean;
  onReplace: (id: string, opener?: HTMLElement | null) => void;
  onDragStart: (id: string) => void;
  onDrop: () => void;
  feedback: WatchFeedbackValue | null;
  onFeedback: (item: Playable, value: WatchFeedbackValue | null) => void;
  style: React.CSSProperties;
};

/**
 * PlayerProvider deliberately owns a large room snapshot.  Keeping the
 * provider read in this tiny wrapper means a chat preference or inspector
 * edit does not also render every expensive provider frame.  The memoized
 * surface receives only the player fields it can actually display/control.
 */
type PlayerTileRuntime = Pick<
  PlayerContextValue,
  | "audioDescription"
  | "captionsEnabled"
  | "channel"
  | "dataSaver"
  | "finishTile"
  | "focusTile"
  | "gridColumns"
  | "playbackRate"
  | "qualityPreference"
  | "removeTile"
  | "setMaximizedTileId"
  | "updateTile"
> & {
  makeMain: (id: string, options?: { takeAudio?: boolean }) => void;
};

function PlayerTile(props: PlayerTileProps) {
  const player = usePlayer();
  const makeMain = useCallback((id: string, options?: { takeAudio?: boolean }) => {
    for (const candidate of player.tiles) {
      const pinned = candidate.id === id;
      if (candidate.pinned !== pinned) player.updateTile(candidate.id, { pinned });
    }
    player.focusTile(id, options);
  }, [player.focusTile, player.tiles, player.updateTile]);
  const actionsRef = useRef({
    onReplace: props.onReplace,
    onDragStart: props.onDragStart,
    onDrop: props.onDrop,
    onFeedback: props.onFeedback,
  });
  actionsRef.current = {
    onReplace: props.onReplace,
    onDragStart: props.onDragStart,
    onDrop: props.onDrop,
    onFeedback: props.onFeedback,
  };

  const stableActions = useMemo(() => ({
    onReplace: (...args: Parameters<PlayerTileProps["onReplace"]>) => actionsRef.current.onReplace(...args),
    onDragStart: (...args: Parameters<PlayerTileProps["onDragStart"]>) => actionsRef.current.onDragStart(...args),
    onDrop: () => actionsRef.current.onDrop(),
    onFeedback: (...args: Parameters<PlayerTileProps["onFeedback"]>) => actionsRef.current.onFeedback(...args),
  }), []);
  const runtime = useMemo<PlayerTileRuntime>(() => ({
    audioDescription: player.audioDescription,
    captionsEnabled: player.captionsEnabled,
    channel: player.channel,
    dataSaver: player.dataSaver,
    finishTile: player.finishTile,
    focusTile: player.focusTile,
    gridColumns: player.gridColumns,
    playbackRate: player.playbackRate,
    qualityPreference: player.qualityPreference,
    removeTile: player.removeTile,
    setMaximizedTileId: player.setMaximizedTileId,
    updateTile: player.updateTile,
    makeMain,
  }), [
    player.audioDescription,
    player.captionsEnabled,
    player.channel,
    player.dataSaver,
    player.finishTile,
    player.focusTile,
    player.gridColumns,
    player.playbackRate,
    player.qualityPreference,
    player.removeTile,
    player.setMaximizedTileId,
    player.updateTile,
    makeMain,
  ]);

  return <PlayerTileSurface {...props} {...stableActions} player={runtime} />;
}

function sameTileStyle(left: React.CSSProperties, right: React.CSSProperties) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => left[key as keyof React.CSSProperties] === right[key as keyof React.CSSProperties]);
}

const PlayerTileSurface = memo(function PlayerTileSurface({
  tile,
  active,
  focused,
  passportCredit,
  maximized,
  mobile = false,
  theater = false,
  onReplace,
  onDragStart,
  onDrop,
  feedback,
  onFeedback,
  style,
  player,
}: PlayerTileProps & { player: PlayerTileRuntime }) {
  const { trackTick, checkpoint, markComplete } = useWatchProgress();
  const [moreOpen, setMoreOpen] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [inViewport, setInViewport] = useState(true);
  const [parent, setParent] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [pipAvailable, setPipAvailable] = useState(false);
  const [tileProgress, setTileProgress] = useState({
    position: 0,
    duration: tile.item.durationSeconds ?? 0,
  });
  const [isTilePlaying, setIsTilePlaying] = useState(false);
  const shellRef = useRef<HTMLElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const positionRef = useRef(0);
  const durationRef = useRef(tile.item.durationSeconds ?? 0);
  const playingRef = useRef(false);
  const timedEmbedRef = useRef(false);
  const finishedRef = useRef(false);
  const tooSmallForTwitch = !mobile
    && tile.item.platform === "twitch"
    && size.width > 0
    && (size.width < 400 || size.height < 300);
  const standby = tile.standby || !active || tooSmallForTwitch;
  const readPresenceTimeMs = useCallback(
    () => Math.max(0, positionRef.current * 1_000),
    [],
  );

  const checkpointTile = useCallback(() => {
    if (tile.item.kind === "live" || positionRef.current <= 0) return;
    const duration = durationRef.current;
    checkpoint(
      tile.item.key,
      tile.item.kind,
      tile.item.memberSlug,
      duration > 0 ? Math.min(0.99, positionRef.current / duration) : 0,
      positionRef.current,
      duration,
      tile.item.platform,
    );
  }, [checkpoint, tile.item.key, tile.item.kind, tile.item.memberSlug, tile.item.platform]);

  const finishPlayback = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    playingRef.current = false;
    setIsTilePlaying(false);
    if (tile.item.kind !== "live") {
      if (passportCredit) {
        markComplete(
          tile.item.key,
          tile.item.kind,
          tile.item.memberSlug,
          positionRef.current,
          durationRef.current,
          tile.item.platform,
        );
      } else {
        checkpoint(
          tile.item.key,
          tile.item.kind,
          tile.item.memberSlug,
          1,
          positionRef.current,
          durationRef.current,
          tile.item.platform,
        );
      }
    }
    player.finishTile(tile.id);
  }, [checkpoint, markComplete, passportCredit, player, tile.id, tile.item.key, tile.item.kind, tile.item.memberSlug, tile.item.platform]);

  useEffect(() => {
    setParent(window.location.hostname);
    setOrigin(window.location.origin);
    const shell = shellRef.current;
    if (!shell || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  // Provider iframes stay mounted while a room is rearranged—unmounting them
  // makes live streams restart—but offscreen tiles do not need to run polling
  // or autoplay retries.  A generous margin means a tile is ready before it
  // scrolls into view without spending background work on an entire room.
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setInViewport(entry.isIntersecting);
    }, { rootMargin: "180px 0px", threshold: 0.01 });
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = videoRef.current;
    if (!media) return;
    media.volume = tile.volume;
    media.muted = tile.muted;
    media.playbackRate = player.playbackRate;
    for (let index = 0; index < media.textTracks.length; index += 1) {
      const track = media.textTracks[index];
      if (track) track.mode = player.captionsEnabled && index === 0 ? "showing" : "disabled";
    }
  }, [player.captionsEnabled, player.playbackRate, tile.muted, tile.volume]);

  useEffect(() => {
    positionRef.current = 0;
    durationRef.current = tile.item.durationSeconds ?? 0;
    playingRef.current = false;
    setIsTilePlaying(false);
    setTileProgress({ position: 0, duration: tile.item.durationSeconds ?? 0 });
    timedEmbedRef.current = false;
    finishedRef.current = false;
  }, [tile.item.durationSeconds, tile.item.key]);

  useEffect(() => {
    if (standby) {
      if (playingRef.current) checkpointTile();
      playingRef.current = false;
      setIsTilePlaying(false);
      return;
    }
    const interval = window.setInterval(() => {
      if (!playingRef.current || !inViewport || document.visibilityState !== "visible") return;
      // YouTube/TikTok/native video continuously report their playhead. For
      // opaque official embeds (for example a Twitch clip), elapsed active
      // viewing time is the best data the provider makes available.
      if (!timedEmbedRef.current && !videoRef.current) positionRef.current += 15;
      const duration = durationRef.current;
      const progress = tile.item.kind === "live" || duration <= 0
        ? 0
        : Math.min(0.99, positionRef.current / duration);
      if (passportCredit) {
        trackTick(
          tile.item.key,
          tile.item.kind,
          tile.item.memberSlug,
          15,
          progress,
          positionRef.current,
          duration,
          tile.item.platform,
        );
      } else {
        checkpoint(
          tile.item.key,
          tile.item.kind,
          tile.item.memberSlug,
          progress,
          positionRef.current,
          duration,
          tile.item.platform,
        );
      }
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [checkpoint, checkpointTile, inViewport, passportCredit, standby, tile.item.key, tile.item.kind, tile.item.memberSlug, tile.item.platform, trackTick]);

  useEffect(() => () => checkpointTile(), [checkpointTile]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      let message: unknown = event.data;
      if (typeof message === "string") {
        try { message = JSON.parse(message); } catch { return; }
      }
      if (!message || typeof message !== "object") return;
      const value = message as Record<string, unknown>;
      const info = value.info;
      if (tile.item.youtubeId) {
        if (value.event === "infoDelivery" && info && typeof info === "object") {
          const detail = info as Record<string, unknown>;
          timedEmbedRef.current = true;
          if (typeof detail.currentTime === "number") positionRef.current = detail.currentTime;
          if (typeof detail.duration === "number") durationRef.current = detail.duration;
          setTileProgress({ position: positionRef.current, duration: durationRef.current });
          if (detail.playerState === 1) {
            playingRef.current = true;
            setIsTilePlaying(true);
          }
          if (detail.playerState === 2) {
            playingRef.current = false;
            setIsTilePlaying(false);
            checkpointTile();
          }
          if (detail.playerState === 0) finishPlayback();
        }
        if (value.event === "onStateChange") {
          if (info === 1) {
            playingRef.current = true;
            setIsTilePlaying(true);
          }
          if (info === 2) {
            playingRef.current = false;
            setIsTilePlaying(false);
            checkpointTile();
          }
          if (info === 0) finishPlayback();
        }
      }
      if (value["x-tiktok-player"] === true) {
        timedEmbedRef.current = true;
        if (value.type === "onCurrentTime" && value.value && typeof value.value === "object") {
          const detail = value.value as Record<string, unknown>;
          if (typeof detail.currentTime === "number") positionRef.current = detail.currentTime;
          if (typeof detail.duration === "number") durationRef.current = detail.duration;
          setTileProgress({ position: positionRef.current, duration: durationRef.current });
        }
        if (value.type === "onStateChange") {
          if (value.value === 1) {
            playingRef.current = true;
            setIsTilePlaying(true);
          }
          if (value.value === 2) {
            playingRef.current = false;
            setIsTilePlaying(false);
            checkpointTile();
          }
          if (value.value === 0) finishPlayback();
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [checkpointTile, finishPlayback, tile.item.youtubeId]);

  const src = embedFor(tile.item, {
    parent,
    origin,
    // Every multiview source enters through the muted autoplay path. This is
    // required for Twitch/YouTube to start without a provider Play click;
    // room audio can still be enabled intentionally from the CORE controls.
    autoplay: true,
    muted: tile.muted,
    // A room is a queue of full programs, not a hover preview. Muted
    // provider embeds otherwise inherit embedFor's preview-loop default and
    // restart the same YouTube/TikTok item forever instead of advancing the
    // 24/7 channel or room queue.
    loop: false,
    // Provider UI stays behind the CORE hover controls so every tile behaves
    // consistently across YouTube, Twitch, and native media.
    controls: false,
    startSeconds: tile.delaySeconds,
  });
  const photo = tile.item.format === "photo"
    ? tile.item.mediaUrl ?? tile.item.poster ?? tile.item.url
    : null;
  const nativeSources = tile.item.qualities?.filter((source) => playableNativeUrl(source.src)) ?? [];
  const sortedNativeSources = [...nativeSources].sort(
    (left, right) => (left.width ?? left.bitrate ?? 0) - (right.width ?? right.bitrate ?? 0),
  );
  const preferredNative = player.audioDescription && playableNativeUrl(tile.item.audioDescriptionUrl)
    ? tile.item.audioDescriptionUrl
    : player.qualityPreference === "data-saver"
      ? sortedNativeSources[0]?.src
      : player.qualityPreference === "best"
        ? sortedNativeSources.at(-1)?.src
        : player.qualityPreference === "balanced"
          ? [...sortedNativeSources].reverse().find((source) => (source.width ?? 0) <= 1_280)?.src
            ?? sortedNativeSources[Math.floor(sortedNativeSources.length / 2)]?.src
          : undefined;
  const nativeCandidate = preferredNative ?? tile.item.mediaUrl;
  const native = tile.item.format !== "photo" && playableNativeUrl(nativeCandidate)
    ? nativeCandidate
    : null;
  const shape = contentShape(tile.item);
  const theaterAspect = theater && !mobile
    ? shape === "portrait"
      ? "9 / 16"
      : shape === "square"
        ? "1 / 1"
        : "16 / 9"
    : undefined;
  // Theater grid cells may be any shape.  The cell owns the layout; this
  // inner frame owns the provider's native presentation ratio.  Keeping those
  // concerns separate prevents a 16:9 Twitch or YouTube player from being
  // stretched by a tall companion cell, while still allowing the CORE control
  // overlay to use the whole cell.
  const mediaFrameStyle: React.CSSProperties = shape === "portrait"
    ? { height: "100%", width: "auto", maxWidth: "100%", aspectRatio: "9 / 16" }
    : shape === "square"
      ? { height: "100%", width: "auto", maxWidth: "100%", aspectRatio: "1 / 1" }
      : { width: "100%", height: "auto", maxHeight: "100%", aspectRatio: "16 / 9" };

  // Saved rooms created before muted multiview autoplay was enforced can
  // restore an audible first tile. Browsers reject that first autoplay start,
  // leaving the provider's Play screen behind CORE's controls. Normalize only
  // once per source; a later deliberate "Take audio" click remains intact.
  const autoplaySafetyItemRef = useRef<string | null>(null);
  useEffect(() => {
    if (standby || !inViewport || autoplaySafetyItemRef.current === tile.item.key) return;
    autoplaySafetyItemRef.current = tile.item.key;
    if (!tile.muted && (native || src)) player.updateTile(tile.id, { muted: true });
  }, [inViewport, native, player, src, standby, tile.id, tile.item.key, tile.muted]);

  // Provider frames expose inconsistent autoplay behavior even with autoplay
  // in the URL. Once the iframe exists, explicitly request a muted start a
  // few times while its API is booting. This does not preload another player
  // or remount the tile, and is a no-op for providers without a message API.
  useEffect(() => {
    // Do not issue a later mute command after a viewer intentionally takes
    // audio; the provider URL change for that direct action is enough.
    if (standby || !inViewport || !tile.muted || !src || (!tile.item.youtubeId && tile.item.platform !== "tiktok")) return;
    let disposed = false;
    const requestStart = () => {
      if (disposed) return;
      const source = iframeRef.current?.contentWindow;
      if (!source) return;
      if (tile.item.youtubeId) {
        source.postMessage(JSON.stringify({ event: "listening", id: `core-room-${tile.id}` }), "*");
        source.postMessage(JSON.stringify({ event: "command", func: "mute", args: [] }), "*");
        source.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [] }), "*");
        return;
      }
      source.postMessage({ "x-tiktok-player": true, type: "mute" }, "*");
      source.postMessage({ "x-tiktok-player": true, type: "play" }, "*");
    };
    requestStart();
    const retries = [180, 650, 1_400, 2_800].map((delay) => window.setTimeout(requestStart, delay));
    return () => {
      disposed = true;
      for (const timer of retries) window.clearTimeout(timer);
    };
  }, [inViewport, src, standby, tile.id, tile.item.platform, tile.item.youtubeId, tile.muted]);

  const closeMore = useCallback(() => {
    setMoreOpen(false);
    window.requestAnimationFrame(() => moreButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const frame = window.requestAnimationFrame(() => {
      moreMenuRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMore();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeMore, moreOpen]);

  useEffect(() => {
    setPipAvailable(false);
  }, [native, tile.item.key]);

  function updateFeedback(value: WatchFeedbackValue) {
    const next = feedback === value ? null : value;
    onFeedback(tile.item, next);
    if (next === "not_interested") {
      player.removeTile(tile.id);
    }
    setMoreOpen(false);
  }

  async function enterPictureInPicture() {
    const media = videoRef.current;
    if (!media || !pipAvailable) return;
    try {
      await media.requestPictureInPicture();
    } catch {
      // Cancellation and a browser declining the request are normal outcomes.
    }
  }

  return (
    <article
      ref={shellRef}
      style={{
        ...style,
        aspectRatio: mobile ? undefined : theater ? undefined : theaterAspect ?? (shape === "portrait" ? "9 / 16" : "16 / 9"),
        alignSelf: theater ? "stretch" : "start",
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      onClick={() => player.focusTile(tile.id)}
      onDoubleClick={() => player.focusTile(tile.id, { takeAudio: false })}
      className={`group relative overflow-hidden bg-black shadow-xl ring-1 transition duration-150 ${theater ? "rounded-2xl" : "rounded-xl"} ${mobile || theater ? "min-h-0" : "min-h-[10rem]"} ${focused ? "ring-white/40 shadow-[0_24px_72px_rgba(0,0,0,.5)]" : "ring-white/10 hover:ring-white/30 focus-within:ring-white/30"}`}
      aria-label={`${tile.item.title} player`}
    >
      {standby ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            player.updateTile(tile.id, { standby: false });
            player.focusTile(tile.id, { takeAudio: false });
          }}
          className="group/activate absolute inset-0 z-0 grid w-full cursor-pointer place-items-center overflow-hidden text-center outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:outline-offset-[-3px] active:scale-[.995]"
        >
          {tile.item.poster ? <img src={tile.item.poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55" /> : null}
          <span className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/30" />
          <span className="relative max-w-xs px-5">
            <span className="mx-auto grid size-11 place-items-center rounded-full bg-white text-black shadow-xs-skeuomorphic ring-1 ring-inset ring-white/80 transition duration-100 ease-linear group-hover/activate:-translate-y-0.5 group-hover/activate:scale-105 group-focus-visible/activate:-translate-y-0.5"><Plus className="size-4" /></span>
            <span className="mt-3 block text-sm font-semibold transition group-hover/activate:text-white">Activate player</span>
            <span className="mt-1 block text-[11px] text-white/55">
              {tooSmallForTwitch ? "This Twitch tile needs a little more room." : player.dataSaver ? "Paused by Data Saver" : "Held in standby to protect performance"}
            </span>
          </span>
        </button>
      ) : photo ? (
        <div className="absolute inset-0 isolate overflow-hidden bg-[#070709]">
          <div style={mediaFrameStyle} className="absolute left-1/2 top-1/2 overflow-hidden bg-black -translate-x-1/2 -translate-y-1/2">
          <img
            src={photo}
            alt=""
            aria-hidden
            className="absolute inset-[-4%] h-[108%] w-[108%] scale-110 object-cover opacity-30 blur-2xl"
          />
          <img src={photo} alt={tile.item.title} className="absolute inset-0 z-10 h-full w-full object-contain" />
          </div>
        </div>
      ) : native ? (
        <div style={mediaFrameStyle} className="absolute left-1/2 top-1/2 overflow-hidden bg-black -translate-x-1/2 -translate-y-1/2">
          <video
          ref={videoRef}
          src={native}
          poster={tile.item.poster || undefined}
          controls={false}
          autoPlay
          muted={tile.muted}
          playsInline
          onLoadedMetadata={(event) => {
            event.currentTarget.volume = tile.volume;
            event.currentTarget.playbackRate = player.playbackRate;
            durationRef.current = Number.isFinite(event.currentTarget.duration)
              ? event.currentTarget.duration
              : tile.item.durationSeconds ?? 0;
            setTileProgress({ position: positionRef.current, duration: durationRef.current });
            const requestedPosition = positionRef.current > 0 ? positionRef.current : tile.delaySeconds;
            if (requestedPosition > 0 && requestedPosition < event.currentTarget.duration - 2) {
              event.currentTarget.currentTime = requestedPosition;
            }
            for (let index = 0; index < event.currentTarget.textTracks.length; index += 1) {
              const track = event.currentTarget.textTracks[index];
              if (track) track.mode = player.captionsEnabled && index === 0 ? "showing" : "disabled";
            }
            setPipAvailable(Boolean(document.pictureInPictureEnabled && event.currentTarget.requestPictureInPicture));
          }}
          onCanPlay={(event) => {
            const media = event.currentTarget;
            // `autoPlay` alone is occasionally ignored after a route or
            // workspace restore. Retry the same element rather than changing
            // its source; if an older saved room starts audible, recover into
            // the browser-safe muted path once.
            void media.play().catch(() => {
              if (media.muted) return;
              media.muted = true;
              player.updateTile(tile.id, { muted: true });
              return media.play().catch(() => undefined);
            });
          }}
          onTimeUpdate={(event) => {
            positionRef.current = event.currentTarget.currentTime;
            if (Number.isFinite(event.currentTarget.duration)) durationRef.current = event.currentTarget.duration;
            setTileProgress({ position: positionRef.current, duration: durationRef.current });
          }}
          onPlaying={() => {
            timedEmbedRef.current = true;
            playingRef.current = true;
            setIsTilePlaying(true);
          }}
          onPause={() => {
            if (!playingRef.current) return;
            playingRef.current = false;
            setIsTilePlaying(false);
            checkpointTile();
          }}
          onEnded={finishPlayback}
          className={`absolute inset-0 h-full w-full ${tile.fit === "cover" ? "object-cover" : "object-contain"}`}
        >
          {(tile.item.captions ?? []).map((track) => (
            <track
              key={`${track.language}:${track.label}:${track.src}`}
              kind={track.kind ?? "captions"}
              src={track.src}
              srcLang={track.language}
              label={track.label}
              default={player.captionsEnabled && Boolean(track.default ?? tile.item.captions?.[0] === track)}
            />
          ))}
        </video>
        </div>
      ) : src ? (
        <div style={mediaFrameStyle} className="absolute left-1/2 top-1/2 overflow-hidden bg-black -translate-x-1/2 -translate-y-1/2">
          <iframe
          ref={iframeRef}
          title={tile.item.title}
          src={src}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="origin"
          onLoad={() => {
            const source = iframeRef.current?.contentWindow;
            if (tile.item.youtubeId && source) {
              source.postMessage(JSON.stringify({ event: "listening", id: 1 }), "*");
            } else if (tile.item.platform !== "tiktok") {
              // Twitch clips and other opaque official players expose no
              // playhead messages, so record active embed time without
              // pretending it is provider-side watch history.
              playingRef.current = true;
            }
          }}
          className={`pointer-events-none absolute inset-0 h-full w-full ${tile.fit === "cover" ? "scale-[1.02]" : ""}`}
        />
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-[#101014] p-6 text-center">
          <div>
            <p className="text-sm font-semibold">This source opens on {tile.item.platform}.</p>
            {tile.item.url ? <a href={tile.item.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-white px-4 text-xs font-semibold text-black shadow-xs-skeuomorphic ring-1 ring-inset ring-white/80 outline-focus-ring transition duration-100 ease-linear hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.98]">Open source <ExternalLink className="size-3.5" /></a> : null}
          </div>
        </div>
      )}

      {!standby && tile.item.kind !== "live" && native && tile.item.platform === "house" ? (
        <OnScreenIdentityOverlay
          contentId={tile.item.key}
          mode="vod"
          variant="overlay"
          getMediaTimeMs={readPresenceTimeMs}
          mediaElementRef={videoRef}
          mediaFit={tile.fit}
        />
      ) : null}

      {focused ? <PlayerNetworkWatermark channel={player.channel} compact /> : null}

      {!standby ? (
        <span
          className="pointer-events-none absolute left-2 top-2 z-10 grid size-7 place-items-center rounded-full bg-black/65 text-white/82 ring-1 ring-white/12 backdrop-blur-sm"
          aria-label={tile.muted ? "Audio muted" : "Audio on"}
        >
          {tile.muted ? <VolumeX className="size-3.5" aria-hidden /> : <Volume2 className="size-3.5" aria-hidden />}
        </span>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 bg-gradient-to-b from-black/85 via-black/30 to-transparent p-2.5 opacity-100 transition duration-150 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <IconControlTooltip title="Move player" description="Drag this player to swap its place in the grid." placement="bottom">
          <button
            type="button"
            draggable
            onDragStart={(event) => {
              event.stopPropagation();
              onDragStart(tile.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            className="pointer-events-auto hidden size-9 shrink-0 cursor-grab place-items-center rounded-lg bg-black/65 text-white/65 shadow-xs-skeuomorphic ring-1 ring-inset ring-white/15 outline-focus-ring transition duration-100 ease-linear hover:-translate-y-px hover:bg-black/85 hover:text-white hover:ring-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-0 active:scale-[.98] active:cursor-grabbing md:grid"
            aria-label={`Move ${tile.item.title}`}
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
        </IconControlTooltip>
        <IconControlTooltip title="Make main player" description="Put this player in the main slot without restarting it." placement="bottom">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              player.makeMain(tile.id, { takeAudio: false });
            }}
            className="pointer-events-auto min-h-11 min-w-0 flex-1 cursor-pointer rounded-lg px-1.5 py-0.5 text-left outline-focus-ring transition duration-100 ease-linear hover:-translate-y-px hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-0 active:scale-[.995] md:min-h-0"
            aria-label={`Make ${tile.item.title} the main player`}
          >
            <p className="truncate text-xs font-semibold text-white">{tile.item.title}</p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] text-white/55">
              {tile.item.kind === "live" ? <span className="size-1.5 rounded-full bg-red-500" /> : null}
              {tile.item.memberLabel} · {tile.item.platform}
            </p>
          </button>
        </IconControlTooltip>
        <div className="pointer-events-auto flex shrink-0 gap-1">
          <TileButton
            label={tile.muted ? "Take audio" : "Mute"}
            description={tile.muted ? "Make this the room’s audible player." : "Keep this player running without sound."}
            icon={tile.muted ? VolumeX : Volume2}
            onClick={() => player.updateTile(tile.id, { muted: !tile.muted })}
            active={!tile.muted}
          />
          <TileButton
            label={maximized ? "Restore" : "Maximize"}
            description={maximized ? "Return this player to its grid position." : "Expand this player to fill the stage."}
            icon={maximized ? Minimize2 : Maximize2}
            onClick={() => {
              // Layout promotion must not mutate the provider URL. Audio is
              // deliberate through the speaker control / explicit menu item.
              if (!maximized) player.focusTile(tile.id, { takeAudio: false });
              player.setMaximizedTileId(maximized ? null : tile.id);
            }}
          />
          <TileButton
            label={moreOpen ? "Close controls" : "More controls"}
            description={moreOpen ? "Hide this player’s extra controls." : "Open pin, fit, replacement, and feedback actions."}
            icon={MoreHorizontal}
            onClick={() => (moreOpen ? closeMore() : setMoreOpen(true))}
            active={moreOpen}
            buttonRef={moreButtonRef}
            expanded={moreOpen}
            controls={`tile-more-${tile.id}`}
          />
          <TileButton label="Close player" description="Remove this player from the room." icon={X} onClick={() => player.removeTile(tile.id)} />
        </div>
      </div>

      {moreOpen ? (
        <div
          ref={moreMenuRef}
          id={`tile-more-${tile.id}`}
          role="group"
          aria-label={`${tile.item.title} controls`}
          className="absolute right-2 top-14 z-40 max-h-[calc(100%-4rem)] w-56 overflow-y-auto overscroll-contain rounded-xl border border-white/15 bg-[#16161a]/97 p-1.5 text-xs shadow-2xl backdrop-blur-xl [scrollbar-width:thin] md:top-12 md:max-h-[calc(100%-3.5rem)]"
          onClick={(event) => event.stopPropagation()}
        >
          <MenuButton icon={Radio} label="Make main + take audio" onClick={() => player.makeMain(tile.id, { takeAudio: true })} />
          <MenuButton
            icon={tile.pinned ? PinOff : Pin}
            label={tile.pinned ? "Unpin main player" : "Pin as main player"}
            onClick={() => tile.pinned ? player.updateTile(tile.id, { pinned: false }) : player.makeMain(tile.id, { takeAudio: false })}
          />
          <MenuButton icon={LayoutGrid} label={tile.fit === "cover" ? "Fit whole video" : "Fill tile"} onClick={() => player.updateTile(tile.id, { fit: tile.fit === "cover" ? "contain" : "cover" })} />
          <MenuButton
            icon={Plus}
            label="Replace source"
            onClick={() => {
              setMoreOpen(false);
              onReplace(tile.id, moreButtonRef.current);
            }}
          />
          <MenuButton
            icon={PictureInPicture2}
            label="Picture in picture"
            disabled={!pipAvailable}
            onClick={() => void enterPictureInPicture()}
          />
          <div className="my-1 h-px bg-white/8" />
          <div className="grid grid-cols-2 gap-1 p-1">
            <ResizeButton label="Narrower" disabled={tile.colSpan <= 1} onClick={() => player.updateTile(tile.id, { colSpan: Math.max(1, tile.colSpan - 1) })} />
            <ResizeButton label="Wider" disabled={tile.colSpan >= player.gridColumns - tile.col + 1} onClick={() => player.updateTile(tile.id, { colSpan: Math.min(player.gridColumns - tile.col + 1, tile.colSpan + 1) })} />
            <ResizeButton label="Shorter" disabled={tile.rowSpan <= 1} onClick={() => player.updateTile(tile.id, { rowSpan: Math.max(1, tile.rowSpan - 1) })} />
            <ResizeButton label="Taller" disabled={tile.rowSpan >= 6} onClick={() => player.updateTile(tile.id, { rowSpan: Math.min(6, tile.rowSpan + 1) })} />
          </div>
          <div className="my-1 h-px bg-white/8" />
          <MenuButton icon={Check} label="More like this" active={feedback === "like"} onClick={() => updateFeedback("like")} />
          <MenuButton icon={X} label="Less like this" active={feedback === "dislike"} onClick={() => updateFeedback("dislike")} />
          <MenuButton icon={Trash2} label="Not interested" active={feedback === "not_interested"} onClick={() => updateFeedback("not_interested")} />
        </div>
      ) : null}

      {!standby ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-2.5 pb-2.5 pt-10 opacity-100 transition duration-150 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <div className="pointer-events-auto mb-2 flex items-center gap-2 px-0.5">
            <span className="w-9 shrink-0 text-right text-[9px] tabular-nums text-white/65">{formatPlaybackTime(tileProgress.position)}</span>
            <input
              type="range"
              min="0"
              max={tile.item.kind === "live" ? 1 : Math.max(1, tileProgress.duration || durationRef.current || 1)}
              step="0.1"
              value={tile.item.kind === "live" ? 1 : Math.min(tileProgress.position, Math.max(1, tileProgress.duration || durationRef.current || 1))}
              disabled={!native || tile.item.kind === "live" || !(tileProgress.duration || durationRef.current)}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                const media = videoRef.current;
                const position = Number(event.target.value);
                if (!media || !Number.isFinite(position)) return;
                media.currentTime = position;
                positionRef.current = position;
                setTileProgress((current) => ({ ...current, position }));
              }}
              className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/20 accent-[#ff3850] disabled:cursor-default disabled:opacity-55"
              aria-label={native ? "Seek within this player" : "Provider playback progress"}
            />
            {tile.item.kind === "live" ? (
              <span className="inline-flex w-9 items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] text-red-400"><span className="size-1.5 rounded-full bg-red-500" />Live</span>
            ) : (
              <span className="w-9 text-[9px] tabular-nums text-white/65">{formatPlaybackTime(tileProgress.duration || durationRef.current)}</span>
            )}
          </div>
          <div className="flex items-end justify-between gap-2">
          <div className="pointer-events-auto flex items-center gap-1.5">
            {native ? (
              <TileButton
                label={isTilePlaying ? "Pause player" : "Play player"}
                description="Play or pause this native media source."
                icon={isTilePlaying ? Pause : Play}
                onClick={() => {
                  const media = videoRef.current;
                  if (!media) return;
                  if (media.paused) void media.play(); else media.pause();
                }}
              />
            ) : null}
            <TileButton
              label={tile.muted ? "Take audio" : "Mute player"}
              description={tile.muted ? "Make this the room’s audio source." : "Keep this player silent."}
              icon={tile.muted ? VolumeX : Volume2}
              onClick={() => player.updateTile(tile.id, { muted: !tile.muted })}
              active={!tile.muted}
            />
            <TileButton
              label="Make main"
              description="Place this player in the main slot without restarting it."
              icon={Radio}
              onClick={() => player.makeMain(tile.id, { takeAudio: false })}
              active={tile.pinned}
            />
          </div>
          <span className="pointer-events-none rounded-full bg-black/55 px-2 py-1 text-[9px] font-medium text-white/60 ring-1 ring-white/10">CORE controls</span>
          </div>
        </div>
      ) : null}

      {shape === "portrait" ? <span className="pointer-events-none absolute bottom-2 right-2 z-20 rounded-full bg-black/60 px-2 py-1 text-[9px] text-white/55">9:16</span> : null}
    </article>
  );
}, (previous, next) => (
  previous.tile === next.tile
  && previous.active === next.active
  && previous.focused === next.focused
  && previous.passportCredit === next.passportCredit
  && previous.maximized === next.maximized
  && previous.mobile === next.mobile
  && previous.theater === next.theater
  && previous.feedback === next.feedback
  && previous.player === next.player
  && sameTileStyle(previous.style, next.style)
));

function TileButton({
  label,
  description,
  icon: Icon,
  onClick,
  active,
  buttonRef,
  expanded,
  controls,
}: {
  label: string;
  description: string;
  icon: typeof Plus;
  onClick: () => void;
  active?: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
  expanded?: boolean;
  controls?: string;
}) {
  return (
    <IconControlTooltip title={label} description={description} placement="bottom">
      <button
        ref={buttonRef}
        type="button"
        onClick={(event) => { event.stopPropagation(); onClick(); }}
        className={`grid size-11 cursor-pointer place-items-center rounded-lg shadow-xs-skeuomorphic ring-1 ring-inset outline-focus-ring transition duration-100 ease-linear hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-0 active:scale-[.97] md:size-9 ${active ? "bg-white text-black ring-white/90 hover:bg-white/90" : "bg-black/65 text-white/75 ring-white/15 hover:bg-black/85 hover:text-white hover:ring-white/30"}`}
        aria-label={label}
        aria-pressed={active}
        aria-expanded={expanded}
        aria-controls={controls}
      >
        <Icon className="size-4" aria-hidden />
      </button>
    </IconControlTooltip>
  );
}

function MenuButton({ icon: Icon, label, onClick, disabled, active }: { icon: typeof Plus; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button type="button" disabled={disabled} aria-pressed={active} onClick={onClick} className={`flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-left text-[11px] outline-focus-ring transition duration-100 ease-linear hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-35 disabled:active:scale-100 md:min-h-9 ${active ? "bg-white/10 text-white ring-1 ring-inset ring-white/12" : "text-white/70"}`}>
      <Icon className="size-3.5" /> {label}
    </button>
  );
}

function ResizeButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-11 cursor-pointer rounded-lg bg-white/5 px-2 text-[10px] text-white/65 shadow-xs-skeuomorphic ring-1 ring-inset ring-white/8 outline-focus-ring transition duration-100 ease-linear hover:bg-white/10 hover:text-white hover:ring-white/18 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100 md:min-h-9"
    >
      {label}
    </button>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Retained while the current Room Studio replaces this compatible setup surface.
function CustomizePanel({
  layoutName,
  onLayoutName,
  onSave,
  canSaveLayouts,
  savedLayoutsHref,
  savedLayoutsPlan,
  liveCount,
  onAdd,
  onFill,
  onShare,
}: {
  layoutName: string;
  onLayoutName: (value: string) => void;
  onSave: () => void;
  canSaveLayouts: boolean;
  savedLayoutsHref: string;
  savedLayoutsPlan: string;
  liveCount: number;
  onAdd: () => void;
  onFill: () => void;
  onShare: () => void;
}) {
  const player = usePlayer();
  const focused = player.focusedTile;
  const [openSection, setOpenSection] = useState<"layout" | "playback" | "audio" | "chat" | "saved" | "advanced" | null>("layout");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [resetSnapshot, setResetSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const toggleSection = (section: NonNullable<typeof openSection>) => {
    setOpenSection((current) => current === section ? null : section);
  };
  const applyRecipe = (recipe: (typeof ROOM_RECIPES)[number]) => {
    player.applyPreset(recipe.preset);
    player.setChatDock(recipe.chatDock);
    player.setMixAudio(recipe.mixAudio);
    player.setDataSaver(recipe.dataSaver);
  };
  const resetRoom = () => {
    setResetSnapshot(player.workspaceSnapshot("Before reset"));
    const tileCount = player.tiles.length;
    player.applyPreset(tileCount <= 1 ? "solo" : tileCount <= 2 ? "split" : tileCount <= 4 ? "quad" : "three-two");
    player.setChatDock("right");
    player.setDataSaver(false);
    player.setMixAudio(false);
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain p-3" aria-label="Room setup">
      <div className="pb-3">
        <p className="text-xs font-semibold text-white">Room setup</p>
        <p className="mt-1 text-[10px] leading-4 text-white/38">Start with a room style, then tune only what you need.</p>
      </div>

      <section className="mb-3" aria-label="Room presets">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">Start with a style</p>
          <span className="text-[9px] text-white/30">You can change every detail later</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {ROOM_RECIPES.map((recipe) => {
            const selected = player.layoutPreset === recipe.preset && player.chatDock === recipe.chatDock && player.mixAudio === recipe.mixAudio && player.dataSaver === recipe.dataSaver;
            return (
              <button
                key={recipe.id}
                type="button"
                onClick={() => applyRecipe(recipe)}
                aria-pressed={selected}
                className={`group min-h-[7rem] cursor-pointer rounded-xl p-2.5 text-left shadow-xs-skeuomorphic ring-1 ring-inset outline-focus-ring transition duration-100 ease-linear hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-0 active:scale-[.99] ${selected ? "bg-white text-black ring-white/90" : "bg-white/[0.035] text-white/72 ring-white/10 hover:bg-white/[0.08] hover:text-white hover:ring-white/20"}`}
              >
                <span className={`grid h-7 w-11 grid-flow-row-dense gap-1 ${recipe.blocks}`} aria-hidden>
                  {Array.from({ length: 6 }).map((_, index) => <span key={index} className={`rounded-[3px] ${selected ? "bg-black/70" : "bg-white/45 group-hover:bg-white/70"}`} />)}
                </span>
                <span className="mt-2 block text-[11px] font-semibold">{recipe.label}</span>
                <span className={`mt-0.5 block text-[9px] leading-3 ${selected ? "text-black/60" : "text-white/38"}`}>{recipe.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2 border-b border-white/8 pb-3">
        <ToolbarButton label="Add player" icon={Plus} onClick={onAdd} primary />
        {liveCount > 0 ? (
          <ToolbarButton label="Watch live channels" icon={Radio} onClick={onFill} />
        ) : (
          <ToolbarButton label="No one live" icon={Radio} onClick={() => undefined} disabled />
        )}
        <ToolbarButton label="Share room" icon={Share2} onClick={onShare} />
      </div>

      <div className="mt-3 grid grid-cols-2 rounded-xl bg-white/[0.035] p-1 ring-1 ring-inset ring-white/8" role="group" aria-label="Room settings detail">
        <button type="button" onClick={() => setAdvancedOpen(false)} aria-pressed={!advancedOpen} className={`min-h-10 rounded-lg px-3 text-[10px] font-semibold transition ${!advancedOpen ? "bg-white text-black" : "text-white/48 hover:text-white"}`}>Room</button>
        <button type="button" onClick={() => setAdvancedOpen(true)} aria-pressed={advancedOpen} className={`min-h-10 rounded-lg px-3 text-[10px] font-semibold transition ${advancedOpen ? "bg-white text-black" : "text-white/48 hover:text-white"}`}>Advanced</button>
      </div>

      <div className="mt-3 space-y-2">
        <SettingGroup id="layout" title="Layout" description="Preset and grid size" open={openSection === "layout"} onToggle={() => toggleSection("layout")}>
          <div className="grid grid-cols-2 gap-2">
            {WORKSPACE_PRESETS.filter((entry) => entry.id !== "freeform").map((entry) => {
              const selected = player.layoutPreset === entry.id;
              return <button key={entry.id} type="button" onClick={() => player.applyPreset(entry.id)} aria-pressed={selected} className={`min-h-12 cursor-pointer rounded-xl px-3 text-left shadow-xs-skeuomorphic ring-1 ring-inset outline-focus-ring transition duration-100 ease-linear hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-0 active:scale-[.99] ${selected ? "bg-white text-black ring-white/90" : "bg-white/[0.035] text-white/65 ring-white/8 hover:bg-white/[0.08] hover:text-white hover:ring-white/18"}`}><span className="block text-[10px] font-semibold">{entry.label}</span><span className={`mt-0.5 block text-[8px] ${selected ? "text-black/58" : "text-white/32"}`}>{entry.description}</span></button>;
            })}
          </div>
        </SettingGroup>

        {advancedOpen ? (
          <>
        <SettingGroup id="playback" title="Playback" description="What opens, plays, and stays active" open={openSection === "playback"} onToggle={() => toggleSection("playback")}>
          <SettingSelect label="Autoplay" value={player.autoplayMode} onChange={(value) => player.setAutoplayMode(value as typeof player.autoplayMode)} options={AUTOPLAY_MODES.map((entry) => ({ value: entry.id, label: entry.label }))} />
          <SettingRange label={`Streams playing at once · ${player.maxActivePlayers}`} min={1} max={8} value={player.maxActivePlayers} onChange={player.setMaxActivePlayers} />
          <SettingToggle label="Keep only main stream active" description="Pause background streams to use less data" value={player.dataSaver} onChange={player.setDataSaver} />
        </SettingGroup>

        <SettingGroup id="audio" title="Audio + sync" description="Choose one clear stream, or mix deliberately" open={openSection === "audio"} onToggle={() => toggleSection("audio")}>
          <div className="rounded-xl bg-gradient-to-br from-white/[0.08] to-white/[0.025] p-3 ring-1 ring-inset ring-white/10"><p className="text-[11px] font-semibold text-white/82">Smart audio focus</p><p className="mt-1 text-[9px] leading-4 text-white/42">The focused tile is the primary audio source. When mixing is enabled, other tiles stay lower so speech remains understandable; each tile can still be muted or made primary from its hover controls.</p></div>
          <SettingToggle label="Mix audio" description="Allow more than one audible tile at a safe level" value={player.mixAudio} onChange={player.setMixAudio} />
          <button type="button" onClick={player.muteAll} className="min-h-11 cursor-pointer rounded-xl bg-white/5 px-3 text-left text-xs text-white/65 shadow-xs-skeuomorphic ring-1 ring-inset ring-white/10 outline-focus-ring transition duration-100 ease-linear hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.99]">Mute every tile</button>
          {player.tiles.length ? (
            <div className="rounded-xl bg-white/[0.035] p-2 ring-1 ring-inset ring-white/8">
              <div className="mb-1 flex items-center justify-between px-1"><p className="text-[10px] font-semibold text-white/70">Audio mixer</p><span className="text-[9px] text-white/32">Choose one lead or fine-tune a mix</span></div>
              <div className="space-y-1">
                {player.tiles.slice(0, 8).map((tile) => {
                  const lead = focused?.id === tile.id && !tile.muted;
                  return <div key={tile.id} className={`flex min-h-11 items-center gap-2 rounded-lg px-2 ${lead ? "bg-white/10" : ""}`}><button type="button" onClick={() => player.focusTile(tile.id, { takeAudio: true })} className={`grid size-7 shrink-0 place-items-center rounded-md outline-focus-ring transition focus-visible:outline-2 focus-visible:outline-offset-2 ${lead ? "bg-white text-black" : "bg-white/8 text-white/50 hover:bg-white/14 hover:text-white"}`} aria-label={`Make ${tile.item.memberLabel} the audio lead`}><Volume2 className="size-3.5" aria-hidden /></button><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold text-white/72">{tile.item.memberLabel}</span><span className="block text-[8px] text-white/32">{tile.muted ? "Muted" : lead ? "Audio lead" : `${Math.round(tile.volume * 100)}%`} · {tile.delaySeconds ? `${tile.delaySeconds}s offset` : "Live edge"}</span></span><input type="range" min="0" max="1" step="0.05" value={tile.muted ? 0 : tile.volume} onChange={(event) => player.updateTile(tile.id, { volume: Number(event.target.value), muted: Number(event.target.value) === 0 })} className="h-8 w-16 cursor-pointer accent-white" aria-label={`${tile.item.memberLabel} volume`} /></div>;
                })}
              </div>
            </div>
          ) : null}
          {focused ? (
            <label className="grid gap-1 text-[10px] text-white/45">
              Sync delay
              <div className="flex items-center rounded-xl bg-white/5 ring-1 ring-white/10">
                <input type="number" min={0} max={7200} step={5} value={focused.delaySeconds} onChange={(event) => player.updateTile(focused.id, { delaySeconds: Number(event.target.value) })} className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-xs text-white outline-none" />
                <span className="pr-3 text-[10px] text-white/35">sec</span>
              </div>
            </label>
          ) : null}
        </SettingGroup>
          </>
        ) : null}

        <SettingGroup id="chat" title="Chat placement" description="Put the conversation where it helps most" open={openSection === "chat"} onToggle={() => toggleSection("chat")}>
          <div className="grid gap-2">
            {CHAT_DOCK_OPTIONS.map((option) => {
              const selected = player.chatDock === option.id;
              return <button key={option.id} type="button" onClick={() => player.setChatDock(option.id)} aria-pressed={selected} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 text-left shadow-xs-skeuomorphic ring-1 ring-inset outline-focus-ring transition duration-100 ease-linear hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.99] ${selected ? "bg-white text-black ring-white/90" : "bg-white/[0.035] text-white/70 ring-white/8"}`}><MessageSquare className="size-3.5 shrink-0" aria-hidden /><span className="min-w-0"><span className="block text-[10px] font-semibold">{option.label}</span><span className={`mt-0.5 block text-[9px] ${selected ? "text-black/58" : "text-white/35"}`}>{option.description}</span></span></button>;
            })}
          </div>
          <p className="rounded-xl bg-white/[0.035] px-3 py-2 text-[9px] leading-4 text-white/38">Combined chat keeps every conversation together. Columns show each channel separately. Focused chat follows the player you select.</p>
        </SettingGroup>

        {advancedOpen ? <SettingGroup id="advanced" title="Advanced controls" description="Keyboard shortcuts and precise playback" open={openSection === "advanced"} onToggle={() => toggleSection("advanced")}>
          <div className="rounded-xl bg-white/[0.035] p-3 text-[10px] leading-5 text-white/48"><p className="font-semibold text-white/72">Quick controls</p><p className="mt-1">Press <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-white/70">1–9</kbd> to focus a tile, <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-white/70">F</kbd> to maximize it, <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-white/70">M</kbd> to toggle its audio, and <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-white/70">Esc</kbd> to restore the grid.</p></div>
          <SettingToggle label="Preview autoplay" description="Let hover previews begin when available" value={player.previewAutoplay} onChange={player.setPreviewAutoplay} />
          <SettingToggle label="Preview sound" description="Start supported hover previews with sound" value={player.previewSoundEnabled} onChange={player.setPreviewSoundEnabled} />
          <SettingToggle label="Captions" description="Show captions on supported sources" value={player.captionsEnabled} onChange={player.setCaptionsEnabled} />
          <div className="grid grid-cols-2 gap-2"><button type="button" onClick={resetRoom} className="min-h-11 cursor-pointer rounded-xl px-3 text-[10px] font-semibold text-white/62 ring-1 ring-white/12 transition hover:bg-white/8 hover:text-white">Reset room</button><button type="button" disabled={!resetSnapshot} onClick={() => { if (resetSnapshot) player.importWorkspace(resetSnapshot); setResetSnapshot(null); }} className="min-h-11 cursor-pointer rounded-xl px-3 text-[10px] font-semibold text-white/62 ring-1 ring-white/12 transition hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-35">Undo reset</button></div>
        </SettingGroup> : null}

        {advancedOpen ? <SettingGroup id="saved" title="Saved layouts" description={canSaveLayouts ? "Save or restore a room" : `${savedLayoutsPlan} · reusable synced rooms`} open={openSection === "saved"} onToggle={() => toggleSection("saved")}>
          {canSaveLayouts ? (
            <div className="flex gap-2">
              <input value={layoutName} onChange={(event) => onLayoutName(event.target.value)} placeholder="Layout name" maxLength={80} className="min-h-11 min-w-0 flex-1 rounded-xl bg-white/5 px-3 text-xs text-white outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-white/25" />
              <IconControlTooltip title="Save layout" description="Save this room under the entered name.">
                <button type="button" onClick={onSave} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl bg-white text-black shadow-xs-skeuomorphic ring-1 ring-inset ring-white/90 outline-focus-ring transition duration-100 ease-linear hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.97]" aria-label="Save layout"><Save className="size-4" aria-hidden /></button>
              </IconControlTooltip>
            </div>
          ) : (
            <Link
              href={savedLayoutsHref as never}
              className="flex min-h-14 items-center gap-3 rounded-xl bg-gradient-to-br from-white/10 to-white/[0.035] px-3 text-left ring-1 ring-inset ring-white/12 transition hover:bg-white/12 hover:ring-white/22 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-black"><LockKeyhole className="size-4" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold text-white">Save this room with {savedLayoutsPlan}</span>
                <span className="mt-0.5 block text-[9px] leading-4 text-white/45">Name reusable layouts and sync them across your devices.</span>
              </span>
            </Link>
          )}
          <div className="max-h-56 space-y-2 overflow-y-auto pr-0.5">
            {player.savedLayouts.map((layout) => (
              <article key={`${layout.name}-${layout.updatedAt}`} className="group flex items-center gap-2 rounded-xl bg-white/[0.035] p-2 ring-1 ring-white/8 transition hover:bg-white/[0.06] hover:ring-white/16">
                <button type="button" onClick={() => player.loadLayout(layout.name)} className="grid h-11 w-14 shrink-0 grid-cols-3 gap-1 rounded-lg bg-black/35 p-1.5 outline-focus-ring transition group-hover:bg-black/50 focus-visible:outline-2 focus-visible:outline-offset-2" aria-label={`Open ${layout.name}`}>
                  {Array.from({ length: Math.min(6, Math.max(1, layout.tiles.length)) }).map((_, index) => <span key={index} className={`rounded-[2px] ${index === 0 ? "bg-white/70" : "bg-white/25"} ${layout.preset === "main-three" && index === 0 ? "col-span-2 row-span-2" : ""}`} />)}
                </button>
                <button type="button" onClick={() => player.loadLayout(layout.name)} className="min-h-11 min-w-0 flex-1 cursor-pointer rounded-lg px-1 text-left outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2"><span className="block truncate text-[11px] font-semibold text-white/75">{layout.name}</span><span className="mt-0.5 block text-[9px] text-white/35">{layout.tiles.length} view{layout.tiles.length === 1 ? "" : "s"} · {WORKSPACE_PRESETS.find((entry) => entry.id === layout.preset)?.label ?? "Custom"}{layout.remote ? " · synced" : ""}</span></button>
                <IconControlTooltip title="Delete layout" description="Remove this saved room from your layouts.">
                  <button type="button" onClick={() => void player.deleteLayout(layout.name)} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg text-white/35 transition hover:bg-white/8 hover:text-white" aria-label={`Delete ${layout.name}`}><Trash2 className="size-3.5" aria-hidden /></button>
                </IconControlTooltip>
              </article>
            ))}
            {player.savedLayouts.length === 0 ? <p className="py-2 text-[11px] text-white/30">{canSaveLayouts ? "Saved layouts appear here and sync when you sign in." : "Any layouts already on this device remain available."}</p> : null}
          </div>
        </SettingGroup> : null}
      </div>
    </div>
  );
}

function SetupModal({
  onClose,
  layoutName,
  onLayoutName,
  onSave,
  canSaveLayouts,
  savedLayoutsHref,
  savedLayoutsPlan,
  liveCount,
  onAdd,
  onFill,
  onShare,
}: {
  onClose: () => void;
  layoutName: string;
  onLayoutName: (value: string) => void;
  onSave: () => void;
  canSaveLayouts: boolean;
  savedLayoutsHref: string;
  savedLayoutsPlan: string;
  liveCount: number;
  onAdd: () => void;
  onFill: () => void;
  onShare: () => void;
}) {
  return <RoomStudio onClose={onClose} layoutName={layoutName} onLayoutName={onLayoutName} onSave={onSave} canSaveLayouts={canSaveLayouts} savedLayoutsHref={savedLayoutsHref} savedLayoutsPlan={savedLayoutsPlan} liveCount={liveCount} onAdd={onAdd} onFill={onFill} onShare={onShare} />;
}

type StudioTab = "layout" | "chat" | "playback" | "audio" | "saved";
type StudioAction = {
  kind: "move" | "resize" | "chat";
  tileId?: string;
  startX: number;
  startY: number;
  startTile?: WorkspaceTile;
  rect: DOMRect;
} | null;

function tilesOverlap(a: WorkspaceTile, b: WorkspaceTile) {
  return a.col < b.col + b.colSpan && a.col + a.colSpan > b.col && a.row < b.row + b.rowSpan && a.row + a.rowSpan > b.row;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Retained for workspace migration compatibility while RoomStudio is active.
function LegacyRoomStudio({
  onClose, layoutName, onLayoutName, onSave, canSaveLayouts, savedLayoutsHref, savedLayoutsPlan, liveCount, onAdd, onFill, onShare,
}: {
  onClose: () => void;
  layoutName: string;
  onLayoutName: (value: string) => void;
  onSave: () => void;
  canSaveLayouts: boolean;
  savedLayoutsHref: string;
  savedLayoutsPlan: string;
  liveCount: number;
  onAdd: () => void;
  onFill: () => void;
  onShare: () => void;
}) {
  const player = usePlayer();
  const canvasRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<StudioAction>(null);
  const draftRef = useRef(player.tiles);
  const [draftTiles, setDraftTiles] = useState(player.tiles);
  const [selected, setSelected] = useState<string | "chat">(player.focusedTileId ?? "chat");
  const [tab, setTab] = useState<StudioTab>("layout");
  const [history, setHistory] = useState<WorkspaceSnapshot[]>([]);
  const [future, setFuture] = useState<WorkspaceSnapshot[]>([]);

  useEffect(() => {
    if (actionRef.current) return;
    draftRef.current = player.tiles;
    setDraftTiles(player.tiles);
  }, [player.tiles]);

  const pushHistory = useCallback(() => {
    setHistory((items) => [...items, player.workspaceSnapshot("Room edit")].slice(-20));
    setFuture([]);
  }, [player]);

  const commitDraft = useCallback((next: WorkspaceTile[]) => {
    const before = new Map(player.tiles.map((tile) => [tile.id, tile]));
    for (const tile of next) {
      const prior = before.get(tile.id);
      if (!prior) continue;
      if (prior.col !== tile.col || prior.row !== tile.row || prior.colSpan !== tile.colSpan || prior.rowSpan !== tile.rowSpan) {
        player.updateTile(tile.id, { col: tile.col, row: tile.row, colSpan: tile.colSpan, rowSpan: tile.rowSpan });
      }
    }
  }, [player]);

  const resolveDraft = useCallback((candidate: WorkspaceTile, seed: WorkspaceTile[]) => {
    const clamped = {
      ...candidate,
      col: Math.max(1, Math.min(player.gridColumns, candidate.col)),
      colSpan: Math.max(1, Math.min(player.gridColumns - Math.max(1, candidate.col) + 1, candidate.colSpan)),
      row: Math.max(1, candidate.row),
      rowSpan: Math.max(1, Math.min(6, candidate.rowSpan)),
    };
    return seed.map((tile) => {
      if (tile.id === clamped.id) return clamped;
      return tilesOverlap(clamped, tile) ? { ...tile, row: clamped.row + clamped.rowSpan } : tile;
    });
  }, [player.gridColumns]);

  const beginTileAction = (event: React.PointerEvent, tile: WorkspaceTile, kind: "move" | "resize") => {
    event.preventDefault();
    event.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    pushHistory();
    actionRef.current = { kind, tileId: tile.id, startX: event.clientX, startY: event.clientY, startTile: tile, rect };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const beginChatAction = (event: React.PointerEvent) => {
    event.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    pushHistory();
    actionRef.current = { kind: "chat", startX: event.clientX, startY: event.clientY, rect };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onCanvasMove = (event: React.PointerEvent) => {
    const action = actionRef.current;
    if (!action || action.kind === "chat" || !action.startTile) return;
    const columns = player.gridColumns;
    const columnWidth = action.rect.width / columns;
    const rowHeight = Math.max(40, action.rect.height / 12);
    const dx = Math.round((event.clientX - action.startX) / columnWidth);
    const dy = Math.round((event.clientY - action.startY) / rowHeight);
    const source = action.startTile;
    const patch = action.kind === "move"
      ? { col: source.col + dx, row: source.row + dy }
      : { colSpan: source.colSpan + dx, rowSpan: source.rowSpan + dy };
    const next = resolveDraft({ ...source, ...patch }, draftRef.current);
    draftRef.current = next;
    setDraftTiles(next);
  };

  const finishCanvasAction = (event: React.PointerEvent) => {
    const action = actionRef.current;
    if (!action) return;
    if (action.kind === "chat") {
      const x = (event.clientX - action.rect.left) / action.rect.width;
      const y = (event.clientY - action.rect.top) / action.rect.height;
      player.setChatDock(y > 0.68 ? "bottom" : x < 0.28 ? "left" : x > 0.72 ? "right" : "floating");
      setSelected("chat");
      setTab("chat");
    } else {
      commitDraft(draftRef.current);
    }
    actionRef.current = null;
  };

  const undo = () => {
    const snapshot = history.at(-1);
    if (!snapshot) return;
    setHistory((items) => items.slice(0, -1));
    setFuture((items) => [player.workspaceSnapshot("Room edit"), ...items].slice(0, 20));
    player.importWorkspace(snapshot);
  };
  const redo = () => {
    const snapshot = future[0];
    if (!snapshot) return;
    setFuture((items) => items.slice(1));
    setHistory((items) => [...items, player.workspaceSnapshot("Room edit")].slice(-20));
    player.importWorkspace(snapshot);
  };
  const applyPreset = (preset: WorkspacePreset) => {
    pushHistory();
    player.applyPreset(preset);
    setSelected(player.focusedTileId ?? "chat");
  };
  const activeTile = selected === "chat" ? null : draftTiles.find((tile) => tile.id === selected) ?? null;
  const maxRow = Math.max(6, ...draftTiles.map((tile) => tile.row + tile.rowSpan - 1));
  const chatStyle = player.chatDock === "left"
    ? { gridColumn: "1 / span 3", gridRow: "2 / span 8" }
    : player.chatDock === "right"
      ? { gridColumn: `${Math.max(1, player.gridColumns - 2)} / span 3`, gridRow: "2 / span 8" }
      : player.chatDock === "bottom"
        ? { gridColumn: "3 / span 8", gridRow: `${maxRow + 2} / span 3` }
        : { gridColumn: "4 / span 5", gridRow: "4 / span 4" };

  return (
    <div className="fixed inset-0 z-[90] bg-[#050506]/92 p-0 backdrop-blur-md" role="presentation">
      <section id="multiview-setup-modal" role="dialog" aria-modal="true" aria-label="Room Studio" className="flex h-[100dvh] w-full flex-col bg-[#0c0c0f] text-white">
        <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 sm:px-5">
          <div className="min-w-0"><p className="text-sm font-semibold">Room Studio</p><p className="hidden text-[10px] text-white/42 sm:block">Drag sources, resize tiles, and place the chat dock anywhere.</p></div>
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={!history.length} onClick={undo} className="min-h-10 rounded-lg px-3 text-[11px] font-semibold text-white/65 ring-1 ring-white/10 transition hover:bg-white/8 disabled:opacity-30">Undo</button>
            <button type="button" disabled={!future.length} onClick={redo} className="min-h-10 rounded-lg px-3 text-[11px] font-semibold text-white/65 ring-1 ring-white/10 transition hover:bg-white/8 disabled:opacity-30">Redo</button>
            <button type="button" onClick={onShare} className="hidden min-h-10 rounded-lg px-3 text-[11px] font-semibold text-white/65 ring-1 ring-white/10 transition hover:bg-white/8 sm:block">Share</button>
            <button type="button" onClick={onSave} className="min-h-10 rounded-lg bg-white px-3 text-[11px] font-semibold text-black transition hover:bg-white/90">Save layout</button>
            <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-lg text-white/55 transition hover:bg-white/8 hover:text-white" aria-label="Close Room Studio"><X className="size-4" /></button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[13rem_minmax(0,1fr)_21rem]">
          <aside className="order-2 flex min-h-0 gap-2 overflow-x-auto border-t border-white/8 p-3 lg:order-none lg:block lg:overflow-y-auto lg:border-r lg:border-t-0">
            <div className="hidden lg:block"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/38">Room styles</p><p className="mt-1 text-[10px] leading-4 text-white/35">Start with a familiar arrangement, then fine tune it on the canvas.</p></div>
            <div className="mt-0 flex gap-2 lg:mt-3 lg:flex-col">
              {WORKSPACE_PRESETS.filter((preset) => preset.id !== "freeform").map((preset) => <button key={preset.id} type="button" onClick={() => applyPreset(preset.id)} aria-pressed={player.layoutPreset === preset.id} className={`min-h-11 shrink-0 rounded-xl px-3 text-left text-[10px] font-semibold ring-1 ring-inset transition ${player.layoutPreset === preset.id ? "bg-white text-black ring-white" : "bg-white/[.035] text-white/65 ring-white/10 hover:bg-white/10 hover:text-white"}`}><span className="block">{preset.label}</span><span className="mt-0.5 hidden text-[9px] font-normal opacity-60 lg:block">{preset.description}</span></button>)}
            </div>
            <div className="hidden space-y-2 border-t border-white/8 pt-3 lg:block"><button type="button" onClick={onAdd} className="min-h-10 w-full rounded-xl bg-white/6 px-3 text-left text-[10px] font-semibold text-white/70 ring-1 ring-white/10 hover:bg-white/10">Add player</button><button type="button" disabled={!liveCount} onClick={onFill} className="min-h-10 w-full rounded-xl bg-white/6 px-3 text-left text-[10px] font-semibold text-white/70 ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-35">Watch live channels</button></div>
          </aside>

          <main className="min-h-0 overflow-auto p-3 sm:p-5">
            <div className="mx-auto flex min-h-full max-w-[1100px] flex-col">
              <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-white/85">Live layout canvas</p><p className="mt-1 text-[10px] text-white/40">Changes preview here first; streams keep playing in the room behind it.</p></div><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[9px] font-semibold text-emerald-300 ring-1 ring-emerald-300/20">Optimized edit mode</span></div>
              <div ref={canvasRef} onPointerMove={onCanvasMove} onPointerUp={finishCanvasAction} onPointerCancel={finishCanvasAction} className="grid min-h-[31rem] flex-1 gap-2 rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,.08),transparent_42%),#09090c] p-3 shadow-[0_28px_100px_rgba(0,0,0,.45)]" style={{ gridTemplateColumns: `repeat(${player.gridColumns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${maxRow + 5}, minmax(2.5rem, 1fr))` }}>
                {draftTiles.map((tile) => {
                  const selectedTile = selected === tile.id;
                  return <article key={tile.id} role="button" tabIndex={0} onClick={() => { setSelected(tile.id); setTab("layout"); }} onKeyDown={(event) => { const amount = event.shiftKey ? 1 : 0; if (!amount) return; if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); pushHistory(); const patch = event.altKey ? (event.key === "ArrowLeft" || event.key === "ArrowRight" ? { colSpan: tile.colSpan + (event.key === "ArrowRight" ? 1 : -1) } : { rowSpan: tile.rowSpan + (event.key === "ArrowDown" ? 1 : -1) }) : (event.key === "ArrowLeft" || event.key === "ArrowRight" ? { col: tile.col + (event.key === "ArrowRight" ? 1 : -1) } : { row: tile.row + (event.key === "ArrowDown" ? 1 : -1) }); const next = resolveDraft({ ...tile, ...patch }, draftRef.current); draftRef.current = next; setDraftTiles(next); commitDraft(next); } }} style={{ gridColumn: `${tile.col} / span ${tile.colSpan}`, gridRow: `${tile.row} / span ${tile.rowSpan}` }} className={`group relative min-h-0 overflow-hidden rounded-xl border bg-[#15151a] text-left outline-none transition ${selectedTile ? "border-white ring-2 ring-white/50" : "border-white/12 hover:border-white/35"}`} aria-label={`${tile.item.title}. Shift arrows move, Shift Alt arrows resize.`}>
                    {tile.item.poster ? <img src={tile.item.poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" /> : null}<span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/20" />
                    <span onPointerDown={(event) => beginTileAction(event, tile, "move")} className="absolute inset-x-0 top-0 z-10 h-9 cursor-grab touch-none active:cursor-grabbing" aria-hidden />
                    <span className="relative z-10 block p-2"><span className="block truncate text-[10px] font-semibold">{tile.item.memberLabel}</span><span className="mt-0.5 block line-clamp-2 text-[9px] text-white/58">{tile.item.title}</span></span>
                    <span onPointerDown={(event) => beginTileAction(event, tile, "resize")} className="absolute bottom-1 right-1 z-20 grid size-6 cursor-nwse-resize place-items-center rounded-md bg-black/70 text-[10px] text-white/70 ring-1 ring-white/15" aria-label="Resize tile">↘</span>
                  </article>;
                })}
                <button type="button" onPointerDown={beginChatAction} onClick={() => { setSelected("chat"); setTab("chat"); }} style={chatStyle as CSSProperties} className={`group relative min-h-0 cursor-grab overflow-hidden rounded-xl border border-dashed bg-violet-500/10 p-3 text-left transition active:cursor-grabbing ${selected === "chat" ? "border-violet-200 ring-2 ring-violet-300/45" : "border-violet-300/45 hover:border-violet-200"}`}><MessageSquare className="size-4 text-violet-200" /><span className="mt-2 block text-[10px] font-semibold">Chat dock · {player.chatDock}</span><span className="mt-1 block text-[9px] text-violet-100/60">Drag to an edge or center to re-place.</span></button>
              </div>
            </div>
          </main>

          <aside className="min-h-0 overflow-y-auto border-t border-white/8 bg-[#111116] p-3 lg:border-l lg:border-t-0">
            <div className="grid grid-cols-5 rounded-xl bg-white/[.035] p-1 ring-1 ring-white/8">{(["layout", "chat", "playback", "audio", "saved"] as StudioTab[]).map((entry) => <button key={entry} type="button" onClick={() => setTab(entry)} aria-pressed={tab === entry} className={`min-h-9 rounded-lg px-1 text-[9px] font-semibold capitalize transition ${tab === entry ? "bg-white text-black" : "text-white/42 hover:text-white"}`}>{entry === "playback" ? "Play" : entry}</button>)}</div>
            {tab === "layout" ? <div className="mt-4 space-y-3"><p className="text-xs font-semibold">{activeTile ? activeTile.item.memberLabel : "Layout"}</p><SettingRange label={`Grid density · ${player.gridColumns} columns`} min={4} max={12} value={player.gridColumns} onChange={(value) => { pushHistory(); player.setGridColumns(value); }} />{activeTile ? <><SettingRange label={`Width · ${activeTile.colSpan} columns`} min={1} max={player.gridColumns} value={activeTile.colSpan} onChange={(value) => { pushHistory(); player.updateTile(activeTile.id, { colSpan: value }); }} /><SettingRange label={`Height · ${activeTile.rowSpan} rows`} min={1} max={6} value={activeTile.rowSpan} onChange={(value) => { pushHistory(); player.updateTile(activeTile.id, { rowSpan: value }); }} /><button type="button" onClick={() => player.removeTile(activeTile.id)} className="min-h-10 w-full rounded-xl bg-red-500/10 px-3 text-left text-[10px] font-semibold text-red-200 ring-1 ring-red-400/20 hover:bg-red-500/15">Remove player</button></> : <p className="text-[10px] leading-4 text-white/42">Select a stream on the canvas to adjust its dimensions or use Shift + arrow keys.</p>}</div> : null}
            {tab === "chat" ? <div className="mt-4 space-y-3"><p className="text-xs font-semibold">Chat dock</p><div className="grid grid-cols-2 gap-2">{(["left", "right", "bottom", "floating"] as const).map((dock) => <button key={dock} type="button" onClick={() => { pushHistory(); player.setChatDock(dock); }} aria-pressed={player.chatDock === dock} className={`min-h-10 rounded-lg text-[10px] font-semibold capitalize ring-1 transition ${player.chatDock === dock ? "bg-white text-black ring-white" : "bg-white/[.035] text-white/60 ring-white/10 hover:bg-white/10"}`}>{dock}</button>)}</div><div className="grid grid-cols-3 gap-1 rounded-xl bg-white/[.035] p-1 ring-1 ring-white/8">{(["combined", "columns", "focused"] as const).map((mode) => <button key={mode} type="button" onClick={() => player.setChatMode(mode)} aria-pressed={player.chatMode === mode} className={`min-h-9 rounded-lg text-[9px] font-semibold capitalize ${player.chatMode === mode ? "bg-white text-black" : "text-white/50 hover:text-white"}`}>{mode === "combined" ? "One room" : mode === "columns" ? "Separate" : "Focus"}</button>)}</div><SettingToggle label="Show timestamps" description="Show each message’s local send time." value={player.showChatTimestamps} onChange={player.setShowChatTimestamps} /><SettingRange label={`Text size · ${Math.round(player.chatTextScale * 100)}%`} min={0.7} max={1.8} value={player.chatTextScale} onChange={player.setChatTextScale} /><SettingRange label={`Dock size · ${player.chatDock === "bottom" ? player.chatDockSize.bottom : player.chatDockSize.side}px`} min={player.chatDock === "bottom" ? 220 : 280} max={player.chatDock === "bottom" ? 560 : 520} value={player.chatDock === "bottom" ? player.chatDockSize.bottom : player.chatDockSize.side} onChange={(value) => player.setChatDockSize(player.chatDock === "bottom" ? { bottom: value } : { side: value })} /></div> : null}
            {tab === "playback" ? <div className="mt-4 space-y-3"><p className="text-xs font-semibold">Playback</p><SettingSelect label="Autoplay" value={player.autoplayMode} onChange={(value) => player.setAutoplayMode(value as typeof player.autoplayMode)} options={AUTOPLAY_MODES.map((entry) => ({ value: entry.id, label: entry.label }))} /><SettingSelect label="Playback quality" value={player.qualityPreference} onChange={(value) => player.setQualityPreference(value as typeof player.qualityPreference)} options={[{ value: "auto", label: "Adaptive" }, { value: "best", label: "Best available" }, { value: "balanced", label: "Balanced" }, { value: "data-saver", label: "Data saver" }]} /><SettingRange label={`Active streams · ${player.maxActivePlayers}`} min={1} max={8} value={player.maxActivePlayers} onChange={player.setMaxActivePlayers} /><SettingToggle label="Adaptive performance" description="Keep focused streams responsive; hold hidden background tiles when needed." value={player.dataSaver} onChange={player.setDataSaver} /><SettingToggle label="Captions" description="Show captions on supported sources." value={player.captionsEnabled} onChange={player.setCaptionsEnabled} /></div> : null}
            {tab === "audio" ? <div className="mt-4 space-y-3"><p className="text-xs font-semibold">Audio + sync</p><SettingToggle label="Mix audio" description="Allow multiple streams to be audible." value={player.mixAudio} onChange={player.setMixAudio} /><button type="button" onClick={player.muteAll} className="min-h-10 w-full rounded-xl bg-white/6 px-3 text-left text-[10px] font-semibold text-white/70 ring-1 ring-white/10 hover:bg-white/10">Mute every tile</button>{player.tiles.map((tile) => <div key={tile.id} className="rounded-xl bg-white/[.035] p-2 ring-1 ring-white/8"><div className="flex items-center gap-2"><button type="button" onClick={() => player.focusTile(tile.id, { takeAudio: true })} className="grid size-7 place-items-center rounded-lg bg-white/8 text-white/70 hover:bg-white hover:text-black"><Volume2 className="size-3.5" /></button><span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-white/72">{tile.item.memberLabel}</span></div><input type="range" min="0" max="1" step="0.05" value={tile.muted ? 0 : tile.volume} onChange={(event) => player.updateTile(tile.id, { volume: Number(event.target.value), muted: Number(event.target.value) === 0 })} className="mt-2 h-7 w-full cursor-pointer accent-white" aria-label={`${tile.item.memberLabel} volume`} /></div>)}</div> : null}
            {tab === "saved" ? <div className="mt-4 space-y-3"><p className="text-xs font-semibold">Saved layouts</p><label className="grid gap-1 text-[10px] text-white/45">Layout name<input value={layoutName} onChange={(event) => onLayoutName(event.target.value)} placeholder="My room" className="min-h-10 rounded-xl bg-white/5 px-3 text-xs text-white ring-1 ring-white/10 outline-none focus:ring-white/25" /></label><button type="button" onClick={onSave} className="min-h-10 w-full rounded-xl bg-white px-3 text-[10px] font-semibold text-black">Save this layout</button>{canSaveLayouts ? <div className="space-y-1">{player.savedLayouts.map((layout) => <div key={layout.name} className="flex items-center gap-2 rounded-xl bg-white/[.035] p-2 ring-1 ring-white/8"><button type="button" onClick={() => player.loadLayout(layout.name)} className="min-h-8 min-w-0 flex-1 truncate text-left text-[10px] font-semibold text-white/72">{layout.name}</button><button type="button" onClick={() => void player.deleteLayout(layout.name)} className="text-[9px] text-white/40 hover:text-red-200">Delete</button></div>)}</div> : <a href={savedLayoutsHref} className="block rounded-xl bg-white/[.035] p-3 text-[10px] leading-4 text-white/50 ring-1 ring-white/8">{savedLayoutsPlan} unlocks synced saved rooms.</a>}</div> : null}
          </aside>
        </div>
      </section>
    </div>
  );
}

type TheaterStudioAction = {
  kind: "move" | "resize" | "chat" | "chat-resize";
  pointerId: number;
  tileId?: string;
  startX: number;
  startY: number;
  board: DOMRect;
  before: StudioWorkspaceSnapshot;
  startRect: NormalizedRect;
} | null;

function cloneStudioSnapshot(snapshot: WorkspaceSnapshot): StudioWorkspaceSnapshot {
  const source = snapshot as StudioWorkspaceSnapshot;
  return {
    ...source,
    tiles: source.tiles.map((tile) => ({
      ...tile,
      item: { ...tile.item },
      ...(tile.rect ? { rect: { ...tile.rect } } : {}),
    })),
    chatChannels: [...source.chatChannels],
    chatDockSize: { ...source.chatDockSize },
    ...(source.chatFloatingRect ? { chatFloatingRect: { ...source.chatFloatingRect } } : {}),
  };
}

function studioDensity(snapshot: StudioWorkspaceSnapshot) {
  return Math.max(4, Math.min(24, Math.round(snapshot.snapDensity ?? 12)));
}

function studioTiles(snapshot: StudioWorkspaceSnapshot): RoomLayoutTile[] {
  const density = studioDensity(snapshot);
  const raw = snapshot.tiles.map((tile) => ({ id: tile.id, rect: roomTileRect(tile, density, density) }));
  // Mirror the Theater surface exactly while a preset is still untouched:
  // the pinned main source owns the cinematic slot, while simple selection
  // only changes details and audio. Once any geometry is edited, the saved
  // rectangles take over and stay literal.
  return roomLayoutMatchesPreset(snapshot.preset, raw, density)
    ? resolvePresetRoomLayout(snapshot.preset, raw, {
        focusedId: snapshot.tiles.find((tile) => tile.pinned)?.id ?? snapshot.tiles[0]?.id ?? null,
        snapDensity: density,
      })
    : raw;
}

function studioTileRect(tile: WorkspaceTile, snapshot: StudioWorkspaceSnapshot): NormalizedRect {
  const density = studioDensity(snapshot);
  return studioTiles(snapshot).find((entry) => entry.id === tile.id)?.rect
    ?? roomTileRect(tile, density, density);
}

function applyStudioRects(
  snapshot: StudioWorkspaceSnapshot,
  tiles: readonly RoomLayoutTile[],
): StudioWorkspaceSnapshot {
  const density = studioDensity(snapshot);
  const byId = new Map(tiles.map((tile) => [tile.id, tile.rect]));
  return {
    ...snapshot,
    // A rejected collision result must never make a source disappear from the
    // Studio or the live room. Callers only commit valid solutions, but this
    // fallback also makes the boundary safe for future inspector actions.
    tiles: snapshot.tiles.map((tile) => {
      const rect = byId.get(tile.id) ?? roomTileRect(tile, density, density);
      return {
        ...tile,
        ...normalizedRectToGridPosition(rect, density, density),
        rect,
      };
    }),
  };
}

function studioDefaultDockRect(dock: StudioWorkspaceSnapshot["chatDock"]): NormalizedRect {
  if (dock === "left") return { x: 0.025, y: 0.075, width: 0.24, height: 0.85 };
  if (dock === "bottom") return { x: 0.16, y: 0.72, width: 0.68, height: 0.25 };
  if (dock === "floating") return { x: 0.62, y: 0.18, width: 0.31, height: 0.52 };
  return { x: 0.735, y: 0.075, width: 0.24, height: 0.85 };
}

function studioDockRect(snapshot: StudioWorkspaceSnapshot): NormalizedRect {
  return snapshot.chatDock === "floating"
    ? snapshot.chatFloatingRect ?? studioDefaultDockRect(snapshot.chatDock)
    : studioDefaultDockRect(snapshot.chatDock);
}

/**
 * Studio uses this same readable reference space as workspace migration. Side
 * and bottom docks reserve real canvas area rather than pretending chat is
 * another media tile. Floating remains a true normalized overlay.
 */
function studioDockPreviewRect(snapshot: StudioWorkspaceSnapshot): NormalizedRect {
  if (snapshot.chatDock === "floating") return studioDockRect(snapshot);
  const side = Math.max(0.18, Math.min(0.34, snapshot.chatDockSize.side / LEGACY_FLOATING_REFERENCE_VIEWPORT.width));
  const bottom = Math.max(0.22, Math.min(0.48, snapshot.chatDockSize.bottom / LEGACY_FLOATING_REFERENCE_VIEWPORT.height));
  if (snapshot.chatDock === "left") return { x: 0, y: 0, width: side, height: 1 };
  if (snapshot.chatDock === "bottom") return { x: 0, y: 1 - bottom, width: 1, height: bottom };
  if (snapshot.chatDock === "right") return { x: 1 - side, y: 0, width: side, height: 1 };
  return { x: 0, y: 0, width: 0, height: 0 };
}

function studioMediaPreviewRect(rect: NormalizedRect, snapshot: StudioWorkspaceSnapshot): NormalizedRect {
  if (snapshot.chatDock === "closed" || snapshot.chatDock === "floating") return rect;
  const dock = studioDockPreviewRect(snapshot);
  if (snapshot.chatDock === "left") {
    return { ...rect, x: dock.width + rect.x * (1 - dock.width), width: rect.width * (1 - dock.width) };
  }
  if (snapshot.chatDock === "right") {
    return { ...rect, x: rect.x * (1 - dock.width), width: rect.width * (1 - dock.width) };
  }
  return { ...rect, y: rect.y * (1 - dock.height), height: rect.height * (1 - dock.height) };
}

function studioPreviewTileStyle(tile: WorkspaceTile, snapshot: StudioWorkspaceSnapshot): React.CSSProperties {
  const density = studioDensity(snapshot);
  const position = normalizedRectToGridPosition(studioMediaPreviewRect(studioTileRect(tile, snapshot), snapshot), density, density);
  return {
    gridColumn: `${position.col} / span ${position.colSpan}`,
    gridRow: `${position.row} / span ${position.rowSpan}`,
    minHeight: 0,
  };
}

function studioSnapshotEqual(left: StudioWorkspaceSnapshot, right: StudioWorkspaceSnapshot) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * A bounded, poster-only editing surface.  It intentionally shares its
 * normalized geometry with the room while the real provider players stay
 * mounted beneath the overlay.  Pointer updates only touch this local draft;
 * one atomic provider update happens when the pointer is released.
 */
function RoomStudio({
  onClose, layoutName, onLayoutName, onSave, canSaveLayouts, savedLayoutsHref, savedLayoutsPlan, liveCount, onAdd, onFill, onShare,
}: {
  onClose: () => void;
  layoutName: string;
  onLayoutName: (value: string) => void;
  onSave: () => void;
  canSaveLayouts: boolean;
  savedLayoutsHref: string;
  savedLayoutsPlan: string;
  liveCount: number;
  onAdd: () => void;
  onFill: () => void;
  onShare: () => void;
}) {
  const player = usePlayer();
  const initialRef = useRef<StudioWorkspaceSnapshot | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const actionRef = useRef<TheaterStudioAction>(null);
  const pendingPointerRef = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  const [draft, setDraft] = useState<StudioWorkspaceSnapshot>(() => cloneStudioSnapshot(player.workspaceSnapshot("Room Studio")));
  const draftRef = useRef(draft);
  const [selected, setSelected] = useState<string | "chat">(draft.focusedTileId ?? "chat");
  const [tab, setTab] = useState<StudioTab>("layout");
  const [presetTrayOpen, setPresetTrayOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [history, setHistory] = useState<StudioWorkspaceSnapshot[]>([]);
  const [future, setFuture] = useState<StudioWorkspaceSnapshot[]>([]);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dockEditStartRef = useRef<StudioWorkspaceSnapshot | null>(null);
  const inspectorEditStartRef = useRef<StudioWorkspaceSnapshot | null>(null);

  const replaceDraft = useCallback((next: StudioWorkspaceSnapshot, markDirty = true) => {
    const cloned = cloneStudioSnapshot(next);
    draftRef.current = cloned;
    setDraft(cloned);
    if (markDirty) setDirty(true);
  }, []);

  useEffect(() => {
    const snapshot = cloneStudioSnapshot(player.workspaceSnapshot("Room Studio"));
    if (!initialRef.current) {
      initialRef.current = snapshot;
      replaceDraft(snapshot, false);
      return;
    }
    if (!dirty && !actionRef.current) replaceDraft(snapshot, false);
  }, [dirty, player.chatChannels, player.chatDock, player.chatDockSize, player.chatFloatingRect, player.chatFocusedLogin, player.chatMode, player.chatTextScale, player.focusedTileId, player.gridColumns, player.layoutPreset, player.showChatTimestamps, player.snapDensity, player.tiles, replaceDraft, player]);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  // Room Studio is a real full-screen dialog, not a visual overlay. Keep
  // keyboard focus inside it and return users to the Customize trigger after
  // it closes, matching the rest of the player dialogs.
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = document.getElementById("multiview-setup-modal");
      const focusable = Array.from(dialog?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ) ?? []).filter((element) => element.tabIndex >= 0 && !element.hidden && element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      window.requestAnimationFrame(() => {
        if (previousFocus?.isConnected) previousFocus.focus();
      });
    };
  }, []);

  // Pointer capture deliberately keeps movement local to the lightweight
  // Studio preview. Escape must work even while the captured move/resize
  // handle owns focus instead of the board itself.
  const cancelActiveAction = useCallback(() => {
    const action = actionRef.current;
    if (!action) return false;
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingPointerRef.current = null;
    actionRef.current = null;
    replaceDraft(action.before, false);
    setBlocked(false);
    return true;
  }, [replaceDraft]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !cancelActiveAction()) return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [cancelActiveAction]);

  const commitDraft = useCallback((next: StudioWorkspaceSnapshot, before?: StudioWorkspaceSnapshot) => {
    const normalized = cloneStudioSnapshot(next);
    const applied = player.applyWorkspaceLayout(normalized);
    if (!applied) player.importWorkspace(normalized);
    if (before && !studioSnapshotEqual(before, normalized)) {
      setHistory((items) => [...items, cloneStudioSnapshot(before)].slice(-30));
      setFuture([]);
    }
    replaceDraft(normalized, true);
    setBlocked(false);
  }, [player, replaceDraft]);

  const updateDraft = useCallback((updater: (current: StudioWorkspaceSnapshot) => StudioWorkspaceSnapshot) => {
    const next = updater(draftRef.current);
    replaceDraft(next);
    return next;
  }, [replaceDraft]);

  const applyPreset = useCallback((preset: WorkspacePreset) => {
    const before = cloneStudioSnapshot(draftRef.current);
    const density = studioDensity(before);
    const rects = presetNormalizedRects(preset as Parameters<typeof presetNormalizedRects>[0], before.tiles.length, density);
    const next = applyStudioRects({ ...before, preset, columns: density }, before.tiles.map((tile, index) => ({ id: tile.id, rect: rects[index] ?? rects.at(-1)! })));
    commitDraft(next, before);
    setSelected(next.focusedTileId ?? next.tiles[0]?.id ?? "chat");
  }, [commitDraft]);

  const beginTileAction = (event: React.PointerEvent<HTMLElement>, tile: RoomTileWithRect, kind: "move" | "resize") => {
    const board = boardRef.current?.getBoundingClientRect();
    if (!board) return;
    event.preventDefault();
    event.stopPropagation();
    const before = cloneStudioSnapshot(draftRef.current);
    actionRef.current = {
      kind,
      pointerId: event.pointerId,
      tileId: tile.id,
      startX: event.clientX,
      startY: event.clientY,
      board,
      before,
      startRect: studioTileRect(tile, before),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelected(tile.id);
    setTab("layout");
    setBlocked(false);
  };

  const beginChatAction = (event: React.PointerEvent<HTMLElement>) => {
    const board = boardRef.current?.getBoundingClientRect();
    if (!board) return;
    event.preventDefault();
    const before = cloneStudioSnapshot(draftRef.current);
    actionRef.current = {
      kind: "chat",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      board,
      before,
      startRect: studioDockPreviewRect(before),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelected("chat");
    setTab("chat");
  };

  const beginChatResizeAction = (event: React.PointerEvent<HTMLElement>) => {
    const board = boardRef.current?.getBoundingClientRect();
    if (!board) return;
    event.preventDefault();
    event.stopPropagation();
    const before = cloneStudioSnapshot(draftRef.current);
    actionRef.current = {
      kind: "chat-resize",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      board,
      before,
      startRect: studioDockRect(before),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelected("chat");
    setTab("chat");
  };

  const updatePointerDraft = useCallback((clientX: number, clientY: number) => {
    const action = actionRef.current;
    if (!action) return;
    const dx = (clientX - action.startX) / Math.max(1, action.board.width);
    const dy = (clientY - action.startY) / Math.max(1, action.board.height);
    const density = studioDensity(action.before);
    if (action.kind === "chat" || action.kind === "chat-resize") {
      const rect = normalizeRoomRect({
        ...action.startRect,
        ...(action.kind === "chat-resize"
          ? { width: action.startRect.width + dx, height: action.startRect.height + dy }
          : { x: action.startRect.x + dx, y: action.startRect.y + dy }),
      }, action.startRect, { minWidth: 0.15, minHeight: 0.18 });
      if (action.kind === "chat-resize") {
        replaceDraft({ ...action.before, chatDock: "floating", chatFloatingRect: rect }, true);
        return;
      }
      const dock = rect.y > 0.68 ? "bottom" : rect.x < 0.12 ? "left" : rect.x + rect.width > 0.88 ? "right" : "floating";
      replaceDraft({ ...action.before, chatDock: dock, ...(dock === "floating" ? { chatFloatingRect: rect } : {}) }, true);
      return;
    }
    if (!action.tileId) return;
    // Tile geometry is stored in the media board, not the reserved chat
    // band. Convert the visible-canvas delta back to that logical board so a
    // drag stays under the pointer with left/right/bottom chat docks.
    const reservedDock = studioDockPreviewRect(action.before);
    const mediaDx = action.before.chatDock === "left" || action.before.chatDock === "right"
      ? dx / Math.max(0.01, 1 - reservedDock.width)
      : dx;
    const mediaDy = action.before.chatDock === "bottom"
      ? dy / Math.max(0.01, 1 - reservedDock.height)
      : dy;
    const requested = action.kind === "move"
      ? { ...action.startRect, x: action.startRect.x + mediaDx, y: action.startRect.y + mediaDy }
      : { ...action.startRect, width: action.startRect.width + mediaDx, height: action.startRect.height + mediaDy };
    const solution = moveAndResolveRoomLayout(studioTiles(action.before), action.tileId, requested, {
      snapDensity: density,
      minWidth: 1 / density,
      minHeight: 1 / density,
    });
    // If every source cannot be packed, leave the last legal preview in
    // place. In particular, never render the solver's partial output (which
    // omits rejected ids) as though it were a valid room.
    if (!solution.valid) {
      setBlocked(true);
      return;
    }
    setBlocked(false);
    replaceDraft(applyStudioRects({ ...action.before, preset: "freeform", columns: density, snapDensity: density }, solution.tiles), true);
  }, [replaceDraft]);

  const onBoardPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!actionRef.current || event.pointerId !== actionRef.current.pointerId) return;
    pendingPointerRef.current = { x: event.clientX, y: event.clientY };
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const pending = pendingPointerRef.current;
      if (pending) updatePointerDraft(pending.x, pending.y);
    });
  };

  const finishAction = (event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const action = actionRef.current;
    if (!action || event.pointerId !== action.pointerId) return;
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (cancelled) {
      cancelActiveAction();
    } else if (!studioSnapshotEqual(action.before, draftRef.current)) {
      commitDraft(draftRef.current, action.before);
    }
    pendingPointerRef.current = null;
    actionRef.current = null;
  };

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    const current = cloneStudioSnapshot(draftRef.current);
    setHistory((items) => items.slice(0, -1));
    setFuture((items) => [current, ...items].slice(0, 30));
    commitDraft(previous);
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    const current = cloneStudioSnapshot(draftRef.current);
    setFuture((items) => items.slice(1));
    setHistory((items) => [...items, current].slice(-30));
    commitDraft(next);
  };

  const requestClose = () => {
    if (dirty) setCloseConfirm(true);
    else onClose();
  };

  const discardChanges = () => {
    const initial = initialRef.current;
    if (initial) {
      const restored = cloneStudioSnapshot(initial);
      const applied = player.applyWorkspaceLayout(restored);
      if (!applied) player.importWorkspace(restored);
      replaceDraft(restored, false);
    }
    setHistory([]);
    setFuture([]);
    setDirty(false);
    setCloseConfirm(false);
    onClose();
  };

  const activeTile = selected === "chat" ? null : draft.tiles.find((tile) => tile.id === selected) ?? null;
  const density = studioDensity(draft);
  const dockRect = studioDockPreviewRect(draft);
  const dockStyle: React.CSSProperties = {
    left: `${dockRect.x * 100}%`,
    top: `${dockRect.y * 100}%`,
    width: `${dockRect.width * 100}%`,
    height: `${dockRect.height * 100}%`,
  };
  const setDraftAndCommit = (next: StudioWorkspaceSnapshot) => {
    const before = cloneStudioSnapshot(draftRef.current);
    commitDraft(next, before);
  };

  // Ranges keep their work in the light Studio draft while the thumb moves,
  // then issue exactly one full workspace transaction when the user releases
  // it. That keeps the live ChatSession and provider tiles mounted.
  const beginDockEdit = () => {
    if (!dockEditStartRef.current) dockEditStartRef.current = cloneStudioSnapshot(draftRef.current);
  };

  const commitDockEdit = () => {
    const before = dockEditStartRef.current;
    dockEditStartRef.current = null;
    if (before && !studioSnapshotEqual(before, draftRef.current)) commitDraft(draftRef.current, before);
  };

  const beginInspectorEdit = () => {
    if (!inspectorEditStartRef.current) inspectorEditStartRef.current = cloneStudioSnapshot(draftRef.current);
  };

  const commitInspectorEdit = () => {
    const before = inspectorEditStartRef.current;
    inspectorEditStartRef.current = null;
    if (before && !studioSnapshotEqual(before, draftRef.current)) commitDraft(draftRef.current, before);
  };

  const updateDraftDockSize = (patch: Partial<StudioWorkspaceSnapshot["chatDockSize"]>) => {
    updateDraft((current) => ({
      ...current,
      chatDockSize: { ...current.chatDockSize, ...patch },
    }));
  };

  const updateFloatingDockRect = (patch: Partial<NormalizedRect>) => {
    updateDraft((current) => ({
      ...current,
      chatDock: "floating",
      chatFloatingRect: normalizeRoomRect(
        { ...(current.chatFloatingRect ?? studioDefaultDockRect("floating")), ...patch },
        studioDefaultDockRect("floating"),
        { minWidth: 0.15, minHeight: 0.18 },
      ),
    }));
  };

  const setTileRect = (tileId: string, patch: Partial<NormalizedRect>) => {
    const before = cloneStudioSnapshot(draftRef.current);
    const solution = moveAndResolveRoomLayout(studioTiles(before), tileId, patch, {
      snapDensity: studioDensity(before), minWidth: 1 / studioDensity(before), minHeight: 1 / studioDensity(before),
    });
    if (!solution.valid) {
      setBlocked(true);
      return;
    }
    const density = studioDensity(before);
    setBlocked(false);
    setDraftAndCommit(applyStudioRects({ ...before, preset: "freeform", columns: density, snapDensity: density }, solution.tiles));
  };

  const handleStudioKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && actionRef.current) {
      event.preventDefault();
      cancelActiveAction();
      return;
    }
    if (!activeTile || event.target !== event.currentTarget) return;
    if (event.key === "Enter") {
      event.preventDefault();
      setDraftAndCommit({ ...draftRef.current, focusedTileId: activeTile.id });
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      const before = cloneStudioSnapshot(draftRef.current);
      const next = { ...before, tiles: before.tiles.filter((tile) => tile.id !== activeTile.id), focusedTileId: before.tiles.find((tile) => tile.id !== activeTile.id)?.id ?? null };
      setSelected(next.focusedTileId ?? "chat");
      setDraftAndCommit(next);
      return;
    }
    const direction: [number, number] | null = event.key === "ArrowLeft" ? [-1, 0] : event.key === "ArrowRight" ? [1, 0] : event.key === "ArrowUp" ? [0, -1] : event.key === "ArrowDown" ? [0, 1] : null;
    if (!direction) return;
    event.preventDefault();
    const amount = 1 / density;
    const rect = studioTileRect(activeTile, draftRef.current);
    setTileRect(activeTile.id, event.shiftKey
      ? { width: rect.width + direction[0] * amount, height: rect.height + direction[1] * amount }
      : { x: rect.x + direction[0] * amount, y: rect.y + direction[1] * amount });
  };

  return (
    <div className="fixed inset-0 z-[90] bg-[#040405]/96 text-white backdrop-blur-sm" role="presentation">
      <section id="multiview-setup-modal" role="dialog" aria-modal="true" aria-label="Room Studio" className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#0a0a0d]">
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 sm:min-h-16 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <button type="button" onClick={requestClose} className="hidden min-h-10 rounded-xl px-3 text-[10px] font-semibold text-white/65 ring-1 ring-white/10 transition hover:bg-white/8 hover:text-white sm:inline-flex">Back to room</button>
            <div className="min-w-0"><p className="text-sm font-semibold tracking-tight">Room Studio</p><p className="hidden truncate text-[10px] text-white/40 sm:block">Arrange a Theater room without interrupting its streams.</p></div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" disabled={!history.length} onClick={undo} className="min-h-10 rounded-lg px-2.5 text-[10px] font-semibold text-white/65 ring-1 ring-white/10 transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-30">Undo</button>
            <button type="button" disabled={!future.length} onClick={redo} className="hidden min-h-10 rounded-lg px-2.5 text-[10px] font-semibold text-white/65 ring-1 ring-white/10 transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-30 sm:inline-flex">Redo</button>
            <button type="button" onClick={onShare} className="hidden min-h-10 rounded-lg px-3 text-[10px] font-semibold text-white/65 ring-1 ring-white/10 transition hover:bg-white/8 sm:inline-flex">Share</button>
            <button type="button" onClick={() => { commitDraft(draftRef.current); onSave(); setDirty(false); }} className="min-h-10 rounded-lg bg-white px-3 text-[10px] font-semibold text-black shadow-xs-skeuomorphic transition hover:bg-white/90">Save layout</button>
            <button ref={closeButtonRef} type="button" onClick={requestClose} className="grid size-10 place-items-center rounded-lg text-white/55 transition hover:bg-white/8 hover:text-white" aria-label="Close Room Studio"><X className="size-4" /></button>
          </div>
        </header>

        <div className={`flex min-h-0 flex-1 flex-col lg:grid ${presetTrayOpen ? (inspectorOpen ? "lg:grid-cols-[13rem_minmax(0,1fr)_20rem]" : "lg:grid-cols-[13rem_minmax(0,1fr)_3.25rem]") : (inspectorOpen ? "lg:grid-cols-[3.25rem_minmax(0,1fr)_20rem]" : "lg:grid-cols-[3.25rem_minmax(0,1fr)_3.25rem]")}`}>
          <aside className={`order-2 flex shrink-0 gap-2 overflow-x-auto border-t border-white/8 bg-[#0c0c0f] p-2.5 [scrollbar-width:none] transition-[padding] lg:order-none lg:block lg:overflow-y-auto lg:border-r lg:border-t-0 ${presetTrayOpen ? "lg:p-3" : "lg:p-1.5"}`}>
            <div className="hidden lg:block">
              <div className={`flex min-h-10 items-center gap-2 ${presetTrayOpen ? "justify-between" : "justify-center"}`}>
                <p className={presetTrayOpen ? "text-[10px] font-bold uppercase tracking-[.14em] text-white/38" : "sr-only"}>Room styles</p>
                <button type="button" aria-expanded={presetTrayOpen} aria-label={presetTrayOpen ? "Collapse room styles" : "Open room styles"} onClick={() => setPresetTrayOpen((value) => !value)} className="grid size-9 place-items-center rounded-lg text-white/45 transition hover:bg-white/8 hover:text-white">
                  {presetTrayOpen ? "Hide" : <LayoutGrid className="size-3.5" aria-hidden />}
                </button>
              </div>
              {presetTrayOpen ? <>
                <p className="mt-1 text-[10px] leading-4 text-white/35">Start in Theater view, then make it yours.</p>
                <div className="mt-3 flex max-h-[27rem] flex-col gap-2 overflow-y-auto">
                  {WORKSPACE_PRESETS.filter((preset) => preset.id !== "freeform").map((preset) => <button key={preset.id} type="button" onClick={() => applyPreset(preset.id)} aria-pressed={draft.preset === preset.id} className={`min-h-11 shrink-0 rounded-xl px-3 text-left text-[10px] font-semibold ring-1 ring-inset transition ${draft.preset === preset.id ? "bg-white text-black ring-white" : "bg-white/[.035] text-white/65 ring-white/10 hover:bg-white/10 hover:text-white"}`}><span className="block">{preset.label}</span><span className="mt-0.5 block text-[9px] font-normal opacity-60">{preset.description}</span></button>)}
                </div>
                <div className="mt-3 space-y-2 border-t border-white/8 pt-3"><button type="button" onClick={onAdd} className="min-h-10 w-full rounded-xl bg-white/6 px-3 text-left text-[10px] font-semibold text-white/70 ring-1 ring-white/10 hover:bg-white/10">Add player</button><button type="button" disabled={!liveCount} onClick={onFill} className="min-h-10 w-full rounded-xl bg-white/6 px-3 text-left text-[10px] font-semibold text-white/70 ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-35">Watch live channels</button></div>
              </> : null}
            </div>
            <div className="flex gap-2 lg:hidden">
              {WORKSPACE_PRESETS.filter((preset) => preset.id !== "freeform").map((preset) => <button key={preset.id} type="button" onClick={() => applyPreset(preset.id)} aria-pressed={draft.preset === preset.id} className={`min-h-11 shrink-0 rounded-xl px-3 text-left text-[10px] font-semibold ring-1 ring-inset transition ${draft.preset === preset.id ? "bg-white text-black ring-white" : "bg-white/[.035] text-white/65 ring-white/10 hover:bg-white/10 hover:text-white"}`}><span className="block">{preset.label}</span></button>)}
            </div>
          </aside>

          <main className="relative order-1 min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,.06),transparent_42%)] p-3 sm:p-5 lg:order-none">
            <div className="mx-auto flex min-h-full max-w-[1180px] flex-col justify-center">
              <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-white/85">Live layout canvas</p><p className="mt-1 text-[10px] text-white/42">Streams keep playing behind this lightweight preview. Release to apply.</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-semibold ring-1 ${blocked ? "bg-amber-300/10 text-amber-200 ring-amber-200/20" : "bg-emerald-400/10 text-emerald-300 ring-emerald-300/20"}`}>{blocked ? "Placement blocked" : "Live on release"}</span></div>
              <div
                ref={boardRef}
                role="application"
                tabIndex={0}
                aria-label="Room layout canvas. Arrow keys move the selected tile, Shift plus arrows resize it, Enter makes it main, and Delete removes it."
                onKeyDown={handleStudioKeyDown}
                onPointerMove={onBoardPointerMove}
                onPointerUp={(event) => finishAction(event)}
                onPointerCancel={(event) => finishAction(event, true)}
                className="relative grid aspect-video min-h-0 w-full grid-cols-12 grid-rows-12 gap-1.5 overflow-hidden rounded-[1.4rem] border border-white/12 bg-[#09090c] p-2.5 shadow-[0_32px_120px_rgba(0,0,0,.55)] outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:min-h-[18rem] sm:gap-2 sm:p-3"
              >
                {draft.tiles.map((tile) => {
                  const selectedTile = selected === tile.id;
                  return <article key={tile.id} role="button" tabIndex={-1} onClick={() => { setSelected(tile.id); setTab("layout"); boardRef.current?.focus(); }} style={studioPreviewTileStyle(tile, draft)} className={`group relative min-h-0 overflow-hidden rounded-xl border bg-[#15151a] text-left transition ${selectedTile ? "border-white ring-2 ring-white/50" : "border-white/12 hover:border-white/35"}`} aria-label={`${tile.item.title}. Drag the top edge to move and the corner to resize.`}>
                    {tile.item.poster ? <img src={tile.item.poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" /> : null}<span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/20" />
                    <button type="button" onPointerDown={(event) => beginTileAction(event, tile, "move")} className="absolute inset-x-0 top-0 z-10 h-9 cursor-grab touch-none active:cursor-grabbing" aria-label={`Move ${tile.item.title}`} />
                    <span className="relative z-[2] block p-2"><span className="flex items-center gap-1.5"><span className="truncate text-[10px] font-semibold">{tile.item.memberLabel}</span>{tile.item.kind === "live" ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/85 px-1 py-0.5 text-[7px] font-bold uppercase tracking-wide text-white"><span className="size-1 rounded-full bg-white" />Live</span> : null}</span><span className="mt-0.5 block line-clamp-2 text-[9px] text-white/58">{tile.item.title}</span><span className="mt-1 flex flex-wrap gap-1 text-[8px] text-white/64"><span className="rounded bg-black/42 px-1 py-0.5">{contentShape(tile.item) === "portrait" ? "9:16" : "16:9"}</span><span className="rounded bg-black/42 px-1 py-0.5">{tile.muted ? "Muted" : "Audio on"}</span>{tile.id === draft.focusedTileId ? <span className="rounded bg-white/16 px-1 py-0.5 font-semibold text-white/90">Main</span> : null}</span></span>
                    <button type="button" onPointerDown={(event) => beginTileAction(event, tile, "resize")} className="absolute bottom-1 right-1 z-20 grid size-7 cursor-nwse-resize place-items-center rounded-md bg-black/75 text-[10px] text-white/80 ring-1 ring-white/15" aria-label={`Resize ${tile.item.title}`}>↘</button>
                  </article>;
                })}
                {draft.chatDock !== "closed" ? <div style={dockStyle} className={`absolute z-30 min-h-0 overflow-hidden rounded-xl border border-dashed bg-[#121216]/95 p-2 text-left shadow-xl transition ${selected === "chat" ? "border-white/75 ring-2 ring-white/35" : "border-white/28 hover:border-white/60"}`}><button type="button" onPointerDown={beginChatAction} onClick={() => { setSelected("chat"); setTab("chat"); }} className="absolute inset-0 z-10 cursor-grab touch-none active:cursor-grabbing" aria-label={`Move chat dock to another edge. Current position: ${draft.chatDock}`} /><span className="relative z-[2] flex items-center gap-1.5 text-white/80"><MessageSquare className="size-3.5" /><span className="text-[9px] font-semibold">Chat dock · {draft.chatDock}</span></span><span className="relative z-[2] mt-2 block h-px bg-white/10" /><span className="relative z-[2] mt-2 block space-y-1.5"><span className="block h-1.5 w-3/4 rounded-full bg-white/22" /><span className="block h-1.5 w-[58%] rounded-full bg-white/12" /><span className="block h-1.5 w-[82%] rounded-full bg-white/16" /></span><span className="relative z-[2] mt-2 hidden text-[8px] text-white/42 sm:block">Drag to dock; resize from Inspector.</span>{draft.chatDock === "floating" ? <button type="button" onPointerDown={beginChatResizeAction} className="absolute bottom-1 right-1 z-20 grid size-7 cursor-nwse-resize place-items-center rounded-md bg-black/75 text-[10px] text-white/80 ring-1 ring-white/15" aria-label="Resize floating chat dock">↘</button> : null}</div> : null}
              </div>
            </div>
          </main>

          <aside className={`order-3 min-h-0 shrink-0 overflow-y-auto border-t border-white/8 bg-[#101014] transition-[max-height] lg:border-l lg:border-t-0 ${inspectorOpen ? "max-h-[42dvh] lg:max-h-none" : "max-h-12 lg:max-h-none"}`}>
            <div className={`flex min-h-12 items-center gap-2 border-b border-white/8 px-3 ${inspectorOpen ? "justify-between" : "justify-center"}`}><p className={inspectorOpen ? "text-[10px] font-semibold text-white/72" : "sr-only"}>Inspector</p><button type="button" aria-expanded={inspectorOpen} onClick={() => setInspectorOpen((value) => !value)} className="rounded-lg px-2 py-1 text-[9px] font-semibold text-white/45 hover:bg-white/8 hover:text-white">{inspectorOpen ? "Collapse" : "Open"}</button></div>
            {inspectorOpen ? <div className="p-3"><div className="grid grid-cols-5 rounded-xl bg-white/[.035] p-1 ring-1 ring-white/8">{(["layout", "chat", "playback", "audio", "saved"] as StudioTab[]).map((entry) => <button key={entry} type="button" onClick={() => setTab(entry)} aria-pressed={tab === entry} className={`min-h-9 rounded-lg px-1 text-[9px] font-semibold capitalize transition ${tab === entry ? "bg-white text-black" : "text-white/42 hover:text-white"}`}>{entry === "playback" ? "Play" : entry}</button>)}</div>
              {tab === "layout" ? <div className="mt-4 space-y-3"><div><p className="text-xs font-semibold">{activeTile ? activeTile.item.memberLabel : "Theater layout"}</p><p className="mt-1 text-[10px] leading-4 text-white/42">Select a view to move, resize, make main, or remove it.</p></div><SettingRange label={`Snap density · ${density}`} min={4} max={24} value={density} onBegin={beginInspectorEdit} onChange={(value) => updateDraft((current) => ({ ...current, snapDensity: value, columns: value }))} onCommit={commitInspectorEdit} />{activeTile ? <><button type="button" onClick={() => setDraftAndCommit({ ...draftRef.current, focusedTileId: activeTile.id, tiles: draftRef.current.tiles.map((tile) => ({ ...tile, pinned: tile.id === activeTile.id })) })} className="min-h-10 w-full rounded-xl bg-white px-3 text-left text-[10px] font-semibold text-black">Make main</button><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setTileRect(activeTile.id, { width: studioTileRect(activeTile, draftRef.current).width - 1 / density })} className="min-h-10 rounded-xl text-[10px] font-semibold text-white/65 ring-1 ring-white/10 hover:bg-white/8">Narrower</button><button type="button" onClick={() => setTileRect(activeTile.id, { width: studioTileRect(activeTile, draftRef.current).width + 1 / density })} className="min-h-10 rounded-xl text-[10px] font-semibold text-white/65 ring-1 ring-white/10 hover:bg-white/8">Wider</button></div><button type="button" onClick={() => { const before = cloneStudioSnapshot(draftRef.current); const next = { ...before, tiles: before.tiles.filter((tile) => tile.id !== activeTile.id), focusedTileId: before.tiles.find((tile) => tile.id !== activeTile.id)?.id ?? null }; setSelected(next.focusedTileId ?? "chat"); setDraftAndCommit(next); }} className="min-h-10 w-full rounded-xl bg-red-500/10 px-3 text-left text-[10px] font-semibold text-red-100 ring-1 ring-red-400/20 hover:bg-red-500/15">Remove player</button></> : null}</div> : null}
              {tab === "chat" ? (
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-xs font-semibold">Chat dock</p>
                    <p className="mt-1 text-[10px] leading-4 text-white/42">Place one persistent dock beside, below, or over the room.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(["left", "right", "bottom", "floating"] as const).map((dock) => (
                      <button
                        key={dock}
                        type="button"
                        onClick={() => {
                          const current = draftRef.current;
                          setDraftAndCommit({
                            ...current,
                            chatDock: dock,
                            ...(dock === "floating" ? {
                              chatFloatingRect: current.chatFloatingRect ?? studioDefaultDockRect("floating"),
                            } : {}),
                          });
                        }}
                        aria-pressed={draft.chatDock === dock}
                        className={`min-h-10 rounded-lg text-[10px] font-semibold capitalize ring-1 transition ${draft.chatDock === dock ? "bg-white text-black ring-white" : "bg-white/[.035] text-white/60 ring-white/10 hover:bg-white/10"}`}
                      >
                        {dock}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/[.035] p-1 ring-1 ring-white/8">
                    {(["combined", "columns", "focused"] as const).map((mode) => (
                      <button key={mode} type="button" onClick={() => setDraftAndCommit({ ...draftRef.current, chatMode: mode })} aria-pressed={draft.chatMode === mode} className={`min-h-9 rounded-lg text-[9px] font-semibold ${draft.chatMode === mode ? "bg-white text-black" : "text-white/50 hover:text-white"}`}>
                        {mode === "combined" ? "One room" : mode === "columns" ? "Separate" : "Focus"}
                      </button>
                    ))}
                  </div>
                  <div onPointerDown={beginDockEdit} onFocusCapture={beginDockEdit} className="space-y-2">
                    {draft.chatDock === "floating" ? (
                      <>
                        <SettingRange
                          label={`Floating width · ${Math.round(dockRect.width * 100)}%`}
                          min={0.15}
                          max={0.5}
                          step={0.01}
                          value={dockRect.width}
                          onChange={(value) => updateFloatingDockRect({ width: value })}
                          onCommit={commitDockEdit}
                        />
                        <SettingRange
                          label={`Floating height · ${Math.round(dockRect.height * 100)}%`}
                          min={0.18}
                          max={0.82}
                          step={0.01}
                          value={dockRect.height}
                          onChange={(value) => updateFloatingDockRect({ height: value })}
                          onCommit={commitDockEdit}
                        />
                        <p className="rounded-xl bg-violet-400/8 px-3 py-2 text-[9px] leading-4 text-violet-100/65 ring-1 ring-violet-300/12">Drag the chat card on the canvas to set its floating position. Size and position are saved with this room.</p>
                      </>
                    ) : draft.chatDock === "bottom" ? (
                      <SettingRange
                        label={`Dock height · ${draft.chatDockSize.bottom}px`}
                        min={220}
                        max={560}
                        value={draft.chatDockSize.bottom}
                        onChange={(value) => updateDraftDockSize({ bottom: value })}
                        onCommit={commitDockEdit}
                      />
                    ) : (
                      <SettingRange
                        label={`Dock width · ${draft.chatDockSize.side}px`}
                        min={280}
                        max={520}
                        value={draft.chatDockSize.side}
                        onChange={(value) => updateDraftDockSize({ side: value })}
                        onCommit={commitDockEdit}
                      />
                    )}
                  </div>
                  <SettingToggle label="Show timestamps" description="Off by default. Show local message times when you need them." value={draft.showChatTimestamps} onChange={(value) => setDraftAndCommit({ ...draftRef.current, showChatTimestamps: value })} />
                  <SettingRange label={`Text size · ${Math.round(draft.chatTextScale * 100)}%`} min={0.7} max={1.8} step={0.1} value={draft.chatTextScale} onBegin={beginInspectorEdit} onChange={(value) => updateDraft((current) => ({ ...current, chatTextScale: value }))} onCommit={commitInspectorEdit} />
                </div>
              ) : null}
              {tab === "playback" ? <div className="mt-4 space-y-3">
                <p className="text-xs font-semibold">Playback</p>
                <SettingSelect label="Autoplay" value={draft.autoplayMode ?? player.autoplayMode} onChange={(value) => setDraftAndCommit({ ...draftRef.current, autoplayMode: value as typeof player.autoplayMode })} options={AUTOPLAY_MODES.map((entry) => ({ value: entry.id, label: entry.label }))} />
                <SettingRange label={`Live player budget · ${draft.maxActivePlayers ?? player.maxActivePlayers}`} min={1} max={8} value={draft.maxActivePlayers ?? player.maxActivePlayers} onBegin={beginInspectorEdit} onChange={(value) => updateDraft((current) => ({ ...current, maxActivePlayers: value }))} onCommit={commitInspectorEdit} />
                <SettingRange label={`Playback speed · ${(draft.playbackRate ?? player.playbackRate).toFixed(1)}×`} min={0.5} max={2} step={0.1} value={draft.playbackRate ?? player.playbackRate} onBegin={beginInspectorEdit} onChange={(value) => updateDraft((current) => ({ ...current, playbackRate: value }))} onCommit={commitInspectorEdit} />
                <SettingSelect label="Quality" value={draft.qualityPreference ?? player.qualityPreference} onChange={(value) => setDraftAndCommit({ ...draftRef.current, qualityPreference: value as "auto" | "best" | "balanced" | "data-saver" })} options={[{ value: "auto", label: "Auto" }, { value: "best", label: "Best available" }, { value: "balanced", label: "Balanced" }, { value: "data-saver", label: "Data saver" }]} />
                <SettingToggle label="Adaptive performance" description="Prioritize the Theater view when your device or connection is constrained." value={draft.dataSaver ?? player.dataSaver} onChange={(value) => setDraftAndCommit({ ...draftRef.current, dataSaver: value })} />
                <SettingToggle label="Captions" description="Use captions on supported sources." value={draft.captionsEnabled ?? player.captionsEnabled} onChange={(value) => setDraftAndCommit({ ...draftRef.current, captionsEnabled: value })} />
              </div> : null}
              {tab === "audio" ? <div className="mt-4 space-y-3">
                <p className="text-xs font-semibold">Audio + sync</p>
                <SettingToggle label="Mix audio" description="Keep one lead by default; mix only when you choose." value={draft.mixAudio ?? player.mixAudio} onChange={(value) => setDraftAndCommit({ ...draftRef.current, mixAudio: value })} />
                <button type="button" onClick={() => setDraftAndCommit({ ...draftRef.current, tiles: draftRef.current.tiles.map((tile) => ({ ...tile, muted: true })) })} className="min-h-10 w-full rounded-xl bg-white/6 px-3 text-left text-[10px] font-semibold text-white/70 ring-1 ring-white/10 hover:bg-white/10">Mute every tile</button>
                {draft.tiles.map((tile) => <div key={tile.id} className="rounded-xl bg-white/[.035] p-2 ring-1 ring-white/8"><div className="flex items-center gap-2"><button type="button" onClick={() => { const current = draftRef.current; setDraftAndCommit({ ...current, focusedTileId: tile.id, tiles: current.tiles.map((entry) => ({ ...entry, muted: current.mixAudio ? entry.id === tile.id ? false : entry.muted : entry.id !== tile.id })) }); }} className="grid size-7 place-items-center rounded-lg bg-white/8 text-white/70 hover:bg-white hover:text-black" aria-label={`Make ${tile.item.memberLabel} the audio lead`}><Volume2 className="size-3.5" /></button><span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-white/72">{tile.item.memberLabel}</span></div><input type="range" min="0" max="1" step="0.05" value={tile.muted ? 0 : tile.volume} onPointerDown={beginInspectorEdit} onFocus={beginInspectorEdit} onChange={(event) => { const value = Number(event.target.value); updateDraft((current) => ({ ...current, tiles: current.tiles.map((entry) => entry.id === tile.id ? { ...entry, volume: value, muted: value === 0 } : entry) })); }} onPointerUp={commitInspectorEdit} onBlur={commitInspectorEdit} className="mt-2 h-7 w-full cursor-pointer accent-white" aria-label={`${tile.item.memberLabel} volume`} /><SettingRange label={`Sync delay · ${tile.delaySeconds}s`} min={0} max={30} value={tile.delaySeconds} onBegin={beginInspectorEdit} onChange={(value) => updateDraft((current) => ({ ...current, tiles: current.tiles.map((entry) => entry.id === tile.id ? { ...entry, delaySeconds: value } : entry) }))} onCommit={commitInspectorEdit} /></div>)}
              </div> : null}
              {tab === "saved" ? <div className="mt-4 space-y-3"><p className="text-xs font-semibold">Saved layouts</p><label className="grid gap-1 text-[10px] text-white/45">Layout name<input value={layoutName} onChange={(event) => onLayoutName(event.target.value)} placeholder="My Theater room" className="min-h-10 rounded-xl bg-white/5 px-3 text-xs text-white ring-1 ring-white/10 outline-none focus:ring-white/25" /></label><button type="button" onClick={() => { commitDraft(draftRef.current); onSave(); setDirty(false); }} className="min-h-10 w-full rounded-xl bg-white px-3 text-[10px] font-semibold text-black">Save this layout</button>{canSaveLayouts ? <div className="space-y-1">{player.savedLayouts.map((layout) => <div key={layout.name} className="flex items-center gap-2 rounded-xl bg-white/[.035] p-2 ring-1 ring-white/8"><button type="button" onClick={() => { player.loadLayout(layout.name); setDirty(false); }} className="min-h-8 min-w-0 flex-1 truncate text-left text-[10px] font-semibold text-white/72">{layout.name}</button><button type="button" onClick={() => void player.deleteLayout(layout.name)} className="text-[9px] text-white/40 hover:text-red-200">Delete</button></div>)}</div> : <a href={savedLayoutsHref} className="block rounded-xl bg-white/[.035] p-3 text-[10px] leading-4 text-white/50 ring-1 ring-white/8">{savedLayoutsPlan} unlocks synced saved rooms.</a>}</div> : null}
            </div> : null}
          </aside>
        </div>
      </section>
      {closeConfirm ? <div className="fixed inset-0 z-[100] grid place-items-center bg-black/65 p-4" onMouseDown={(event) => { if (event.currentTarget === event.target) setCloseConfirm(false); }}><section role="dialog" aria-modal="true" aria-label="Keep Room Studio changes" className="w-full max-w-sm rounded-2xl border border-white/14 bg-[#141419] p-4 shadow-2xl"><p className="text-sm font-semibold">Keep your room changes?</p><p className="mt-1 text-[11px] leading-5 text-white/48">Changes are live while you edit. Save this room to reuse it, discard to restore the room you opened, or keep editing.</p><div className="mt-4 grid grid-cols-3 gap-2"><button type="button" onClick={() => { commitDraft(draftRef.current); onSave(); setDirty(false); onClose(); }} className="min-h-10 rounded-xl bg-white px-2 text-[10px] font-semibold text-black">Save & close</button><button type="button" onClick={discardChanges} className="min-h-10 rounded-xl px-2 text-[10px] font-semibold text-white/65 ring-1 ring-white/12 hover:bg-white/8">Discard changes</button><button type="button" onClick={() => setCloseConfirm(false)} className="min-h-10 rounded-xl px-2 text-[10px] font-semibold text-white/65 ring-1 ring-white/12 hover:bg-white/8">Keep editing</button></div></section></div> : null}
    </div>
  );
}

function AudioLeadPicker({
  tiles,
  mobile,
  onClose,
  onChoose,
}: {
  tiles: WorkspaceTile[];
  mobile: boolean;
  onClose: () => void;
  onChoose: (tileId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-[95] grid place-items-end bg-black/72 p-3 backdrop-blur-sm md:place-items-center md:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="audio-lead-title" className={`w-full overflow-hidden rounded-3xl border border-white/14 bg-[#111116] shadow-[0_32px_120px_rgba(0,0,0,.78)] ${mobile ? "max-w-none" : "max-w-md"}`}>
        <header className="flex items-start justify-between gap-4 border-b border-white/8 px-4 py-4 sm:px-5">
          <div><p id="audio-lead-title" className="text-sm font-semibold text-white">Choose the room audio</p><p className="mt-1 text-[11px] leading-4 text-white/45">Every live stream is playing muted. Pick the one you want to hear.</p></div>
          <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-xl text-white/55 transition hover:bg-white/8 hover:text-white" aria-label="Keep every stream muted"><X className="size-4" aria-hidden /></button>
        </header>
        <div className="max-h-[55dvh] space-y-2 overflow-y-auto p-3">
          {tiles.map((tile) => (
            <button key={tile.id} type="button" onClick={() => onChoose(tile.id)} aria-label={`Hear ${tile.item.memberLabel} as room audio`} className="group flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-2xl bg-white/[0.035] p-2 text-left ring-1 ring-white/8 transition duration-150 hover:-translate-y-px hover:bg-white/10 hover:shadow-[0_10px_28px_rgba(0,0,0,.24)] hover:ring-white/30 active:translate-y-0 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              <span className="relative block aspect-video w-20 shrink-0 overflow-hidden rounded-xl bg-black ring-1 ring-white/8 transition group-hover:ring-white/20">{tile.item.poster ? <img src={tile.item.poster} alt="" className="h-full w-full object-cover" /> : null}<span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white"><span className="size-1 rounded-full bg-white" />Live</span></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-white">{tile.item.memberLabel}</span><span className="mt-0.5 block truncate text-[10px] text-white/45 transition group-hover:text-white/65">{tile.item.title}</span></span>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/6 px-2 py-1.5 text-[10px] font-semibold text-white/65 ring-1 ring-inset ring-white/10 transition group-hover:bg-white group-hover:text-black group-hover:ring-white"><Volume2 className="size-3.5" aria-hidden /><span className="hidden sm:inline">Hear</span></span>
            </button>
          ))}
          {!tiles.length ? <p className="p-4 text-center text-xs text-white/45">No live streams are available to use as room audio.</p> : null}
        </div>
        <div className="border-t border-white/8 p-3"><button type="button" onClick={onClose} className="min-h-11 w-full cursor-pointer rounded-xl bg-white/6 px-3 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Keep all muted</button></div>
      </section>
    </div>
  );
}

function SettingGroup({
  id,
  title,
  description,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white/[0.025] ring-1 ring-inset ring-white/8">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`multiview-setting-${id}`}
        className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-3 text-left outline-focus-ring transition duration-100 ease-linear hover:bg-white/[0.035] focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold text-white/78">{title}</span>
          <span className="mt-0.5 block text-[9px] text-white/35">{description}</span>
        </span>
        <ChevronDown className={`size-4 shrink-0 text-white/35 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <div id={`multiview-setting-${id}`} hidden={!open} className="space-y-2 border-t border-white/7 p-3">
        {children}
      </div>
    </section>
  );
}

function SettingSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div className="grid gap-1">
      <p className="text-[10px] text-white/45">{label}</p>
      <WatchSelect
        ariaLabel={label}
        value={value}
        onChange={onChange}
        options={options.map((option) => ({ id: option.value, label: option.label }))}
      />
    </div>
  );
}

function SettingRange({ label, min, max, step = 1, value, onChange, onBegin, onCommit }: { label: string; min: number; max: number; step?: number; value: number; onChange: (value: number) => void; onBegin?: () => void; onCommit?: () => void }) {
  return <label className="grid gap-1 rounded-xl bg-white/[0.035] px-3 py-2 text-[10px] text-white/45">{label}<input type="range" min={min} max={max} step={step} value={value} onPointerDown={onBegin} onFocus={onBegin} onChange={(event) => onChange(Number(event.target.value))} onPointerUp={onCommit} onBlur={onCommit} className="h-11 cursor-pointer accent-white md:h-8" /></label>;
}

function SettingToggle({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" onClick={() => onChange(!value)} aria-pressed={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-white/[0.035] px-3 text-left shadow-xs-skeuomorphic ring-1 ring-inset ring-white/8 outline-focus-ring transition duration-100 ease-linear hover:bg-white/[0.065] hover:ring-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.99]"><span className={`relative h-5 w-9 shrink-0 rounded-full transition ${value ? "bg-white" : "bg-white/12"}`}><span className={`absolute top-0.5 size-4 rounded-full transition ${value ? "left-[18px] bg-black" : "left-0.5 bg-white/55"}`} /></span><span className="min-w-0"><span className="block text-[11px] font-semibold text-white/75">{label}</span><span className="block truncate text-[9px] text-white/35">{description}</span></span></button>;
}

function SourceDrawer({
  sources,
  query,
  url,
  intent,
  openKeys,
  onQuery,
  onUrl,
  onAddUrl,
  onChoose,
  onClose,
}: {
  sources: Playable[];
  query: string;
  url: string;
  intent: SourceIntent | "replace";
  openKeys: Set<string>;
  onQuery: (value: string) => void;
  onUrl: (value: string) => void;
  onAddUrl: () => void;
  onChoose: (item: Playable) => void;
  onClose: () => void;
}) {
  const replace = intent === "replace";
  const queue = intent === "queue";
  const title = replace ? "Replace player" : queue ? "Add to Up Next" : "Add another view";
  return (
    <div
      className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section role="dialog" aria-modal="true" aria-label={title} className="absolute inset-x-0 bottom-0 flex max-h-[86dvh] flex-col rounded-t-3xl border border-white/12 bg-[#111115] shadow-2xl md:inset-y-4 md:left-auto md:right-4 md:max-h-none md:w-[28rem] md:rounded-3xl">
        <header className="flex items-start justify-between gap-4 border-b border-white/8 p-4">
          <div><h2 className="text-base font-semibold">{title}</h2><p className="mt-1 text-[11px] text-white/40">{queue ? "Choose what should play after the focused title." : "Live streams, videos, shorts, and photos in one grid."}</p></div>
          <IconControlTooltip title="Close" description="Return to your multiview room." placement="bottom">
            <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-xl text-white/50 hover:bg-white/8 hover:text-white" aria-label="Close"><X className="size-4" aria-hidden /></button>
          </IconControlTooltip>
        </header>
        <div className="space-y-2 border-b border-white/8 p-3">
          <label className="relative block"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35" /><input autoFocus value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search titles, members, platforms…" className="min-h-11 w-full rounded-xl bg-white/5 pl-10 pr-3 text-sm outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-white/25" /></label>
          <div className="flex gap-2"><input value={url} onChange={(event) => onUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onAddUrl(); }} placeholder="Paste a Twitch or YouTube URL" className="min-h-11 min-w-0 flex-1 rounded-xl bg-white/5 px-3 text-xs outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-white/25" /><button type="button" onClick={onAddUrl} className="min-h-11 rounded-xl bg-white px-3 text-xs font-semibold text-black">Add URL</button></div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1">
            {sources.map((item) => {
              const open = openKeys.has(item.key);
              return (
                <button key={item.key} type="button" disabled={open && !replace} onClick={() => onChoose(item)} className="group flex min-h-20 w-full min-w-0 items-center gap-3 overflow-hidden rounded-xl bg-white/[0.035] p-2 text-left ring-1 ring-white/8 transition hover:bg-white/8 hover:ring-white/18 disabled:opacity-40">
                  <span className="relative block aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-black">{item.poster ? <img src={item.poster} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center"><WifiOff className="size-4 text-white/25" /></span>}{item.kind === "live" ? <span className="absolute left-1.5 top-1.5 rounded bg-red-500 px-1.5 py-0.5 text-[8px] font-bold uppercase">Live</span> : null}</span>
                  <span className="min-w-0 flex-1"><span className="line-clamp-2 text-xs font-semibold leading-4">{item.title}</span><span className="mt-1 block truncate text-[10px] text-white/40">{item.memberLabel} · {item.platform}</span><span className="mt-1 block text-[9px] text-white/28">{open ? "Already open" : replace ? "Use in this tile" : queue ? "Add to Up Next" : "Add as a tile"}</span></span>
                </button>
              );
            })}
          </div>
          {sources.length === 0 ? <p className="p-8 text-center text-xs text-white/35">No playable titles match.</p> : null}
        </div>
      </section>
    </div>
  );
}

function EmptyChat({ onAdd }: { onAdd: () => void }) {
  return <div className="grid h-full min-h-52 place-items-center p-5 text-center"><div><MessageSquare className="mx-auto size-5 text-white/25" /><p className="mt-3 text-xs font-semibold text-white/60">Chat follows Twitch players</p><p className="mt-1 text-[11px] leading-5 text-white/35">Add a Twitch stream and its channel joins the dock automatically.</p><button type="button" onClick={onAdd} className="mt-4 min-h-10 rounded-xl px-4 text-xs font-semibold ring-1 ring-white/15">Add stream</button></div></div>;
}

function ChatDockPlacementNote({ dock }: { dock: "bottom" | "floating" }) {
  const player = usePlayer();
  const label = dock === "bottom" ? "below the grid" : "as a floating panel";
  return (
    <div className="grid h-full min-h-52 place-items-center p-5 text-center">
      <div className="max-w-[15rem]">
        <MessageSquare className="mx-auto size-5 text-white/28" aria-hidden />
        <p className="mt-3 text-xs font-semibold text-white/65">Chat is open {label}</p>
        <p className="mt-1 text-[10px] leading-4 text-white/38">Move it back here whenever you want chat beside the room controls.</p>
        <button type="button" onClick={() => player.setChatDock("right")} className="mt-4 min-h-10 rounded-xl px-3 text-[10px] font-semibold text-white/70 ring-1 ring-white/14 transition hover:bg-white/8 hover:text-white">Use side panel</button>
      </div>
    </div>
  );
}
