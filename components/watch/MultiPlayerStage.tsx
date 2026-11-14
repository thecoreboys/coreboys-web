"use client";
import { useInstagramPlayback } from "@/hooks/useInstagramPlayback";
import { nativeVideoSource } from "@/lib/watch/native-media";
/* eslint-disable @next/next/no-img-element -- Runtime media posters can come from user-added third-party URLs outside the Next Image allowlist. */

import { RoomSidebarResize } from "./RoomSidebarResize";
import { RoomStudio, type RoomTileWithRect } from "./RoomStudio";
import { createContext, useContext, memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ExternalLink, GripVertical, Info, LayoutGrid, LayoutPanelTop, ListVideo, LockKeyhole, Maximize2, MessageSquare, Minimize2, MonitorPlay, MonitorSmartphone, MoreHorizontal, Pause, PanelRight, PictureInPicture2, Pin, PinOff, Play, Plus, Radio, Rows3, Save, Search, Share2, SlidersHorizontal, Square, Trash2, Volume2, VolumeX, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { ChatSessionProvider } from "@/components/live/chat";
import { MainStageChat, type RoomChatView } from "@/components/watch/MainStageChat";
import { usePlayer, type PlayerContextValue } from "@/components/providers/PlayerProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { openAuthModal } from "@/lib/auth/modal";
import { MEMBERS } from "@/lib/members";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { useSubscription } from "@/hooks/useSubscription";
import { useMultiviewSourceSearch } from "@/hooks/useMultiviewSourceSearch";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { useMultiviewRemoteHost } from "@/hooks/useMultiviewRemote";
import { MULTIVIEW_LAUNCH_PATH, remoteSourceKey, type RemoteSource } from "@/lib/watch/multiview-remote";
import { useWatchDiscovery, type WatchFeedbackValue } from "@/lib/watch/discovery-state";
import { catalogPlayables, contentShape, embedFor, playableFromUrl, type Playable } from "@/lib/watch/playable";
import { listenToYouTube, youtubeCaptionCommands, youtubePlaybackSample } from "@/lib/watch/youtube-player";
import type { WatchCatalog } from "@/lib/watch/types";
import { formatHandleDisplay } from "@/lib/watch/display-label";
import { readableTitle } from "@/lib/watch/presentation";
import { WatchThumb } from "@/components/watch/WatchThumb";
import { groupCrossPlatformLiveSources, uniqueCrossPlatformLiveSources } from "@/lib/watch/live-source-groups";
import { mainStageChatSelection, mainStageTwitchLogin, prioritizeChatLogins, type MainStageChatChoice } from "@/lib/watch/main-stage-chat";
import { AUTOPLAY_MODES, decodeWorkspace, multiviewPassportCreditTileId, WORKSPACE_PRESETS, type WorkspaceTile, type WorkspaceSnapshot } from "@/lib/watch/workspace";
import type { MultiviewLiveRoom } from "@/lib/watch/multiview-access";
import { PlayerNetworkWatermark } from "@/components/watch/PlayerNetworkWatermark";
import { OnScreenIdentityOverlay } from "@/components/watch/OnScreenIdentityOverlay";
import { CreatorTags } from "@/components/watch/CreatorTags";
import { creatorTimelineSeconds } from "@/lib/creator-tags/model";
import { facePresencePlaybackMs, type FacePlaybackSample } from "@/lib/face-presence-playback";
import { PlayerAmbientBloom } from "@/components/watch/PlayerAmbientBloom";
import { WatchSelect } from "@/components/watch/WatchSelect";
import { TwitchTileMedia } from "@/components/watch/TwitchTileMedia";
import { TileSwapProvider, tileSwapTarget, useTileSwap } from "@/components/watch/TileSwapDrag";
import { floatingChatViewportStyle } from "@/lib/watch/floating-chat";
import { gridTileToNormalizedRect, normalizedRectToGridPosition, presetNormalizedRects, resolvePresetRoomLayout, roomLayoutMatchesPreset, shouldStackTwitchRoom, type NormalizedRect } from "@/lib/watch/room-layout";

type Notice = {
  text: string;
  tone?: "default" | "error";
  actionHref?: string;
  actionLabel?: string;
} | null;
const TwitchRoomTools = createContext<{ creator: HTMLElement | null; status: HTMLElement | null }>({ creator: null, status: null });

function PlayerActions({ outsideVideo, children }: { outsideVideo: boolean; children: ReactNode }) {
  const { status } = useContext(TwitchRoomTools);
  return outsideVideo ? status ? createPortal(children, status) : null : children;
}

type SidebarTab = "queue" | "chat" | "details";
type MobileLayout = "split" | "stack" | "focus";
const MOBILE_LAYOUT_STORE = "core-multiview-mobile-layout:v1";
const ROOM_CHAT_VIEW_STORE = "core-multiview-chat-view:v1";
/** The room arrangements offered directly above the stage. */
const ROOM_LAYOUT_CHOICES = [
  { id: "auto", label: "Auto", description: "Best fit for the number of views" },
  { id: "theater-first", label: "Theater", description: "Big main view, companions beside and below" },
  { id: "split", label: "Split", description: "Views side by side in two columns" },
  { id: "focus-side", label: "Focus + side", description: "Main view with the rest stacked beside it" },
  { id: "grid", label: "Grid", description: "Every view the same size" },
] as const;
/**
 * Phones ignore the desktop Theater geometry. These arrangements are a
 * per-device viewing preference, so they live in local storage instead of
 * the shared room snapshot (a saved desktop room should not change shape
 * because it was opened on a phone once).
 */
const MOBILE_LAYOUTS: Array<{ id: MobileLayout; label: string; description: string; icon: typeof Plus }> = [
  { id: "split", label: "Main + views", description: "One large player with your other views underneath.", icon: LayoutPanelTop },
  { id: "stack", label: "Stack", description: "Every view at full width. Scroll between them.", icon: Rows3 },
  { id: "focus", label: "Focus", description: "One player at a time. Uses the least data and battery.", icon: Square },
];
type SourceIntent = "tile" | "queue";
type MemberRecord = (typeof MEMBERS)[number];

function remoteSourceFor(item: Playable): RemoteSource | null {
  if (item.kind !== "live" || !item.embeddable) return null;
  const member = MEMBERS.find(({ slug }) => slug === item.memberSlug);
  if (!member) return null;
  if (item.platform === "twitch" && item.twitchLogin?.toLowerCase() === member.twitchLogin.toLowerCase()) {
    return { member: member.slug, platform: "twitch" };
  }
  if (item.platform === "youtube" && item.youtubeId && /^[\w-]{11}$/.test(item.youtubeId)) {
    return { member: member.slug, platform: "youtube", videoId: item.youtubeId };
  }
  return null;
}

function mainRoomTile(tiles: WorkspaceTile[], maximizedId?: string | null) {
  return tiles.find((tile) => tile.id === maximizedId) ?? tiles.find((tile) => tile.pinned) ?? tiles[0];
}

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
    channelLogoUrl: member?.comm.logo,
    channelLogoName: member?.comm.name,
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
  remoteHost = false,
}: {
  catalog: WatchCatalog;
  /** Used by /chat: seed a room from the live-status source once it resolves. */
  autoFillLive?: boolean;
  /** Presents the multiview workspace as the all-live chat room. */
  liveRoom?: boolean;
  /** Server-authorized, redacted bootstrap for /multiview?live=all. */
  initialLiveRoom?: MultiviewLiveRoom;
  remoteHost?: boolean;
}) {
  const player = usePlayer();
  const { user, loading: authLoading } = useAuth();
  const subscription = useSubscription();
  const discovery = useWatchDiscovery();
  const authoritativeLiveRoom = initialLiveRoom?.mode === "all-current-live";
  // The authoritative room must never rebuild redacted streams from the public
  // live-status response. Only the server-issued playable subset enters state.
  const { data: liveStatus } = useLiveStatus(!authoritativeLiveRoom);
  const searchParams = useSearchParams();
  const remoteLaunch = remoteHost && searchParams.get("remote") === "1";
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
    return live.filter((item) => {
      if (item.kind !== "live") return false;
      // Twitch has a fast status endpoint; YouTube live state comes from the
      // refreshed catalog snapshot and has no Twitch login to join against.
      if (item.platform === "youtube") return Boolean(item.youtubeId);
      return Boolean(item.twitchLogin && online.has(item.twitchLogin.toLowerCase()));
    });
  }, [authoritativeLiveRoom, live, liveStatus]);
  const roomLive = useMemo(() => uniqueCrossPlatformLiveSources(currentLive), [currentLive]);
  const liveSourceGroups = useMemo(() => {
    const sources = new Map<string, Playable>();
    for (const item of [...currentLive, ...player.tiles.filter((tile) => tile.item.kind === "live").map((tile) => tile.item)]) {
      sources.set(item.key, item);
    }
    return groupCrossPlatformLiveSources([...sources.values()]).map((group) => ({
      ...group,
      sources: group.sources.map((item) => ({
        item,
        tileId: player.tiles.find((tile) => tile.item.key === item.key)?.id ?? null,
      })),
    }));
  }, [currentLive, player.tiles]);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceIntent, setSourceIntent] = useState<SourceIntent>("tile");
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");
  const [layoutName, setLayoutName] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [mobile, setMobile] = useState(false);
  const [adaptivePlayerBudget, setAdaptivePlayerBudget] = useState(4);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("chat");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileLayout, setMobileLayoutState] = useState<MobileLayout>("split");
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [chatSheetHeight, setChatSheetHeight] = useState<number | null>(null);
  const [roomChatView, setRoomChatViewState] = useState<RoomChatView>("main");
  const [creatorTools, setCreatorTools] = useState<HTMLDivElement | null>(null);
  const [recoveryTools, setRecoveryTools] = useState<HTMLDivElement | null>(null);
  const twitchTools = useMemo(() => ({ creator: creatorTools, status: recoveryTools }), [creatorTools, recoveryTools]);
  const [setupOpen, setSetupOpen] = useState(false);
  const [mainStagePickerOpen, setMainStagePickerOpen] = useState(false);
  const [chatChoice, setChatChoice] = useState<MainStageChatChoice | null>(null);
  const chatDockInitializedRef = useRef(false);
  const importedRef = useRef(false);
  const autoLiveRoomRef = useRef(false);
  const offlineHandledRef = useRef(new Set<string>());
  const sourceOpenerRef = useRef<HTMLElement | null>(null);
  const sourceWasOpenRef = useRef(false);

  const { tiles: openRoomTiles, focusedTile: focusedRoomTile, removeTile: removeRoomTile } = player;
  const { ready: roomReady, setChatDock: setRoomChatDock } = player;

  useEffect(() => {
    // Older saved rooms can already contain both sides of a YouTube/Twitch
    // simulcast. Keep the intentional main view and release the duplicate;
    // the alternate remains in the source chooser for an in-place switch.
    for (const group of liveSourceGroups) {
      const openTiles = group.sources
        .map((source) => openRoomTiles.find((tile) => tile.id === source.tileId))
        .filter((tile): tile is WorkspaceTile => Boolean(tile));
      if (openTiles.length < 2) continue;
      const keep = openTiles.find((tile) => tile.pinned)
        ?? openTiles.find((tile) => tile.id === focusedRoomTile?.id)
        ?? openTiles[0];
      for (const tile of openTiles) {
        if (tile.id !== keep?.id) removeRoomTile(tile.id);
      }
    }
  }, [liveSourceGroups, focusedRoomTile?.id, removeRoomTile, openRoomTiles]);

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
    const restore = () => {
      try {
        const saved = window.localStorage.getItem(MOBILE_LAYOUT_STORE);
        if (saved && MOBILE_LAYOUTS.some((entry) => entry.id === saved)) setMobileLayoutState(saved as MobileLayout);
      } catch {
        // Private browsing or blocked storage keeps the default arrangement.
      }
    };
    restore();
  }, []);

  useEffect(() => {
    const restore = () => {
      try {
        const saved = window.localStorage.getItem(ROOM_CHAT_VIEW_STORE);
        if (saved === "main" || saved === "combined" || saved === "columns") setRoomChatViewState(saved);
      } catch {
        // Blocked storage keeps the main-stage chat.
      }
    };
    restore();
  }, []);

  const setRoomChatView = useCallback((value: RoomChatView) => {
    setRoomChatViewState(value);
    try {
      window.localStorage.setItem(ROOM_CHAT_VIEW_STORE, value);
    } catch {
      // The choice still applies for this visit.
    }
  }, []);

  const setMobileLayout = useCallback((value: MobileLayout) => {
    setMobileLayoutState(value);
    try {
      window.localStorage.setItem(MOBILE_LAYOUT_STORE, value);
    } catch {
      // The choice still applies for this visit.
    }
  }, []);

  useEffect(() => {
    // Leaving phone width hands the room back to the desktop surfaces.
    if (!mobile) setMobileSettingsOpen(false);
  }, [mobile]);

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
    // The chat sheet only exists below the desktop sidebar breakpoint.
    const media = window.matchMedia("(min-width: 1024px)");
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
    player.fillWithLive(roomLive, { limit: tileLimit });
    player.setChatChannels(currentLive.flatMap((item) => item.platform === "twitch" && item.twitchLogin ? [item.twitchLogin] : []));
    player.setChatMode("focused");
    player.setChatDock("right");
    setSidebarTab("chat");
    if (!roomLive.length) setNotice({ text: "No one is live right now. This room will stay ready for the next stream." });
  }, [authoritativeLiveRoom, autoFillLive, currentLive, liveStatus, player, roomLive, subscription.loading, tileLimit]);

  useEffect(() => {
    if (!roomReady || chatDockInitializedRef.current) return;
    chatDockInitializedRef.current = true;
    setRoomChatDock("right");
  }, [roomReady, setRoomChatDock]);

  const focused = player.focusedTile ?? player.tiles[0] ?? null;
  const mainTile = mainRoomTile(player.tiles, player.maximizedTileId);
  const sendTileToMiniPlayer = useSendTileToMiniPlayer();
  const miniPlayerTile = focused ?? mainTile ?? null;
  const remoteItems = useMemo(() => {
    const result = new Map<string, { source: RemoteSource; item: Playable }>();
    if (!remoteHost) return result;
    for (const item of currentLive) {
      const source = remoteSourceFor(item);
      if (!source) continue;
      const key = remoteSourceKey(source);
      if (!result.has(key) || mainTile?.item.key === item.key) result.set(key, { source, item });
    }
    return result;
  }, [currentLive, mainTile?.item.key, remoteHost]);
  const remoteSources = useMemo(() => [...remoteItems.values()].map(({ source }) => source), [remoteItems]);
  const mainSource = mainTile && !mainTile.standby ? remoteSourceFor(mainTile.item) : null;
  const remoteMain = mainSource ? remoteSourceKey(mainSource) : null;
  const { connection: remoteConnection } = useMultiviewRemoteHost({
    accountId: remoteHost && player.ready && !subscription.loading ? user?.id ?? null : null,
    sources: remoteSources,
    main: remoteMain && remoteItems.get(remoteMain)?.item.key === mainTile?.item.key ? remoteMain : null,
    switchSource: (key) => {
      const target = remoteItems.get(key);
      if (!target) return false;
      const replacement = player.tiles.length >= tileLimit
        ? [focused, ...player.tiles].find((tile) => tile && !tile.pinned)?.id
        : undefined;
      const tileId = switchLiveSource(target.item, {
        takeAudio: player.tiles.some((tile) => !tile.muted && tile.volume > 0),
        preferredTileId: replacement,
        resume: true,
      });
      if (!tileId) return false;
      player.makeMain(tileId, { takeAudio: player.tiles.some((tile) => !tile.muted && tile.volume > 0) });
      if (player.maximizedTileId) player.setMaximizedTileId(tileId);
      setChatChoice(null);
      return true;
    },
  });
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
      if (target?.closest("[role='dialog'], input, textarea, select, [contenteditable='true']") || event.metaKey || event.ctrlKey || event.altKey) return;
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

  // A phone shows the selected view as its main player, so chat follows that
  // view there. Desktop keeps following the pinned/first Theater main.
  const chatMainTile = mobile ? focused : mainTile;
  const mainChatLogin = mainStageTwitchLogin(chatMainTile?.item, MEMBERS);
  const mainChatSourceKey = chatMainTile?.item.key ?? null;
  const chatLogins = useMemo(() => prioritizeChatLogins([
    ...player.tiles.map((tile) => mainStageTwitchLogin(tile.item, MEMBERS)),
    ...player.chatChannels,
  ].filter((login): login is string => Boolean(login)), mainChatLogin, mainChatLogin, 8), [mainChatLogin, player.chatChannels, player.tiles]);
  const chatChannels = useMemo(() => chatLogins.map(channelFor), [chatLogins]);
  const chatSelection = mainStageChatSelection(mainChatSourceKey, mainChatLogin, chatChoice, chatLogins);
  const hasRoomChat = Boolean(chatSelection.login);
  // This provider intentionally outlives the visual ChatDock. Changing from
  // side → bottom → floating only remounts the presentation, not the IRC
  // session or its buffered history.
  const chatConnectionLimit = player.dataSaver ? 2 : player.maxActivePlayers;
  const connectedChatChannels = useMemo(
    () => prioritizeChatLogins(chatLogins, chatSelection.login, mainChatLogin, chatConnectionLimit).map(channelFor),
    [chatLogins, chatSelection.login, mainChatLogin, chatConnectionLimit],
  );
  const focusChatChannel = (login: string | null) => {
    setChatChoice(login ? { sourceKey: mainChatSourceKey, login } : null);
  };

  const needle = query.trim().toLowerCase();
  const archiveSearch = useMultiviewSourceSearch(query, sourceOpen, initialLiveRoom);
  const localSources = (needle
    ? all.filter((item) =>
        item.title.toLowerCase().includes(needle)
        || item.memberLabel.toLowerCase().includes(needle)
        || item.platform.toLowerCase().includes(needle))
    : [...live, ...all.filter((item) => item.kind !== "live")]
  ).slice(0, 80);
  const sourceKeys = new Set<string>();
  const sources = [...archiveSearch.items, ...localSources].filter((item) => {
    if (sourceKeys.has(item.key)) return false;
    sourceKeys.add(item.key);
    return true;
  }).slice(0, 80);

  function closeSources() {
    setSourceOpen(false);
    setReplaceTarget(null);
    setSourceIntent("tile");
  }

  function chooseSource(item: Playable) {
    if (sourceIntent === "queue") {
      const added = player.addToQueue(item, "end");
      setNotice({ text: added ? `Added “${item.title}” to Up Next` : "That title is already open or queued." });
    } else if (
      item.kind === "live"
      && liveSourceGroups.some((group) => group.sources.length > 1 && group.sources.some((source) => source.item.key === item.key))
      && (replaceTarget || player.tiles.some((tile) => tile.item.kind === "live" && tile.item.memberSlug === item.memberSlug))
    ) {
      switchLiveSource(item, { takeAudio: false, preferredTileId: replaceTarget ?? undefined });
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

  function switchLiveSource(item: Playable, options: { takeAudio: boolean; preferredTileId?: string; resume?: boolean }) {
    const group = liveSourceGroups.find((entry) => entry.sources.some((source) => source.item.key === item.key));
    const sameCreatorTiles = item.memberSlug
      ? player.tiles.filter((tile) => tile.item.kind === "live" && tile.item.memberSlug === item.memberSlug)
      : [];
    const alreadyOpen = player.tiles.find((tile) => tile.item.key === item.key);
    let selectedTileId = alreadyOpen?.id ?? null;

    const replaceTile = options.preferredTileId
      ? sameCreatorTiles.find((tile) => tile.id === options.preferredTileId)
        ?? player.tiles.find((tile) => tile.id === options.preferredTileId)
      : sameCreatorTiles[0];
    if (!selectedTileId && replaceTile) {
      selectedTileId = replaceTile.id;
      player.replaceTile(selectedTileId, item);
    } else if (!selectedTileId) {
      selectedTileId = player.addTile(item, { focus: true, muted: true });
    }

    if (!selectedTileId) {
      setNotice({ text: "This room is full. Remove a tile before switching sources.", tone: "error" });
      return;
    }

    if ((group?.sources.length ?? 0) > 1) {
      for (const tile of sameCreatorTiles) {
        if (tile.id !== selectedTileId) player.removeTile(tile.id);
      }
    }
    if (options.resume) player.updateTile(selectedTileId, { standby: false });
    if (options.takeAudio) {
      for (const tile of player.tiles) {
        if (tile.id !== selectedTileId) player.updateTile(tile.id, { muted: true });
      }
      player.updateTile(selectedTileId, { muted: false });
    }
    player.focusTile(selectedTileId, { takeAudio: options.takeAudio });
    if (options.takeAudio) setMainStagePickerOpen(false);
    setNotice({ text: `${options.takeAudio ? "Now watching" : "Switched to"} ${item.memberLabel} on ${platformLabel(item)}.` });
    return selectedTileId;
  }

  function chooseMainStage(item: Playable) {
    const tileId = switchLiveSource(item, { takeAudio: true, resume: true });
    if (!tileId) return;
    player.makeMain(tileId, { takeAudio: true });
    if (player.maximizedTileId) player.setMaximizedTileId(tileId);
    setChatChoice(null);
    setNotice({ text: `${item.memberLabel} is now on the main stage.` });
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
      player.setChatChannels(currentLive.flatMap((item) => item.platform === "twitch" && item.twitchLogin ? [item.twitchLogin] : []));
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

  const chat = (
    <MainStageChat
      channels={chatChannels}
      roomChannels={connectedChatChannels}
      view={roomChatView}
      onViewChange={setRoomChatView}
      selectedLogin={chatSelection.login}
      followsMain={chatSelection.followsMain}
      onSelectChannel={focusChatChannel}
      textScale={player.chatTextScale}
      onTextScaleChange={player.setChatTextScale}
      showTimestamps={player.showChatTimestamps}
      onTimestampsChange={player.setShowChatTimestamps}
      width={player.chatDockSize.side}
      onWidthChange={(side) => player.setChatDockSize({ side })}
    />
  );
  const workspaceSidebar = (
    <WorkspaceSidebar
      activeTab={sidebarTab}
      onTabChange={setSidebarTab}
      mobileOpen={mobileSidebarOpen}
      mobileSheetHeight={chatSheetHeight}
      onMobileClose={closeMobileSidebar}
      focused={focused}
      member={focusedMember}
      tiles={visibleTiles}
      chat={!mobile && (player.chatDock === "bottom" || player.chatDock === "floating") ? <ChatDockPlacementNote dock={player.chatDock} /> : chat}
      onAddQueue={(opener) => openSources(undefined, opener, "queue")}
      onReplace={(tileId, opener) => openSources(tileId, opener)}
    />
  );
  const openRoomSettings = () => {
    if (mobile) setMobileSettingsOpen(true);
    else setSetupOpen(true);
  };
  const openMobileChat = () => {
    // Size the sheet to the space left under the main player (within sane
    // bounds) so the stream and the newest messages are both visible.
    const stage = document.getElementById("multiview-stage");
    const mainPlayer = stage?.querySelector<HTMLElement>('[data-room-player][data-focused="true"]') ?? stage?.querySelector<HTMLElement>("[data-room-player]");
    if (mobile && stage && mainPlayer) {
      const offset = Number.parseFloat(getComputedStyle(stage).scrollMarginTop) || 0;
      const available = window.innerHeight - offset - mainPlayer.getBoundingClientRect().height - 8;
      setChatSheetHeight(Math.round(Math.min(window.innerHeight * 0.62, Math.max(window.innerHeight * 0.4, available))));
    } else {
      setChatSheetHeight(null);
    }
    setMobileSidebarOpen(true);
    // The phone chat sheet covers the lower half of the screen. Bring the
    // main player to the top so the stream and chat are visible together.
    // (The root element clips overflow, which makes scrollIntoView a no-op in
    // some browsers, so scroll the window to the stage's measured offset.)
    window.requestAnimationFrame(() => {
      const stage = document.getElementById("multiview-stage");
      if (!stage) return;
      const offset = Number.parseFloat(getComputedStyle(stage).scrollMarginTop) || 0;
      window.scrollTo({ top: Math.max(0, stage.getBoundingClientRect().top + window.scrollY - offset), behavior: "smooth" });
    });
  };
  const mobileMain = focused ?? player.tiles[0] ?? null;
  const sideWidth = `${player.chatDockSize.side}px`;
  const roomColumns = player.chatDock === "left"
    ? "lg:grid-cols-[minmax(17.5rem,min(var(--room-chat-width),36vw))_minmax(0,1fr)]"
    : "lg:grid-cols-[minmax(0,1fr)_minmax(17.5rem,min(var(--room-chat-width),36vw))]";

  return (
    <TwitchRoomTools.Provider value={twitchTools}>
    <ChatSessionProvider
      channels={connectedChatChannels}
      // The virtualized feed makes a full room history cheap. Data Saver
      // prioritizes the active player, but does not silently discard chat.
      perChannelLimit={1000}
      mergedLimit={1000}
    >
    <section data-has-twitch={player.tiles.some((tile) => tile.item.platform === "twitch")} aria-label="Multiview room" className="multiview-room min-h-[calc(100dvh-4rem)] bg-room-base text-room-ink">
      <div className="mx-auto max-w-[1880px] px-3 py-4 sm:px-5 lg:px-7" style={mobileSidebarOpen ? { paddingBottom: chatSheetHeight ? `${chatSheetHeight + 16}px` : "calc(min(58dvh, 40rem) + 1rem)" } : undefined}>
        <header className="mb-3 flex min-h-12 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-room-ink">{liveRoom || authoritativeLiveRoom ? "Live multiview" : "Multiview"}</h1>
            <p className="text-xs tabular-nums text-room-muted">
              {player.tiles.length} {player.tiles.length === 1 ? "player" : "players"}{authoritativeLiveRoom && lockedLiveSlots.length ? ` · ${lockedLiveSlots.length} locked` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            <button
              type="button"
              onClick={fillLive}
              disabled={currentLive.length === 0}
              aria-label={currentLive.length ? "Watch live channels" : "No channels are live"}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-room-ink px-3 text-xs font-semibold text-room-inverse shadow-xs-skeuomorphic ring-1 ring-inset ring-room-ink/90 transition hover:bg-room-ink/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-room-ink disabled:cursor-not-allowed disabled:bg-room-ink/10 disabled:text-room-faint disabled:ring-room-ink/10 md:min-h-10"
            >
              <Radio className="size-3.5" aria-hidden />
              <span>{currentLive.length ? "Watch live" : "No one live"}</span>
            </button>
            <IconControlTooltip title="Choose main stage" description="Select the stream featured in your main player." placement="bottom">
              <button type="button" onClick={() => setMainStagePickerOpen(true)} disabled={!liveSourceGroups.length} aria-label="Choose main stage" aria-expanded={mainStagePickerOpen} aria-haspopup="dialog" aria-controls="main-stage-picker" className="hidden size-11 shrink-0 cursor-pointer place-items-center rounded-xl bg-room-ink/5 text-room-ink/75 ring-1 ring-inset ring-room-ink/12 transition hover:bg-room-ink/10 hover:text-room-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-room-ink disabled:cursor-not-allowed disabled:opacity-35 sm:grid md:size-10"><MonitorPlay className="size-4" aria-hidden /></button>
            </IconControlTooltip>
            <IconControlTooltip title="Mini player" description="Keep watching the selected player in a small window you can move anywhere." placement="bottom">
              <button type="button" onClick={() => sendTileToMiniPlayer(miniPlayerTile)} disabled={!miniPlayerTile} aria-label={miniPlayerTile ? `Send ${miniPlayerTile.item.memberLabel} to the mini player` : "Mini player"} data-multiview-mini-player className="hidden size-11 shrink-0 cursor-pointer place-items-center rounded-xl bg-room-ink/5 text-room-ink/75 ring-1 ring-inset ring-room-ink/12 transition hover:bg-room-ink/10 hover:text-room-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-room-ink disabled:cursor-not-allowed disabled:opacity-35 sm:grid md:size-10"><Minimize2 className="size-4" aria-hidden /></button>
            </IconControlTooltip>
            <button
              type="button"
              onClick={openRoomSettings}
              aria-expanded={mobile ? mobileSettingsOpen : setupOpen}
              aria-controls={mobile ? "multiview-mobile-settings" : "multiview-setup-modal"}
              className={`hidden min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-xs font-semibold shadow-xs-skeuomorphic ring-1 ring-inset outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.98] sm:inline-flex md:min-h-10 ${setupOpen || mobileSettingsOpen ? "bg-room-ink text-room-inverse ring-room-ink/90 hover:bg-room-ink/90" : "bg-room-ink/5 text-room-secondary ring-room-ink/12 hover:bg-room-ink/10 hover:text-room-ink hover:ring-room-ink/20"}`}
            >
              <SlidersHorizontal className="size-3.5" aria-hidden />
              <span>{mobile ? "Room settings" : "Room studio"}</span>
            </button>
            <IconControlTooltip
              title="Open Twitch chat"
              description="Chat follows the main stage automatically."
              placement="bottom"
            >
              <button
                type="button"
                onClick={openMobileChat}
                aria-expanded={mobileSidebarOpen}
                aria-controls="multiview-sidebar"
                className="hidden size-11 place-items-center rounded-xl bg-room-ink/5 text-room-secondary ring-1 ring-room-ink/12 hover:bg-room-ink/10 hover:text-room-ink md:grid lg:hidden"
                aria-label="Open Twitch chat"
              >
                <MessageSquare className="size-4" aria-hidden />
              </button>
            </IconControlTooltip>
            <details className="relative">
              <summary aria-label="More room controls" className="grid size-11 cursor-pointer list-none place-items-center rounded-xl bg-room-ink/5 text-room-ink/70 ring-1 ring-room-ink/12 transition hover:bg-room-ink/10 hover:text-room-ink focus-visible:outline-2 focus-visible:outline-room-ink md:size-10"><MoreHorizontal className="size-4" aria-hidden /></summary>
              <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-room-ink/15 bg-room-panel p-1.5 shadow-2xl">
                <button type="button" disabled={!liveSourceGroups.length} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setMainStagePickerOpen(true); }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-xs font-medium text-room-ink/75 transition hover:bg-room-ink/8 hover:text-room-ink disabled:cursor-not-allowed disabled:opacity-40 sm:hidden"><MonitorPlay className="size-4" aria-hidden />Choose main stage</button>
                <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); openRoomSettings(); }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-xs font-medium text-room-ink/75 transition hover:bg-room-ink/8 hover:text-room-ink sm:hidden"><SlidersHorizontal className="size-4" aria-hidden />Room settings</button>
                <button type="button" disabled={!miniPlayerTile} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); sendTileToMiniPlayer(miniPlayerTile); }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-xs font-medium text-room-ink/75 transition hover:bg-room-ink/8 hover:text-room-ink disabled:cursor-not-allowed disabled:opacity-40 sm:hidden"><Minimize2 className="size-4" aria-hidden />Mini player</button>
                <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setSidebarTab("queue"); }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-xs font-medium text-room-ink/75 transition hover:bg-room-ink/8 hover:text-room-ink"><ListVideo className="size-4" aria-hidden />Up next</button>
                <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setSidebarTab("details"); }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-xs font-medium text-room-ink/75 transition hover:bg-room-ink/8 hover:text-room-ink"><Info className="size-4" aria-hidden />Player details</button>
                <button type="button" disabled={!player.tiles.length} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); void share(); }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-xs font-medium text-room-ink/75 transition hover:bg-room-ink/8 hover:text-room-ink disabled:cursor-not-allowed disabled:opacity-40"><Share2 className="size-4" aria-hidden />Copy room link</button>
                {remoteHost && mobile ? <Link prefetch={false} href="/multiview/remote" className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-xs font-medium text-room-ink/75 transition hover:bg-room-ink/8 hover:text-room-ink"><MonitorSmartphone className="size-4" aria-hidden />Control a computer</Link> : null}
              </div>
            </details>
          </div>
        </header>
        <div ref={setCreatorTools} data-room-creator-tools className="mb-2 empty:hidden" />

        {remoteHost && !mobile ? <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-room-secondary" aria-label="Phone remote connection">
          <span role="status">{remoteConnection === "connected" ? "Phone remote ready" : remoteConnection === "connecting" ? "Connecting phone remote…" : remoteConnection === "reconnecting" ? "Reconnecting phone remote…" : remoteConnection === "secure-context-required" ? "Open this site with HTTPS to connect your phone" : "Sign in on both devices to connect your phone"}</span>
          <Link prefetch={false} href="/multiview/remote" className="inline-flex min-h-11 items-center rounded-lg border border-room-ink/15 px-3 font-semibold text-room-ink hover:bg-room-ink/10">Phone remote</Link>
          <span>Use the same CORE account on your phone and computer.</span>
        </div> : null}
        {remoteLaunch && !authLoading && !user ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-400/25 bg-indigo-400/10 px-4 py-3 text-sm text-room-secondary">
            <p>Sign in to the same CORE account as your phone to control this Multiview.</p>
            <button type="button" onClick={() => openAuthModal({ next: MULTIVIEW_LAUNCH_PATH })} className="min-h-11 rounded-full bg-room-ink px-4 font-semibold text-room-inverse">Sign in</button>
          </div>
        ) : null}

        {(player.dataSaver || player.maxActivePlayers < 2) && player.tiles.length > 1 ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-room-ink/10 px-4 py-3 text-xs text-room-secondary">
            <p>{player.dataSaver ? "Data Saver is keeping one view active." : "Your playback limit is keeping one view active."}</p>
            <button type="button" onClick={() => {
              player.setDataSaver(false);
              player.setMaxActivePlayers(Math.max(2, player.maxActivePlayers));
            }} className="min-h-10 rounded-lg bg-room-ink px-3 font-semibold text-room-inverse">Play multiple views</button>
          </div>
        ) : null}

        {!mobile && player.tiles.length > 0 ? (
          <RoomLayoutBar
            preset={player.layoutPreset}
            count={player.tiles.length}
            limit={tileLimit}
            onChoose={(preset) => {
              if (player.maximizedTileId) player.setMaximizedTileId(null);
              player.applyPreset(preset);
            }}
            onAdd={(opener) => openSources(undefined, opener)}
          />
        ) : null}

        {/* Keep the Theater stage usable at laptop widths. A saved wide chat
            dock still opens at its full width on large displays, but yields
            enough room for a real Twitch companion on a compact desktop. */}
        <div
          className={`grid min-h-0 items-start gap-3 ${roomColumns}`}
          style={{ "--room-chat-width": sideWidth } as CSSProperties}
        >
          {player.chatDock === "left" ? workspaceSidebar : null}
          <div id="multiview-stage" className="min-w-0 scroll-mt-[calc(var(--site-header-h,4rem)+0.5rem)]">
            {player.tiles.length === 0 ? (
              <EmptyStage
                liveCount={Math.min(roomLive.length, tileLimit)}
                onAdd={() => openSources()}
                onFill={fillLive}
              />
            ) : mobile && mobileMain ? (
              <div>
                <MobileStage
                  tiles={player.tiles}
                  mainId={mobileMain.id}
                  layout={mobileLayout}
                  activeIds={activeIds}
                  passportCreditTileId={passportCreditTileId}
                  onReplace={openSources}
                  feedbackFor={(item) => discovery.state.feedback[item.key]?.value ?? null}
                  onFeedback={(item, value) => discovery.setFeedback(item.key, value)}
                  onAdd={(opener) => openSources(undefined, opener)}
                  canAdd={player.tiles.length < tileLimit}
                />
                <MobileRoomControls
                  layout={mobileLayout}
                  onLayout={setMobileLayout}
                  main={mobileMain}
                  hasChat={hasRoomChat}
                  chatOpen={mobileSidebarOpen}
                  onChat={() => mobileSidebarOpen ? closeMobileSidebar() : openMobileChat()}
                  onAdd={(opener) => openSources(undefined, opener)}
                  onSettings={() => setMobileSettingsOpen(true)}
                  settingsOpen={mobileSettingsOpen}
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
                feedbackFor={(item) => discovery.state.feedback[item.key]?.value ?? null}
                onFeedback={(item, value) => discovery.setFeedback(item.key, value)}
              />
            )}

          </div>

          {player.chatDock !== "left" ? workspaceSidebar : null}
        </div>
        <div ref={setRecoveryTools} data-room-recovery-tools className="mt-2 space-y-2 empty:hidden" />
        {!mobile && player.chatDock === "bottom" && hasRoomChat ? (
          <section style={{ height: `min(${player.chatDockSize.bottom}px, 48dvh)` }} className="mt-3 overflow-hidden rounded-2xl border border-room-ink/10 bg-room-inset p-2 shadow-[0_24px_80px_rgba(0,0,0,.28)]" aria-label="Chat below the player grid">
            {chat}
          </section>
        ) : null}
      </div>

      {!mobile && player.chatDock === "floating" && hasRoomChat ? (
        <section style={floatingChatViewportStyle(player.chatFloatingRect)} className="fixed z-50 overflow-hidden rounded-2xl border border-room-ink/14 bg-room-panel/95 p-2 shadow-[0_28px_110px_rgba(0,0,0,.72)] backdrop-blur-xl" aria-label="Floating chat">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold text-room-secondary">Floating chat</span>
            <IconControlTooltip title="Return chat to the side panel" description="Place chat back with your room controls." placement="top">
              <button type="button" onClick={() => player.setChatDock("right")} className="grid size-8 place-items-center rounded-lg text-room-muted transition hover:bg-room-ink/8 hover:text-room-ink" aria-label="Return chat to the side panel"><PanelRight className="size-3.5" aria-hidden /></button>
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
          searching={archiveSearch.searching}
          searchFailed={archiveSearch.failed}
          onRetrySearch={archiveSearch.retry}
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
          liveCount={Math.min(roomLive.length, tileLimit)}
          onAdd={() => { setSetupOpen(false); openSources(); }}
          onFill={() => { fillLive(); setSetupOpen(false); }}
          onShare={() => void share()}
        />
      ) : null}

      {mobileSettingsOpen ? (
        <MobileRoomSettings
          onClose={() => setMobileSettingsOpen(false)}
          layout={mobileLayout}
          onLayout={setMobileLayout}
          tileLimit={tileLimit}
          layoutName={layoutName}
          onLayoutName={setLayoutName}
          onSave={() => void save()}
          canSaveLayouts={savedLayoutsAllowed}
          savedLayoutsHref={subscription.signedIn ? "/account" : "/login?next=/multiview"}
          onShare={() => void share()}
          onAdd={() => { setMobileSettingsOpen(false); openSources(); }}
          canAdd={player.tiles.length < tileLimit}
        />
      ) : null}

      {mainStagePickerOpen ? (
        <MainStagePicker
          groups={liveSourceGroups}
          mainItemKey={mainTile?.item.key ?? null}
          mobile={mobile}
          onClose={() => setMainStagePickerOpen(false)}
          onChoose={chooseMainStage}
        />
      ) : null}

      {notice ? (
        <div role="status" className={`fixed bottom-4 left-1/2 z-[100] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl px-4 py-2.5 text-xs font-semibold shadow-2xl ${notice.tone === "error" ? "bg-red-500 text-white" : "bg-room-ink text-room-inverse"}`}>
          <span>{notice.text}</span>
          {notice.actionHref ? (
            <Link href={notice.actionHref as never} className="shrink-0 rounded-lg bg-black px-2.5 py-1.5 text-[10px] font-semibold text-room-ink transition hover:bg-room-glass/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black">
              {notice.actionLabel ?? "Learn more"}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
    </ChatSessionProvider>
    </TwitchRoomTools.Provider>
  );
}

function RoomLayoutBar({
  preset,
  count,
  limit,
  onChoose,
  onAdd,
}: {
  preset: string;
  count: number;
  limit: number;
  onChoose: (preset: (typeof ROOM_LAYOUT_CHOICES)[number]["id"]) => void;
  onAdd: (opener?: HTMLElement | null) => void;
}) {
  const known = ROOM_LAYOUT_CHOICES.some((choice) => choice.id === preset);
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Room layout">
      <div role="radiogroup" aria-label="Layout" className="flex min-w-0 flex-wrap gap-1 rounded-2xl bg-room-ink/[0.045] p-1 ring-1 ring-inset ring-room-ink/10">
        {ROOM_LAYOUT_CHOICES.map((choice) => {
          const selected = preset === choice.id;
          return (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={selected}
              title={choice.description}
              onClick={() => onChoose(choice.id)}
              className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl px-2.5 text-xs font-semibold outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.98] ${selected ? "bg-room-ink text-room-inverse shadow-xs-skeuomorphic" : "text-room-secondary hover:bg-room-ink/8 hover:text-room-ink"}`}
            >
              <RoomLayoutGlyph preset={choice.id} count={Math.max(count, choice.id === "split" ? 2 : 3)} selected={selected} />
              {choice.label}
            </button>
          );
        })}
        {!known ? <span className="inline-flex min-h-10 items-center rounded-xl bg-room-ink/10 px-2.5 text-xs font-semibold text-room-ink" aria-label="Current layout: custom">Custom</span> : null}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs tabular-nums text-room-muted">{count} of {limit} views</span>
        <button type="button" onClick={(event) => onAdd(event.currentTarget)} className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-room-ink/5 px-3 text-xs font-semibold text-room-secondary ring-1 ring-inset ring-room-ink/12 transition hover:bg-room-ink/10 hover:text-room-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-room-ink"><Plus className="size-3.5" aria-hidden />Add view</button>
      </div>
    </div>
  );
}

/** A tiny live preview of a layout, drawn from the same geometry the stage uses. */
function RoomLayoutGlyph({ preset, count, selected }: { preset: (typeof ROOM_LAYOUT_CHOICES)[number]["id"]; count: number; selected: boolean }) {
  const rects = presetNormalizedRects(preset, Math.min(6, Math.max(1, count)), 12);
  return (
    <span aria-hidden className="relative block h-[14px] w-6 shrink-0">
      {rects.map((rect, index) => (
        <span
          key={index}
          className={`absolute rounded-[1.5px] ${selected ? (index === 0 ? "bg-room-inverse" : "bg-room-inverse/55") : index === 0 ? "bg-current" : "bg-current opacity-45"}`}
          style={{
            left: `calc(${rect.x * 100}% + 0.5px)`,
            top: `calc(${rect.y * 100}% + 0.5px)`,
            width: `calc(${rect.width * 100}% - 1px)`,
            height: `calc(${rect.height * 100}% - 1px)`,
          }}
        />
      ))}
    </span>
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
      className={`inline-flex min-h-16 min-w-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl px-2 text-[10px] font-semibold shadow-xs-skeuomorphic ring-1 ring-inset outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-35 disabled:active:scale-100 ${primary ? "bg-room-ink text-room-inverse ring-room-ink/90 hover:bg-room-ink/90" : active ? "bg-room-ink/12 text-room-ink ring-room-ink/20" : "bg-room-ink/5 text-room-secondary ring-room-ink/10 hover:bg-room-ink/10 hover:text-room-ink hover:ring-room-ink/20"}`}
    >
      <Icon className="size-4" aria-hidden />
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

function WorkspaceSidebar({
  activeTab, onTabChange, mobileOpen, mobileSheetHeight, onMobileClose,
  focused, member, tiles, chat, onAddQueue, onReplace,
}: {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  mobileOpen: boolean;
  mobileSheetHeight: number | null;
  onMobileClose: () => void;
  focused: WorkspaceTile | null;
  member: MemberRecord | null;
  tiles: WorkspaceTile[];
  chat: React.ReactNode;
  onAddQueue: (opener?: HTMLElement | null) => void;
  onReplace: (tileId: string, opener?: HTMLElement | null) => void;
}) {
  const sidebarRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    return () => {
      window.cancelAnimationFrame(frame);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [mobileOpen]);
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    // Size the desktop chat from where it *sticks*, not from where it happens
    // to be on screen. Measuring the live position made the panel grow as the
    // page scrolled. It lines up with the stage, capped to the visible height.
    const fitToViewport = () => {
      if (!window.matchMedia("(min-width: 1024px)").matches) {
        sidebar.style.removeProperty("height");
        return;
      }
      const stickyTop = Number.parseFloat(getComputedStyle(sidebar).top) || 0;
      const visible = Math.max(0, window.innerHeight - stickyTop - 16);
      const stage = document.getElementById("multiview-stage")?.getBoundingClientRect().height ?? 0;
      const target = stage > 0 ? Math.min(visible, Math.max(stage, 420)) : visible;
      const next = `${Math.floor(target)}px`;
      if (sidebar.style.height !== next) sidebar.style.height = next;
    };
    fitToViewport();
    const observer = new ResizeObserver(fitToViewport);
    const room = sidebar.closest('[aria-label="Multiview room"]');
    if (room) observer.observe(room);
    const stageElement = document.getElementById("multiview-stage");
    if (stageElement) observer.observe(stageElement);
    window.addEventListener("resize", fitToViewport);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fitToViewport);
    };
    // Re-fit when the sheet opens so a desktop-era inline height never
    // survives into the phone/tablet sheet.
  }, [mobileOpen]);
  return (
    <>
      {/* Below the desktop breakpoint chat is a non-modal sheet: the main
          player stays visible and usable above it, like a phone video app. */}
      <aside
        ref={sidebarRef}
        id="multiview-sidebar"
        data-room-sidebar
        data-sheet-open={mobileOpen || undefined}
        aria-label="Main stage Twitch chat"
        style={mobileOpen && mobileSheetHeight ? { "--room-chat-sheet-h": `${mobileSheetHeight}px` } as CSSProperties : undefined}
        onKeyDown={(event) => { if (mobileOpen && event.key === "Escape") { event.stopPropagation(); onMobileClose(); } }}
        className={`${mobileOpen ? "fixed inset-x-0 bottom-0 z-[80] flex h-[var(--room-chat-sheet-h,min(58dvh,40rem))] rounded-t-3xl border-b-0 pb-[env(safe-area-inset-bottom)] shadow-[0_-18px_60px_rgba(0,0,0,.45)] md:inset-x-3 md:bottom-3 md:rounded-2xl md:border-b md:pb-0" : "hidden rounded-2xl"} min-h-0 flex-col overflow-hidden border border-room-ink/10 bg-room-panel lg:sticky lg:inset-auto lg:top-[calc(var(--site-header-h,8rem)+.75rem)] lg:z-20 lg:flex lg:h-[max(0px,calc(100dvh-var(--site-header-h,8rem)-1.75rem))] lg:max-h-[max(0px,calc(100dvh-var(--site-header-h,8rem)-1.75rem))] lg:min-h-0 lg:w-auto lg:rounded-2xl lg:border-b lg:pb-0 lg:shadow-[0_24px_90px_rgba(0,0,0,.3)]`}
      >
        <div className="relative flex shrink-0 items-center justify-between border-b border-room-ink/10 px-3 pb-1 pt-2 lg:hidden">
          <span aria-hidden className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-room-ink/20 md:hidden" />
          <span className="text-xs font-semibold text-room-ink/65">Main stage chat</span>
          <button ref={closeRef} type="button" onClick={onMobileClose} aria-label="Close Twitch chat" className="grid size-10 cursor-pointer place-items-center rounded-xl text-room-ink/55 hover:bg-room-ink/8 hover:text-room-ink focus-visible:outline-2 focus-visible:outline-room-ink"><X className="size-4" aria-hidden /></button>
        </div>
        <RoomSidebarResize />
        <div className="min-h-0 flex-1 overflow-hidden">{chat}</div>
      </aside>
      {activeTab !== "chat" ? (
        <RoomPanelDialog title={activeTab === "queue" ? "Up next" : "Player details"} onClose={() => onTabChange("chat")}>
          {activeTab === "queue" ? <UpNextPanel onAdd={onAddQueue} /> : <DetailsPanel focused={focused} member={member} tiles={tiles} onReplace={onReplace} />}
        </RoomPanelDialog>
      ) : null}
    </>
  );
}

function RoomPanelDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef);
  return (
    <div className="fixed inset-0 z-[85] grid place-items-center bg-black/65 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="room-panel-title" tabIndex={-1} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }} className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-room-ink/15 bg-room-panel shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-room-ink/10 px-4 py-2"><h2 id="room-panel-title" className="text-sm font-semibold text-room-ink">{title}</h2><button type="button" onClick={onClose} aria-label="Close room panel" className="grid size-11 cursor-pointer place-items-center rounded-xl text-room-ink/55 hover:bg-room-ink/8 hover:text-room-ink focus-visible:outline-2 focus-visible:outline-room-ink"><X className="size-4" aria-hidden /></button></header>
        <div className="min-h-0 overflow-y-auto" data-lenis-prevent>{children}</div>
      </section>
    </div>
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
      <div className="shrink-0 border-b border-room-ink/8 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-room-ink">Up Next</p>
            <p className="mt-1 text-[10px] leading-4 text-room-faint">
              {player.queue.length
                ? `${player.queue.length} title${player.queue.length === 1 ? "" : "s"} ready. ${queueBehavior}`
                : "Add a title or let recommendations fill the room."}
            </p>
          </div>
          <button type="button" onClick={(event) => onAdd(event.currentTarget)} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-room-ink px-3 text-[10px] font-semibold text-room-inverse xl:min-h-9">
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
            <button type="button" onClick={player.clearQueue} className="min-h-11 rounded-lg px-2.5 text-[10px] font-medium text-room-muted ring-1 ring-room-ink/10 hover:bg-room-ink/7 hover:text-room-ink xl:min-h-9">Clear</button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="space-y-2">
          {player.queue.map((item, index) => (
            <article key={item.key} className="group rounded-xl bg-room-ink/[0.035] p-2 ring-1 ring-room-ink/8">
              <button type="button" onClick={() => player.playFromQueue(item.key)} className="flex w-full min-w-0 items-center gap-2 text-left">
                <span className="relative block aspect-video w-20 shrink-0 overflow-hidden rounded-lg bg-black">
                  {item.poster ? <img src={item.poster} alt="" className="h-full w-full object-cover" /> : null}
                  <span data-room-media className="absolute inset-0 grid place-items-center bg-room-glass/15 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"><Play className="size-4 fill-room-ink text-room-ink" aria-hidden /></span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-room-faint">{index === 0 ? "Next" : `${index + 1} · ${item.platform}`}</span>
                  <span className="mt-0.5 block line-clamp-2 text-[13px] font-semibold leading-5 text-room-secondary">{readableTitle(item.title)}</span>
                  {item.recommendationReason ? <span className="mt-0.5 block truncate text-[9px] text-room-faint">{item.recommendationReason}</span> : null}
                </span>
              </button>
              <div className="mt-2 flex justify-end gap-1 border-t border-room-ink/6 pt-1.5">
                <IconControlTooltip title="Move earlier" description="Move this title one place up in Up Next.">
                  <button type="button" disabled={index === 0} onClick={() => player.moveQueueItem(item.key, -1)} className="grid size-11 place-items-center rounded-lg text-room-faint hover:bg-room-ink/8 hover:text-room-ink disabled:opacity-20 xl:size-8" aria-label={`Move ${item.title} earlier`}><ChevronDown className="size-3.5 rotate-180" aria-hidden /></button>
                </IconControlTooltip>
                <IconControlTooltip title="Move later" description="Move this title one place down in Up Next.">
                  <button type="button" disabled={index === player.queue.length - 1} onClick={() => player.moveQueueItem(item.key, 1)} className="grid size-11 place-items-center rounded-lg text-room-faint hover:bg-room-ink/8 hover:text-room-ink disabled:opacity-20 xl:size-8" aria-label={`Move ${item.title} later`}><ChevronDown className="size-3.5" aria-hidden /></button>
                </IconControlTooltip>
                <IconControlTooltip title="Remove from Up Next" description="Take this title out of the queue.">
                  <button type="button" onClick={() => player.removeFromQueue(item.key)} className="grid size-11 place-items-center rounded-lg text-room-faint hover:bg-room-ink/8 hover:text-room-ink xl:size-8" aria-label={`Remove ${item.title} from Up Next`}><X className="size-3.5" aria-hidden /></button>
                </IconControlTooltip>
              </div>
            </article>
          ))}
        </div>
        {player.queue.length === 0 ? (
          <div className="grid min-h-52 place-items-center p-5 text-center">
            <div>
              <ListVideo className="mx-auto size-5 text-room-faint" aria-hidden />
              <p className="mt-3 text-xs font-semibold text-room-muted">Nothing queued yet</p>
              <p className="mt-1 text-[10px] leading-4 text-room-faint">Pick the next title yourself, or keep autoplay on for recommendations.</p>
              <button type="button" onClick={(event) => onAdd(event.currentTarget)} className="mt-4 min-h-10 rounded-xl bg-room-ink px-4 text-[11px] font-semibold text-room-inverse">Add to Up Next</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Multiview's "mini player" sends one tile to the site-wide docked mini
 * player: the focused tile (on phones, the view on screen), or the main tile
 * when nothing is focused. The viewer then returns to Watch while that stream
 * keeps playing. Every tile stays in the saved workspace, so reopening
 * Multiview restores the room.
 */
function useSendTileToMiniPlayer() {
  const player = usePlayer();
  const router = useRouter();
  return useCallback((tile: WorkspaceTile | null) => {
    if (!tile) return;
    if (player.focusedTile?.id !== tile.id) player.focusTile(tile.id, { takeAudio: true });
    player.minimize();
    router.push("/" as never, { scroll: false });
  }, [player, router]);
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
  const sendToMiniPlayer = useSendTileToMiniPlayer();
  const makeFocusedMain = () => {
    if (!focused) return;
    player.makeMain(focused.id, { takeAudio: false });
  };
  if (!focused) {
    return <div className="grid h-full min-h-52 place-items-center p-6 text-center text-xs text-room-faint">Add a player to see its details.</div>;
  }
  const source = focused.item.sourceUrl ?? focused.item.url;
  const duration = focused.item.kind === "live"
    ? "Live"
    : focused.item.durationSeconds && focused.item.durationSeconds > 0
      ? formatPlaybackTime(focused.item.durationSeconds)
      : "—";
  return (
    <div className="h-full overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable]">
      <section className="rounded-2xl border border-room-ink/10 bg-room-ink/[0.035] p-3" aria-label="Focused player details">
        <div className="flex min-w-0 gap-3">
          <span className="relative block aspect-video w-24 shrink-0 overflow-hidden rounded-xl bg-black ring-1 ring-room-ink/10">
            {focused.item.poster ? <img src={focused.item.poster} alt="" className="h-full w-full object-cover" /> : null}
            {focused.item.kind === "live" ? <span className="absolute left-1.5 top-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-white">Live</span> : null}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-room-muted">{mediaTypeLabel(focused.item)} · {platformLabel(focused.item)}</p>
            <h2 className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-room-ink" title={readableTitle(focused.item.title)}>{readableTitle(focused.item.title)}</h2>
            <p className="mt-1 truncate text-xs text-room-muted">{focused.item.memberLabel}{duration !== "—" ? ` · ${duration}` : ""}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2" aria-label="Focused player actions">
          <button type="button" onClick={makeFocusedMain} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-room-ink px-2 text-xs font-semibold text-room-inverse transition hover:bg-room-ink/85 active:scale-[.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-room-ink"><Radio className="size-4" aria-hidden /> Make main</button>
          <button type="button" onClick={() => focused.muted ? player.focusTile(focused.id, { takeAudio: true }) : player.updateTile(focused.id, { muted: true })} aria-pressed={!focused.muted} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-room-ink/15 px-2 text-xs font-semibold text-room-secondary transition hover:border-room-ink/35 hover:bg-room-ink/10 hover:text-room-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-room-ink">{focused.muted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}{focused.muted ? "Turn sound on" : "Mute sound"}</button>
          <button type="button" onClick={(event) => onReplace(focused.id, event.currentTarget)} className="min-h-11 cursor-pointer rounded-xl border border-room-ink/10 px-2 text-xs font-medium text-room-secondary transition hover:border-room-ink/30 hover:bg-room-ink/8 hover:text-room-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-room-ink">Replace stream</button>
          <button type="button" onClick={() => player.updateTile(focused.id, { fit: focused.fit === "cover" ? "contain" : "cover" })} className="min-h-11 cursor-pointer rounded-xl border border-room-ink/10 px-2 text-xs font-medium text-room-secondary transition hover:border-room-ink/30 hover:bg-room-ink/8 hover:text-room-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-room-ink">{focused.fit === "cover" ? "Fit whole video" : "Fill player"}</button>
          <button type="button" onClick={() => sendToMiniPlayer(focused)} aria-label={`Send ${focused.item.memberLabel} to the mini player`} className="col-span-2 inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-room-ink/10 px-2 text-xs font-medium text-room-secondary transition hover:border-room-ink/30 hover:bg-room-ink/8 hover:text-room-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-room-ink"><Minimize2 className="size-4" aria-hidden />Mini player</button>
        </div>
        {source ? <a href={source} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-room-muted transition hover:bg-room-ink/5 hover:text-room-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-room-ink">Open on {platformLabel(focused.item)} <ExternalLink className="size-3" aria-hidden /></a> : null}
      </section>

      {member ? (
        <section className="mt-2 flex min-w-0 items-center gap-2.5 rounded-xl bg-room-ink/[0.025] p-2.5 ring-1 ring-room-ink/8" aria-label={`${member.stageName} details`}>
          <img src={member.portrait} alt="" className="size-8 shrink-0 rounded-lg object-cover ring-1 ring-room-ink/12" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-room-secondary">{member.stageName}</p>
            <p className="mt-0.5 truncate text-xs text-room-muted">{member.roles?.join(" · ") || "CORE creator"}</p>
          </div>
          <Link href={`/channels/${member.slug}` as never} className="shrink-0 rounded-lg px-2.5 py-2 text-xs font-semibold text-room-secondary ring-1 ring-room-ink/10 transition hover:bg-room-ink/8 hover:text-room-ink">Channel</Link>
        </section>
      ) : null}

      {tiles.length > 1 ? (
        <section className="mt-3" aria-label="Open players in this room">
          <div className="flex items-center justify-between gap-3 px-0.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-room-faint">Open players</p>
            <span className="text-[9px] tabular-nums text-room-faint">{tiles.length}</span>
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
                  className={`group flex w-28 shrink-0 snap-start flex-col overflow-hidden rounded-lg text-left ring-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-room-ink ${selected ? "bg-room-ink/12 text-room-ink ring-room-ink/25" : "bg-room-ink/[0.025] text-room-secondary ring-room-ink/8 hover:bg-room-ink/[0.07] hover:text-room-ink hover:ring-room-ink/18"}`}
                >
                  <span className="relative block aspect-video w-full bg-black">{tile.item.poster ? <img src={tile.item.poster} alt="" className="h-full w-full object-cover transition duration-150 group-hover:scale-[1.03]" /> : null}{tile.item.kind === "live" ? <span className="absolute left-1 top-1 size-1.5 rounded-full bg-red-500" /> : null}</span>
                  <span className="block truncate px-1.5 py-1 text-[9px] font-semibold">{tile.item.memberLabel}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <button type="button" onClick={() => player.removeTile(focused.id)} className="mt-3 flex min-h-11 w-full cursor-pointer items-center justify-between rounded-xl px-3 text-left text-xs font-medium text-room-muted ring-1 ring-room-ink/10 transition hover:bg-red-500/10 hover:text-room-danger hover:ring-red-400/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-room-ink">Remove player <Trash2 className="size-4" aria-hidden /></button>
    </div>
  );
}

function EmptyStage({ liveCount, onAdd, onFill }: { liveCount: number; onAdd: () => void; onFill: () => void }) {
  return (
    <section className="grid min-h-[22rem] place-items-center rounded-3xl border border-dashed border-room-ink/12 bg-gradient-to-b from-white/[0.035] to-transparent p-5 text-center sm:min-h-[62dvh] sm:p-6">
      <div className="max-w-md">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-room-ink/7 ring-1 ring-room-ink/10"><LayoutGrid className="size-5 text-room-secondary" /></span>
        <h2 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">Choose streams to watch together</h2>
        <p className="mt-2 text-base leading-6 text-room-secondary">Add a live stream or video. Choose which player has sound, then arrange your views.</p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row sm:flex-wrap">
          <button type="button" onClick={onAdd} className="min-h-11 rounded-xl bg-room-ink px-5 text-sm font-semibold text-room-inverse">Add a player</button>
          {liveCount ? <button type="button" onClick={onFill} className="min-h-11 rounded-xl px-5 text-sm font-semibold text-room-ink ring-1 ring-room-ink/15">Watch live channels</button> : <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-xl px-5 text-sm font-semibold text-room-ink ring-1 ring-room-ink/15">No one is live · Refresh</button>}
        </div>
      </div>
    </section>
  );
}

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
  feedbackFor: (item: Playable) => WatchFeedbackValue | null;
  onFeedback: (item: Playable, value: WatchFeedbackValue | null) => void;
}) {
  const player = usePlayer();
  // Selection drives details and audio, but never moves the room under the
  // viewer. A pinned tile is the deliberate main view; otherwise the first
  // source keeps the main slot until the user promotes another one.
  const main = mainRoomTile(tiles);
  const roomRef = useRef<HTMLElement>(null);
  const [roomWidth, setRoomWidth] = useState(0);
  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    const measure = () => setRoomWidth(room.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(room);
    return () => observer.disconnect();
  }, []);
  const mainMember = main
    ? MEMBERS.find((entry) => entry.slug === main.item.memberSlug || entry.twitchLogin.toLowerCase() === main.item.twitchLogin?.toLowerCase())
    : null;
  const pairView = tiles.length === 2 && lockedSlots.length === 0 && !maximizedTileId;
  const pairContainsTwitch = pairView && tiles.some((tile) => tile.item.platform === "twitch");
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
    return new Map(resolvePresetRoomLayout(player.layoutPreset, ids, {
      focusedId: main?.id ?? null,
      snapDensity: studioDensity,
      twitchSafeTheaterPair: pairContainsTwitch,
    }).map((entry) => [entry.id, entry.rect]));
  }, [lockedSlots, main?.id, pairContainsTwitch, player.layoutPreset, studioDensity, tiles]);

  // Provider minimums, ordering and swaps must use the same geometry that is
  // painted, including membership placeholders in the selected arrangement.
  const displayedRectFor = (tile: WorkspaceTile) => lockedSlots.length
    ? lockedGeometryById.get(tile.id) ?? roomTileRect(tile, studioDensity, studioDensity)
    : hasCustomGeometry
      ? roomTileRect(tile, studioDensity, studioDensity)
      : presetGeometryById.get(tile.id) ?? roomTileRect(tile, studioDensity, studioDensity);

  const stacked = !maximizedTileId && tiles.length > 1 && shouldStackTwitchRoom(roomWidth,
    tiles.filter((tile) => tile.item.platform === "twitch").map(displayedRectFor));

  // Stacked rows follow the room's reading order (top, then left) via CSS
  // `order`, so a swap stays visible here without moving provider iframes.
  const stackedOrder = new Map(stacked
    ? tiles
      .map((tile) => ({ id: tile.id, rect: displayedRectFor(tile) }))
      .sort((a, b) => Math.abs(a.rect.y - b.rect.y) > 0.02 ? a.rect.y - b.rect.y : a.rect.x - b.rect.x)
      .map((entry, index) => [entry.id, index] as const)
    : []);

  const tileStyle = (tile: WorkspaceTile): React.CSSProperties => {
    if (stacked) return { gridColumn: "1 / -1", gridRow: "auto", order: stackedOrder.get(tile.id) ?? 0 };
    if (lockedSlots.length) return roomRectStyle(displayedRectFor(tile), studioDensity);
    if (hasCustomGeometry) return roomTileStyle(tile, studioDensity);
    return roomRectStyle(presetGeometryById.get(tile.id) ?? roomTileRect(tile, studioDensity, studioDensity), studioDensity);
  };

  const lockedStyle = (index: number): React.CSSProperties => {
    if (stacked) return { gridColumn: "1 / -1", gridRow: "auto", order: tiles.length + index };
    const slot = lockedSlots[index];
    const fallback = presetGeometry[index + tiles.length]?.rect
      ?? roomTileRect(tiles.at(-1) ?? tiles[0]!, studioDensity, studioDensity);
    return roomRectStyle(slot ? lockedGeometryById.get(slot.id) ?? fallback : fallback, studioDensity);
  };

  // Swaps exchange what the viewer sees. A computed preset is frozen first so
  // untouched tiles stay put, and whichever tile lands in the main slot
  // becomes the main player (ring, creator tags, details).
  const swapDisplayed = (sourceId: string, targetId: string) => {
    const displayed = hasCustomGeometry || stacked
      ? undefined
      : new Map(tiles.map((tile) => [tile.id, displayedRectFor(tile)]));
    player.swapTiles(sourceId, targetId, displayed);
    if (main && (sourceId === main.id || targetId === main.id) && !maximizedTileId) {
      player.makeMain(sourceId === main.id ? targetId : sourceId, { takeAudio: false });
    }
  };

  return (
    <TileSwapProvider onSwap={swapDisplayed}>
    <section
      ref={roomRef}
      aria-label="Theater multiview room"
      className="multiview-room__stage relative isolate aspect-video min-h-[20rem] overflow-clip rounded-[1.35rem] border border-room-ink/10 bg-room-canvas shadow-[0_34px_120px_rgba(0,0,0,.56)] sm:min-h-[26rem]"
      style={stacked ? { aspectRatio: "auto" } : undefined}
    >
      {main && player.ambientLighting && !player.dataSaver && player.accessibilityPreset !== "calm" ? (
        <PlayerAmbientBloom source={main.item.poster} accent={mainMember?.accent ?? "#e9006f"} frame />
      ) : null}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(5,5,7,.12),rgba(5,5,7,.42))]" aria-hidden />
      <div
        className="relative z-[2] grid h-full min-h-[inherit] gap-2 p-2.5 sm:gap-3 sm:p-3"
        style={{
          gridTemplateColumns: `repeat(${studioDensity}, minmax(0, 1fr))`,
          gridTemplateRows: stacked ? `repeat(${tiles.length + lockedSlots.length}, minmax(384px, 1fr))` : `repeat(${studioDensity}, minmax(0, 1fr))`,
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
    </section>
    </TileSwapProvider>
  );
}

/**
 * The phone room. Like the Theater surface, every rendered PlayerTile stays in
 * one keyed list so promoting a view only changes CSS order/span and never
 * restarts a provider frame. The stage bleeds to the screen edges: a phone's
 * full width is what lets a Twitch tile reach Twitch's 400px embed minimum.
 */
function MobileStage({
  tiles,
  mainId,
  layout,
  activeIds,
  passportCreditTileId,
  onReplace,
  feedbackFor,
  onFeedback,
  onAdd,
  canAdd,
}: {
  tiles: WorkspaceTile[];
  mainId: string;
  layout: MobileLayout;
  activeIds: Set<string>;
  passportCreditTileId: string | null;
  onReplace: (id: string, opener?: HTMLElement | null) => void;
  feedbackFor: (item: Playable) => WatchFeedbackValue | null;
  onFeedback: (item: Playable, value: WatchFeedbackValue | null) => void;
  onAdd: (opener?: HTMLElement | null) => void;
  canAdd: boolean;
}) {
  const player = usePlayer();
  const main = tiles.find((tile) => tile.id === mainId) ?? tiles[0]!;
  const member = MEMBERS.find((entry) => entry.slug === main.item.memberSlug || entry.twitchLogin.toLowerCase() === main.item.twitchLogin?.toLowerCase());
  const ambientActive = player.ambientLighting && !player.dataSaver && player.accessibilityPreset !== "calm";
  const others = tiles.filter((tile) => tile.id !== main.id);
  const rendered = layout === "focus" ? [main] : tiles;
  // An odd final companion in "Main + views" takes the full row instead of
  // leaving half the screen empty.
  const fullWidthCompanion = layout === "split" && others.length % 2 === 1 ? others.at(-1)?.id : null;
  // Phone tiles reorder with CSS `order` only: moving a provider iframe in the
  // DOM would restart it. Dropping on (or from) the main view promotes.
  const [order, setOrder] = useState<string[]>([]);
  const rank = (id: string) => {
    const index = order.indexOf(id);
    return index >= 0 ? index : order.length + tiles.findIndex((tile) => tile.id === id);
  };
  const swapMobile = (sourceId: string, targetId: string) => {
    if (sourceId === main.id || targetId === main.id) {
      player.focusTile(sourceId === main.id ? targetId : sourceId);
      return;
    }
    setOrder(() => {
      const ids = [...tiles].sort((a, b) => rank(a.id) - rank(b.id)).map((tile) => tile.id);
      const from = ids.indexOf(sourceId);
      const to = ids.indexOf(targetId);
      if (from < 0 || to < 0) return ids;
      [ids[from], ids[to]] = [ids[to]!, ids[from]!];
      return ids;
    });
  };
  return (
    <TileSwapProvider onSwap={swapMobile}>
    <section aria-label="Mobile player view" data-mobile-layout={layout} className="-mx-3 sm:-mx-5">
      <div className="relative isolate">
        {ambientActive ? <PlayerAmbientBloom source={main.item.poster} accent={member?.accent ?? "#e9006f"} frame /> : null}
        <div className="relative z-[2] grid grid-cols-2 gap-0.5">
          {rendered.map((tile) => {
            const isMain = tile.id === main.id;
            const compact = layout === "split" && !isMain && tile.id !== fullWidthCompanion;
            const portrait = contentShape(tile.item) === "portrait";
            return (
              <PlayerTile
                key={tile.id}
                tile={tile}
                active={activeIds.has(tile.id)}
                focused={isMain}
                passportCredit={tile.id === passportCreditTileId}
                maximized={layout === "focus"}
                mobile
                compact={compact}
                theater
                onReplace={onReplace}
                feedback={feedbackFor(tile.item)}
                onFeedback={onFeedback}
                style={{
                  gridColumn: compact ? "span 1 / span 1" : "1 / -1",
                  order: layout === "split" && isMain ? -1 : rank(tile.id),
                  justifySelf: portrait && !compact ? "center" : "stretch",
                }}
              />
            );
          })}
        </div>
      </div>
      {layout === "focus" && (tiles.length > 1 || canAdd) ? (
        <div className="mt-2 px-3 sm:px-5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-room-faint">Views · tap to watch</p>
          <div className="flex snap-x gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Choose the view to watch">
            {tiles.map((entry) => {
              const selected = entry.id === main.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => player.focusTile(entry.id)}
                  aria-pressed={selected}
                  aria-label={`Watch ${entry.item.memberLabel}: ${readableTitle(entry.item.title)}`}
                  className={`flex w-40 shrink-0 cursor-pointer snap-start flex-col overflow-hidden rounded-xl text-left ring-1 ring-inset outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.98] ${selected ? "bg-room-ink/10 text-room-ink ring-room-ink/40" : "bg-room-ink/[0.035] text-room-secondary ring-room-ink/10 hover:bg-room-ink/8 hover:text-room-ink"}`}
                >
                  <span className="relative block aspect-video w-full overflow-hidden bg-black">
                    {entry.item.poster ? <img src={entry.item.poster} alt="" className="h-full w-full object-cover" /> : null}
                    {entry.item.kind === "live" ? <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white"><span className="size-1 rounded-full bg-white" />Live</span> : null}
                    {selected ? <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1 pt-4 text-[9px] font-semibold text-white">Watching</span> : null}
                  </span>
                  <span className="block px-2 py-1.5">
                    <span className="block truncate text-[11px] font-semibold">{entry.item.memberLabel}</span>
                    <span className="block truncate text-[10px] text-room-muted">{platformLabel(entry.item)} · {entry.muted ? "Muted" : "Sound on"}</span>
                  </span>
                </button>
              );
            })}
            {canAdd ? (
              <button type="button" onClick={(event) => onAdd(event.currentTarget)} className="grid w-28 shrink-0 cursor-pointer snap-start place-items-center rounded-xl border border-dashed border-room-ink/18 text-[11px] font-semibold text-room-secondary outline-focus-ring transition hover:bg-room-ink/5 hover:text-room-ink focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.98]">
                <span className="grid justify-items-center gap-1.5"><Plus className="size-4" aria-hidden />Add view</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
    </TileSwapProvider>
  );
}

function MobileControlButton({
  label,
  caption,
  icon: Icon,
  onClick,
  active,
  disabled,
  expanded,
  controls,
}: {
  label: string;
  caption: string;
  icon: typeof Plus;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  controls?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={expanded === undefined ? active : undefined}
      aria-expanded={expanded}
      aria-controls={controls}
      className={`grid min-h-11 min-w-11 cursor-pointer justify-items-center gap-0.5 rounded-xl px-1 pb-1 pt-1.5 text-[9px] font-semibold outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.96] disabled:cursor-not-allowed disabled:opacity-35 ${active ? "bg-room-ink text-room-inverse" : "text-room-secondary hover:bg-room-ink/8 hover:text-room-ink"}`}
    >
      <Icon className="size-4" aria-hidden />
      <span aria-hidden>{caption}</span>
    </button>
  );
}

function MobileRoomControls({
  layout,
  onLayout,
  main,
  hasChat,
  chatOpen,
  onChat,
  onAdd,
  onSettings,
  settingsOpen,
}: {
  layout: MobileLayout;
  onLayout: (value: MobileLayout) => void;
  main: WorkspaceTile;
  hasChat: boolean;
  chatOpen: boolean;
  onChat: () => void;
  onAdd: (opener?: HTMLElement | null) => void;
  onSettings: () => void;
  settingsOpen: boolean;
}) {
  const player = usePlayer();
  const audible = player.tiles.find((tile) => !tile.muted && tile.volume > 0);
  return (
    <div className="mt-2 rounded-2xl bg-room-panel/80 p-1 ring-1 ring-inset ring-room-ink/10" role="toolbar" aria-label="Multiview controls">
      <div className="flex items-center gap-1">
        <div role="radiogroup" aria-label="Phone layout" className="flex shrink-0 gap-0.5 rounded-xl bg-room-ink/[0.045] p-0.5">
          {MOBILE_LAYOUTS.map((entry) => {
            const Icon = entry.icon;
            const selected = layout === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${entry.label} layout`}
                title={entry.label}
                onClick={() => onLayout(entry.id)}
                className={`grid size-10 cursor-pointer place-items-center rounded-[0.6rem] outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.96] ${selected ? "bg-room-ink text-room-inverse shadow-xs-skeuomorphic" : "text-room-muted hover:bg-room-ink/8 hover:text-room-ink"}`}
              >
                <Icon className="size-4" aria-hidden />
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          <MobileControlButton
            label={main.muted ? `Play sound from ${main.item.memberLabel}` : `Mute ${main.item.memberLabel}`}
            caption="Sound"
            icon={main.muted ? VolumeX : Volume2}
            active={!main.muted}
            onClick={() => main.muted ? player.focusTile(main.id, { takeAudio: true }) : player.updateTile(main.id, { muted: true })}
          />
          <MobileControlButton label="Add a view" caption="Add" icon={Plus} onClick={(event) => onAdd(event.currentTarget)} />
          <MobileControlButton label={chatOpen ? "Close chat" : "Open chat"} caption="Chat" icon={MessageSquare} onClick={onChat} disabled={!hasChat && !chatOpen} expanded={chatOpen} controls="multiview-sidebar" active={chatOpen} />
          <MobileControlButton label="Room settings" caption="Settings" icon={SlidersHorizontal} onClick={onSettings} expanded={settingsOpen} controls="multiview-mobile-settings" active={settingsOpen} />
        </div>
      </div>
      <p className="truncate px-2 pb-1 pt-0.5 text-[10px] text-room-muted" aria-live="polite">
        {audible ? <>Sound from <span className="font-semibold text-room-secondary">{audible.item.memberLabel}</span>{audible.id === main.id ? "" : " · another view"}</> : "All views muted · tap Sound to listen"}
      </p>
    </div>
  );
}

function MobileSettingsSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="border-t border-room-ink/8 px-4 py-4 first:border-t-0" aria-label={title}>
      <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-room-faint">{title}</h3>
      {description ? <p className="mt-1 text-xs leading-5 text-room-muted">{description}</p> : null}
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

const MOBILE_PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2];

/**
 * Room Studio is a pointer-driven canvas for arranging desktop geometry,
 * which a phone never renders. Phones get the settings that actually change
 * their room, applied live through the same PlayerProvider setters.
 */
function MobileRoomSettings({
  onClose,
  layout,
  onLayout,
  tileLimit,
  layoutName,
  onLayoutName,
  onSave,
  canSaveLayouts,
  savedLayoutsHref,
  onShare,
  onAdd,
  canAdd,
}: {
  onClose: () => void;
  layout: MobileLayout;
  onLayout: (value: MobileLayout) => void;
  tileLimit: number;
  layoutName: string;
  onLayoutName: (value: string) => void;
  onSave: () => void;
  canSaveLayouts: boolean;
  savedLayoutsHref: string;
  onShare: () => void;
  onAdd: () => void;
  canAdd: boolean;
}) {
  const player = usePlayer();
  const dialogRef = useRef<HTMLElement>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  useDialogFocus(dialogRef);
  const playingCap = Math.max(1, Math.min(8, tileLimit));
  const anyAudible = player.tiles.some((tile) => !tile.muted && tile.volume > 0);

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        ref={dialogRef}
        id="multiview-mobile-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="multiview-mobile-settings-title"
        tabIndex={-1}
        onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}
        className="multiview-mobile-settings absolute inset-x-0 bottom-0 flex max-h-[90dvh] flex-col overflow-hidden rounded-t-3xl border border-b-0 border-room-ink/12 bg-room-panel pb-[env(safe-area-inset-bottom)] text-room-ink shadow-[0_-24px_80px_rgba(0,0,0,.55)]"
      >
        <header className="relative flex shrink-0 items-center justify-between gap-3 border-b border-room-ink/8 px-4 pb-2 pt-4">
          <span aria-hidden className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-room-ink/20" />
          <div className="min-w-0">
            <h2 id="multiview-mobile-settings-title" className="text-base font-semibold tracking-tight">Room settings</h2>
            <p className="text-xs text-room-muted">Changes apply right away.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close room settings" className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl text-room-muted hover:bg-room-ink/8 hover:text-room-ink focus-visible:outline-2 focus-visible:outline-room-ink"><X className="size-4" aria-hidden /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-lenis-prevent>
          <MobileSettingsSection title="Phone layout">
            <div role="radiogroup" aria-label="Phone layout" className="grid grid-cols-3 gap-2">
              {MOBILE_LAYOUTS.map((entry) => {
                const selected = layout === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onLayout(entry.id)}
                    className={`flex min-h-28 cursor-pointer flex-col rounded-xl p-2 text-left ring-1 ring-inset outline-focus-ring transition focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.98] ${selected ? "bg-room-ink text-room-inverse ring-room-ink" : "bg-room-ink/[0.035] text-room-secondary ring-room-ink/10 hover:bg-room-ink/8"}`}
                  >
                    <MobileLayoutDiagram layout={entry.id} selected={selected} />
                    <span className="mt-2 block text-[11px] font-semibold">{entry.label}</span>
                    <span className={`mt-0.5 block text-[9px] leading-3 ${selected ? "text-room-inverse/65" : "text-room-faint"}`}>{entry.description}</span>
                  </button>
                );
              })}
            </div>
          </MobileSettingsSection>

          <MobileSettingsSection title="Sound" description={player.mixAudio ? "Mixing is on: several views can play sound at once." : "One view plays sound at a time. Choosing another moves the sound there."}>
            {player.tiles.length ? player.tiles.map((tile) => {
              const audible = !tile.muted && tile.volume > 0;
              return (
                <div key={tile.id} className={`flex min-h-14 items-center gap-2.5 rounded-xl px-2 ring-1 ring-inset ${audible ? "bg-room-ink/[0.07] ring-room-ink/18" : "bg-room-ink/[0.025] ring-room-ink/8"}`}>
                  <button
                    type="button"
                    onClick={() => audible ? player.updateTile(tile.id, { muted: true }) : player.updateTile(tile.id, { muted: false, volume: tile.volume > 0 ? tile.volume : 1 })}
                    aria-pressed={audible}
                    aria-label={audible ? `Mute ${tile.item.memberLabel}` : `Play sound from ${tile.item.memberLabel}`}
                    className={`grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg outline-focus-ring transition focus-visible:outline-2 focus-visible:outline-offset-2 ${audible ? "bg-room-ink text-room-inverse" : "bg-room-ink/8 text-room-muted hover:text-room-ink"}`}
                  >
                    {audible ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-room-secondary">{tile.item.memberLabel}</span>
                    <span className="block truncate text-[10px] text-room-faint">{audible ? `${Math.round(tile.volume * 100)}% volume` : "Muted"} · {platformLabel(tile.item)}</span>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={tile.muted ? 0 : tile.volume}
                    onChange={(event) => {
                      const volume = Number(event.target.value);
                      player.updateTile(tile.id, volume === 0 ? { muted: true } : { volume, muted: false });
                    }}
                    className="h-11 w-24 shrink-0 cursor-pointer accent-room-ink"
                    aria-label={`${tile.item.memberLabel} volume`}
                  />
                </div>
              );
            }) : <p className="text-xs text-room-faint">Add a view to choose its sound.</p>}
            <SettingToggle label="Mix audio" description="Let more than one view play sound" value={player.mixAudio} onChange={player.setMixAudio} />
            <button type="button" disabled={!anyAudible} onClick={player.muteAll} className="min-h-11 w-full cursor-pointer rounded-xl bg-room-ink/5 px-3 text-left text-xs font-semibold text-room-secondary ring-1 ring-inset ring-room-ink/10 transition hover:bg-room-ink/10 hover:text-room-ink disabled:cursor-not-allowed disabled:opacity-40">Mute every view</button>
          </MobileSettingsSection>

          <MobileSettingsSection title="Playback" description="Phones play fewer views at once to stay smooth. A paused view shows an Activate button.">
            <SettingRange label={`Views playing at once · ${Math.min(player.maxActivePlayers, playingCap)}`} min={1} max={playingCap} value={Math.min(player.maxActivePlayers, playingCap)} onChange={player.setMaxActivePlayers} />
            <SettingToggle label="Data saver" description="Keep only the main view playing" value={player.dataSaver} onChange={player.setDataSaver} />
            <SettingSelect label="When a video ends" value={player.autoplayMode} onChange={(value) => player.setAutoplayMode(value as typeof player.autoplayMode)} options={AUTOPLAY_MODES.map((entry) => ({ value: entry.id, label: entry.label }))} />
            <SettingSelect label="Video quality" value={player.qualityPreference} onChange={(value) => player.setQualityPreference(value as typeof player.qualityPreference)} options={[{ value: "auto", label: "Auto" }, { value: "best", label: "Best available" }, { value: "balanced", label: "Balanced" }, { value: "data-saver", label: "Data saver" }]} />
            <div className="grid gap-1">
              <p className="text-[10px] text-room-muted">Playback speed</p>
              <div role="radiogroup" aria-label="Playback speed" className="grid grid-cols-5 gap-1 rounded-xl bg-room-ink/[0.035] p-1 ring-1 ring-inset ring-room-ink/8">
                {MOBILE_PLAYBACK_RATES.map((rate) => {
                  const selected = Math.abs(player.playbackRate - rate) < 0.01;
                  return <button key={rate} type="button" role="radio" aria-checked={selected} onClick={() => player.setPlaybackRate(rate)} className={`min-h-10 cursor-pointer rounded-lg text-[11px] font-semibold tabular-nums transition ${selected ? "bg-room-ink text-room-inverse" : "text-room-muted hover:text-room-ink"}`}>{rate}×</button>;
                })}
              </div>
              <p className="text-[10px] text-room-faint">Speed applies to videos. Live streams stay at the live edge.</p>
            </div>
            <SettingToggle label="Captions" description="Show captions on supported videos" value={player.captionsEnabled} onChange={player.setCaptionsEnabled} />
          </MobileSettingsSection>

          <MobileSettingsSection title="Chat">
            <SettingRange label={`Text size · ${Math.round(player.chatTextScale * 100)}%`} min={0.7} max={1.8} step={0.1} value={player.chatTextScale} onChange={player.setChatTextScale} />
            <SettingToggle label="Show timestamps" description="Show the local time on each message" value={player.showChatTimestamps} onChange={player.setShowChatTimestamps} />
          </MobileSettingsSection>

          <MobileSettingsSection title="Saved rooms" description={canSaveLayouts ? "Save this set of views and settings to open it again on any device." : "Sign in to save rooms to your account."}>
            {canSaveLayouts ? (
              <div className="flex gap-2">
                <input value={layoutName} onChange={(event) => onLayoutName(event.target.value)} placeholder="Room name" maxLength={80} aria-label="Room name" className="min-h-11 min-w-0 flex-1 rounded-xl bg-room-ink/5 px-3 text-sm text-room-ink outline-none ring-1 ring-room-ink/10 placeholder:text-room-faint focus:ring-room-ink/30" />
                <button type="button" onClick={onSave} disabled={!player.tiles.length} className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-room-ink px-3 text-xs font-semibold text-room-inverse disabled:cursor-not-allowed disabled:opacity-40"><Save className="size-4" aria-hidden />Save</button>
              </div>
            ) : (
              <Link href={savedLayoutsHref as never} className="flex min-h-12 items-center gap-3 rounded-xl bg-room-ink/[0.035] px-3 text-xs font-semibold text-room-secondary ring-1 ring-inset ring-room-ink/10 hover:bg-room-ink/8"><LockKeyhole className="size-4 shrink-0" aria-hidden />Sign in to save rooms</Link>
            )}
            {player.savedLayouts.length ? (
              <ul className="space-y-1.5">
                {player.savedLayouts.map((saved) => (
                  <li key={`${saved.name}-${saved.updatedAt}`} className="flex items-center gap-2 rounded-xl bg-room-ink/[0.035] p-1.5 pl-3 ring-1 ring-inset ring-room-ink/8">
                    <button type="button" onClick={() => { player.loadLayout(saved.name); onClose(); }} className="min-h-11 min-w-0 flex-1 cursor-pointer text-left">
                      <span className="block truncate text-xs font-semibold text-room-secondary">{saved.name}</span>
                      <span className="block text-[10px] text-room-faint">{saved.tiles.length} view{saved.tiles.length === 1 ? "" : "s"}{saved.remote ? " · synced" : ""}</span>
                    </button>
                    <button type="button" onClick={() => void player.deleteLayout(saved.name)} aria-label={`Delete ${saved.name}`} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg text-room-faint hover:bg-room-ink/8 hover:text-room-danger"><Trash2 className="size-4" aria-hidden /></button>
                  </li>
                ))}
              </ul>
            ) : null}
          </MobileSettingsSection>

          <MobileSettingsSection title="Room">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={onAdd} disabled={!canAdd} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-room-ink/5 px-3 text-xs font-semibold text-room-secondary ring-1 ring-inset ring-room-ink/10 hover:bg-room-ink/10 disabled:cursor-not-allowed disabled:opacity-40"><Plus className="size-4" aria-hidden />Add view</button>
              <button type="button" onClick={onShare} disabled={!player.tiles.length} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-room-ink/5 px-3 text-xs font-semibold text-room-secondary ring-1 ring-inset ring-room-ink/10 hover:bg-room-ink/10 disabled:cursor-not-allowed disabled:opacity-40"><Share2 className="size-4" aria-hidden />Copy room link</button>
            </div>
            {player.tiles.length ? (
              confirmClear ? (
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-red-500/10 p-2 ring-1 ring-inset ring-red-400/20">
                  <p className="col-span-2 px-1 text-xs text-room-secondary">Remove all {player.tiles.length} views from this room?</p>
                  <button type="button" onClick={() => { for (const tile of player.tiles) player.removeTile(tile.id); setConfirmClear(false); onClose(); }} className="min-h-11 cursor-pointer rounded-lg bg-red-600 px-3 text-xs font-semibold text-white">Remove all</button>
                  <button type="button" onClick={() => setConfirmClear(false)} className="min-h-11 cursor-pointer rounded-lg px-3 text-xs font-semibold text-room-secondary ring-1 ring-inset ring-room-ink/12">Keep views</button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmClear(true)} className="flex min-h-11 w-full cursor-pointer items-center justify-between rounded-xl px-3 text-left text-xs font-medium text-room-muted ring-1 ring-inset ring-room-ink/10 hover:bg-red-500/10 hover:text-room-danger">Clear room <Trash2 className="size-4" aria-hidden /></button>
              )
            ) : null}
            <p className="flex items-start gap-2 text-[10px] leading-4 text-room-faint"><MonitorSmartphone className="mt-0.5 size-3.5 shrink-0" aria-hidden />Custom grid arrangements and chat docks are set in Room Studio on a tablet or computer. Saved rooms keep them.</p>
          </MobileSettingsSection>
        </div>
      </section>
    </div>
  );
}

function MobileLayoutDiagram({ layout, selected }: { layout: MobileLayout; selected: boolean }) {
  const block = selected ? "bg-room-inverse/80" : "bg-room-ink/40";
  const soft = selected ? "bg-room-inverse/40" : "bg-room-ink/18";
  return (
    <span aria-hidden className="grid h-12 w-8 gap-0.5 rounded-md p-0.5 ring-1 ring-inset ring-current/15" style={{ gridTemplateRows: layout === "stack" ? "1fr 1fr 1fr" : layout === "split" ? "1.4fr 1fr 1fr" : "1.4fr .6fr" }}>
      {layout === "focus" ? <><span className={`rounded-[2px] ${block}`} /><span className="flex gap-0.5"><span className={`flex-1 rounded-[2px] ${soft}`} /><span className={`flex-1 rounded-[2px] ${soft}`} /><span className={`flex-1 rounded-[2px] ${soft}`} /></span></> : null}
      {layout === "stack" ? <><span className={`rounded-[2px] ${block}`} /><span className={`rounded-[2px] ${block}`} /><span className={`rounded-[2px] ${block}`} /></> : null}
      {layout === "split" ? <><span className={`rounded-[2px] ${block}`} /><span className="grid grid-cols-2 gap-0.5"><span className={`rounded-[2px] ${block}`} /><span className={`rounded-[2px] ${block}`} /></span><span className="grid grid-cols-2 gap-0.5"><span className={`rounded-[2px] ${block}`} /><span className={`rounded-[2px] ${soft}`} /></span></> : null}
    </span>
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
      className="multiview-room__locked relative isolate flex min-h-[18rem] overflow-hidden rounded-xl bg-room-inset p-5 shadow-xl ring-1 ring-room-ink/10"
    >
      <div aria-hidden className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_20%_15%,rgba(236,0,99,.22),transparent_38%),radial-gradient(circle_at_78%_74%,rgba(94,92,230,.24),transparent_42%),linear-gradient(135deg,#15151a,#08080a)]">
        <span className="absolute -left-12 top-1/4 size-48 rounded-full bg-fuchsia-500/15 blur-3xl" />
        <span className="absolute -right-10 bottom-0 size-56 rounded-full bg-indigo-400/15 blur-3xl" />
        <span className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:34px_34px]" />
      </div>
      <div className="relative z-10 m-auto flex max-w-xs flex-col items-center text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-room-glass/45 text-room-ink ring-1 ring-room-ink/15 backdrop-blur-xl">
          <LockKeyhole className="size-5" aria-hidden />
        </span>
        <p className="mt-4 text-sm font-semibold text-room-ink">Live stream locked</p>
        <p className="mt-1 text-xs leading-5 text-room-muted">
          Your current tier supports {playableLimit} simultaneous players. {requiredPlan} unlocks the full live room.
        </p>
        <Link
          href={upgradeHref as never}
          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-room-ink px-4 text-xs font-semibold text-room-inverse transition hover:bg-room-ink/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-room-ink"
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
  /** A half-width phone companion: a live preview that swaps into the main view on tap. */
  compact?: boolean;
  /** The Theater room owns the tile's dimensions; media remains contained inside it. */
  theater?: boolean;
  onReplace: (id: string, opener?: HTMLElement | null) => void;
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
  const actionsRef = useRef({
    onReplace: props.onReplace,
    onFeedback: props.onFeedback,
  });
  actionsRef.current = {
    onReplace: props.onReplace,
    onFeedback: props.onFeedback,
  };

  const stableActions = useMemo(() => ({
    onReplace: (...args: Parameters<PlayerTileProps["onReplace"]>) => actionsRef.current.onReplace(...args),
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
    makeMain: player.makeMain,
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
    player.makeMain,
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
  compact = false,
  theater = false,
  onReplace,
  feedback,
  onFeedback,
  style,
  player,
}: PlayerTileProps & { player: PlayerTileRuntime }) {
  const swap = useTileSwap();
  const swapMeta = { title: readableTitle(tile.item.title), subtitle: `${tile.item.memberLabel} · ${platformLabel(tile.item)}`, poster: tile.item.poster };
  const { creator: creatorContainer, status: statusContainer } = useContext(TwitchRoomTools);
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
  const [frameReadyToken, setFrameReadyToken] = useState(0);
  const [failedNativeSource, setFailedNativeSource] = useState<string | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const positionRef = useRef(0);
  const presenceClockRef = useRef<FacePlaybackSample | null>(null);
  const durationRef = useRef(tile.item.durationSeconds ?? 0);
  const playingRef = useRef(false);
  const measurementStartedAtRef = useRef<number | null>(null);
  const timedEmbedRef = useRef(false);
  const finishedRef = useRef(false);
  const tooSmallForTwitch = tile.item.platform === "twitch"
    && size.width > 0
    && (size.width < 400 || size.height - 64 < 300);
  const standby = tile.standby || !active || tooSmallForTwitch;
  const twitchSourceUrl = tile.item.twitchLogin
    ? `https://www.twitch.tv/${encodeURIComponent(tile.item.twitchLogin)}`
    : tile.item.vodId ? `https://www.twitch.tv/videos/${encodeURIComponent(tile.item.vodId)}`
      : tile.item.clipId ? `https://clips.twitch.tv/${encodeURIComponent(tile.item.clipId)}` : "https://www.twitch.tv/";
  const readPresenceTimeMs = useCallback(
    () => videoRef.current && videoRef.current.readyState >= 2
      ? videoRef.current.currentTime * 1000
      : facePresencePlaybackMs(presenceClockRef.current, tile.item.key),
    [tile.item.key],
  );

  const checkpointTile = useCallback(() => {
    if (positionRef.current <= 0) return;
    const startedAt = measurementStartedAtRef.current;
    measurementStartedAtRef.current = null;
    const elapsedPlaying = !passportCredit || startedAt === null ? 0 : Math.max(0, Math.min(30, (performance.now() - startedAt) / 1_000));
    const duration = durationRef.current;
    checkpoint(
      tile.item.key,
      tile.item.kind,
      tile.item.memberSlug,
      duration > 0 ? Math.min(0.99, positionRef.current / duration) : 0,
      positionRef.current,
      duration,
      tile.item.platform,
      elapsedPlaying,
      tile.item.youtubeId || videoRef.current ? player.playbackRate : 1,
    );
  }, [checkpoint, passportCredit, player.playbackRate, tile.item.key, tile.item.kind, tile.item.memberSlug, tile.item.platform, tile.item.youtubeId]);

  const finishPlayback = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    playingRef.current = false;
    setIsTilePlaying(false);
    checkpointTile();
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
  }, [checkpoint, checkpointTile, markComplete, passportCredit, player, tile.id, tile.item.key, tile.item.kind, tile.item.memberSlug, tile.item.platform]);

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
      // Only media with real playback events and playhead observations earns
      // watch time. An iframe load alone cannot prove a video is playing.
      if (!timedEmbedRef.current && !videoRef.current) return;
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
          tile.item.youtubeId || videoRef.current ? player.playbackRate : 1,
        );
        measurementStartedAtRef.current = performance.now();
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
  }, [checkpoint, checkpointTile, inViewport, passportCredit, player.playbackRate, standby, tile.item.key, tile.item.kind, tile.item.memberSlug, tile.item.platform, tile.item.youtubeId, trackTick]);

  useEffect(() => {
    if (!isTilePlaying || !passportCredit || !inViewport) return;
    const beginObservation = () => {
      if (document.visibilityState !== "visible") { checkpointTile(); return; }
      measurementStartedAtRef.current = performance.now();
      trackTick(tile.item.key, tile.item.kind, tile.item.memberSlug, 0, undefined,
        positionRef.current, durationRef.current, tile.item.platform, tile.item.youtubeId || videoRef.current ? player.playbackRate : 1);
    };
    beginObservation();
    document.addEventListener("visibilitychange", beginObservation);
    return () => document.removeEventListener("visibilitychange", beginObservation);
  }, [checkpointTile, inViewport, isTilePlaying, passportCredit, player.playbackRate, tile.item.key, tile.item.kind, tile.item.memberSlug, tile.item.platform, tile.item.youtubeId, trackTick]);

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
      if (tile.item.youtubeId) {
        if (value.event === "onReady" || value.event === "onApiChange") {
          for (const command of youtubeCaptionCommands(player.captionsEnabled, { moduleReady: value.event === "onApiChange" })) {
            iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", ...command }), "*");
          }
        }
        const detail = youtubePlaybackSample(value);
        if (detail) {
          if (typeof detail.currentTime === "number" && Number.isFinite(detail.currentTime)) {
            timedEmbedRef.current = true;
            positionRef.current = Math.max(0, detail.currentTime);
            presenceClockRef.current = { contentId: tile.item.key, seconds: detail.currentTime, observedAt: Date.now() };
          }
          if (typeof detail.duration === "number" && Number.isFinite(detail.duration) && detail.duration >= 0) {
            durationRef.current = detail.duration;
          }
          setTileProgress({ position: positionRef.current, duration: durationRef.current });
          if (detail.playerState === 1) {
            playingRef.current = true;
            setIsTilePlaying(true);
          }
          if (detail.playerState === 2 || detail.playerState === 3 || detail.playerState === -1 || detail.playerState === 5) {
            if (playingRef.current) checkpointTile();
            playingRef.current = false;
            setIsTilePlaying(false);
          }
          if (detail.playerState === 0) finishPlayback();
        }
      }
      if (value["x-tiktok-player"] === true) {
        timedEmbedRef.current = true;
        if (value.type === "onCurrentTime" && value.value && typeof value.value === "object") {
          const detail = value.value as Record<string, unknown>;
          if (typeof detail.currentTime === "number") {
            positionRef.current = detail.currentTime;
            presenceClockRef.current = { contentId: tile.item.key, seconds: detail.currentTime, observedAt: Date.now() };
          }
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
  }, [checkpointTile, finishPlayback, player.captionsEnabled, tile.item.key, tile.item.youtubeId]);

  const src = embedFor(tile.item, {
    parent,
    origin,
    // Every multiview source enters through the muted autoplay path. This is
    // required for Twitch/YouTube to start without a provider Play click;
    // room audio can still be enabled intentionally from the CORE controls.
    autoplay: true,
    muted: true,
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
    ? tile.item.mediaUrl || tile.item.poster || null
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
  const instagramUrl = useInstagramPlayback(tile.item.platform === "instagram" ? tile.item.sourceUrl ?? tile.item.url ?? tile.item.embedUrl : null,
    !standby && inViewport && tile.item.format !== "photo" && !tile.item.mediaUrl);
  const nativeCandidate = preferredNative ?? tile.item.mediaUrl ?? nativeVideoSource(tile.item, tile.item.clipSrc) ?? instagramUrl;
  const native = tile.item.format !== "photo" && playableNativeUrl(nativeCandidate)
    && failedNativeSource !== `${tile.item.key}:${nativeCandidate}`
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
  const mediaFrameStyle: React.CSSProperties = tile.item.platform === "twitch"
    // Keep room actions above Twitch instead of covering its visibility
    // sample points. The remaining native surface must stay 400 × 300.
    ? { width: "100%", height: "calc(100% - 64px)", top: 64 }
    : shape === "portrait"
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

  useEffect(() => {
    const source = iframeRef.current?.contentWindow;
    if (!source || standby) return;
    if (tile.item.youtubeId) {
      for (const command of [
        { func: tile.muted ? "mute" : "unMute", args: [] },
        { func: "setVolume", args: [Math.round(tile.volume * 100)] },
        { func: "setPlaybackRate", args: [player.playbackRate] },
        ...youtubeCaptionCommands(player.captionsEnabled),
      ]) source.postMessage(JSON.stringify({ event: "command", ...command }), "*");
    } else if (tile.item.platform === "tiktok") {
      source.postMessage({ "x-tiktok-player": true, type: tile.muted ? "mute" : "unMute" }, "*");
    }
  }, [frameReadyToken, player.captionsEnabled, player.playbackRate, standby, tile.item.platform, tile.item.youtubeId, tile.muted, tile.volume]);

  useEffect(() => {
    if (standby || !tile.item.youtubeId) return;
    const notify = () => {
      const source = iframeRef.current?.contentWindow;
      if (source) listenToYouTube(source, `core-room-${tile.id}`);
    };
    notify();
    const retries = [200, 600, 1_500, 3_000, 6_000, 10_000].map((delay) => window.setTimeout(notify, delay));
    return () => retries.forEach(window.clearTimeout);
  }, [frameReadyToken, standby, tile.id, tile.item.youtubeId]);

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
        listenToYouTube(source, `core-room-${tile.id}`);
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
  }, [frameReadyToken, inViewport, src, standby, tile.id, tile.item.platform, tile.item.youtubeId, tile.muted]);

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
        width: mobile ? (shape === "portrait" ? "min(100%, 19rem)" : "100%") : style?.width,
        height: mobile ? "auto" : style?.height,
        maxWidth: mobile ? "100%" : style?.maxWidth,
        // Mobile tiles contain absolutely positioned media. Without their own
        // aspect ratio the wrapper collapses to zero height while audio plays.
        aspectRatio: mobile ? (shape === "portrait" ? "9 / 16" : shape === "square" ? "1 / 1" : "16 / 9")
          : theater ? undefined : theaterAspect ?? (shape === "portrait" ? "9 / 16" : "16 / 9"),
        alignSelf: theater ? "stretch" : "start",
        // Compact companions never meet Twitch's minimum, so they keep a 16:9
        // preview card instead of reserving a full Twitch frame height.
        minHeight: mobile && tile.item.platform === "twitch" ? (compact ? undefined : 364) : undefined,
      }}
      {...tileSwapTarget(tile.id)}
      onClick={() => player.focusTile(tile.id)}
      onDoubleClick={() => player.focusTile(tile.id, { takeAudio: false })}
      className={`group relative overflow-hidden bg-black text-room-ink shadow-xl ring-1 transition duration-150 ${tile.item.platform === "twitch" ? "is-twitch" : ""} ${mobile ? "rounded-none" : theater ? "rounded-2xl" : "rounded-xl"} ${mobile || theater ? "min-h-0" : "min-h-[10rem]"} ${focused ? "ring-room-ink/40 shadow-[0_24px_72px_rgba(0,0,0,.5)]" : "ring-room-ink/10 hover:ring-room-ink/30 focus-within:ring-room-ink/30"}`}
      data-room-player
      data-focused={focused}
      aria-label={`${tile.item.title} player`}
    >
      {compact && (tooSmallForTwitch || standby) ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (tile.standby) player.updateTile(tile.id, { standby: false });
            player.focusTile(tile.id);
          }}
          className="absolute inset-0 grid w-full cursor-pointer place-items-center overflow-hidden text-center outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-[-3px] active:scale-[.99]"
          aria-label={`Watch ${tile.item.memberLabel} in the main view`}
        >
          {tile.item.poster ? <img src={tile.item.poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" /> : null}
          <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/20" />
          <span className="relative grid size-9 place-items-center rounded-full bg-room-ink/90 text-room-inverse shadow-xs-skeuomorphic"><Play className="size-3.5 translate-x-px fill-current" aria-hidden /></span>
          <span className="absolute inset-x-0 bottom-0 px-2 pb-1.5 text-left">
            <span className="flex items-center gap-1 truncate text-[11px] font-semibold text-white">{tile.item.kind === "live" ? <span className="size-1.5 shrink-0 rounded-full bg-red-500" /> : null}<span className="truncate">{tile.item.memberLabel}</span></span>
            <span className="block truncate text-[9px] text-white/70">{tooSmallForTwitch ? "Twitch · tap to watch" : player.dataSaver ? "Paused by Data saver" : "Paused · tap to watch"}</span>
          </span>
        </button>
      ) : tooSmallForTwitch ? (
        <div data-room-surface className="absolute inset-0 grid place-items-center bg-room-panel text-room-ink p-5 text-center">
          <div className="max-w-sm">
            <p className="text-sm font-semibold">Give Twitch more room</p>
            <p className="mt-2 text-xs leading-5 text-room-muted">{mobile ? "Turn your phone sideways, or open this stream on Twitch." : "Expand this tile to use the Twitch player."} Twitch requires at least 400 × 300 pixels.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {!mobile ? <button type="button" onClick={() => player.setMaximizedTileId(tile.id)} className="min-h-11 rounded-lg bg-room-ink px-4 text-xs font-semibold text-room-inverse">Expand player</button> : null}
              <a href={twitchSourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-room-ink/25 px-4 text-xs font-semibold">Open on Twitch</a>
            </div>
          </div>
        </div>
      ) : standby ? (
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
            <span className="mx-auto grid size-11 place-items-center rounded-full bg-room-ink text-room-inverse shadow-xs-skeuomorphic ring-1 ring-inset ring-room-ink/80 transition duration-100 ease-linear group-hover/activate:-translate-y-0.5 group-hover/activate:scale-105 group-focus-visible/activate:-translate-y-0.5"><Plus className="size-4" /></span>
            <span className="mt-3 block text-sm font-semibold transition group-hover/activate:text-room-ink">Activate player</span>
            <span className="mt-1 block text-[11px] text-room-muted">
              {tooSmallForTwitch ? "This Twitch tile needs a little more room." : player.dataSaver ? "Paused by Data Saver" : "Held in standby to protect performance"}
            </span>
          </span>
        </button>
      ) : photo ? (
        <div className="absolute inset-0 isolate overflow-hidden bg-room-canvas">
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
          onError={() => {
            playingRef.current = false;
            setIsTilePlaying(false);
            setFailedNativeSource(`${tile.item.key}:${nativeCandidate}`);
          }}
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
      ) : tile.item.platform === "twitch" && (tile.item.twitchLogin || tile.item.vodId) ? (
        <div style={mediaFrameStyle} className="absolute inset-0" data-cursor-native>
          <TwitchTileMedia
            statusContainer={statusContainer}
            channel={tile.item.kind === "live" ? tile.item.twitchLogin : null}
            video={tile.item.vodId}
            muted={tile.muted}
            volume={tile.volume}
            startSeconds={tile.delaySeconds}
            onPlaying={() => {
              timedEmbedRef.current = true;
              playingRef.current = true;
              setIsTilePlaying(true);
            }}
            onPaused={() => {
              playingRef.current = false;
              setIsTilePlaying(false);
              checkpointTile();
            }}
            onProgress={(position, duration) => {
              presenceClockRef.current = { contentId: tile.item.key, seconds: position, observedAt: Date.now() };
              if (Number.isFinite(position)) positionRef.current = position;
              if (Number.isFinite(duration) && duration > 0) durationRef.current = duration;
              setTileProgress({ position: positionRef.current, duration: durationRef.current });
            }}
            onEnded={finishPlayback}
          />
      {focused && !standby && !photo && !tooSmallForTwitch && tile.item.platform === "twitch" ? (
        <CreatorTags placement="rail" panelContainer={creatorContainer} key={`creators:${tile.item.key}:${tile.item.publishedAt ?? ""}`} assetKey={`${tile.item.platform}:${tile.item.key}`} title={tile.item.title}
          liveStartedAt={tile.item.kind === "live" ? tile.item.publishedAt : undefined}
          sourceRatio={contentShape(tile.item) === "portrait" ? 9 / 16 : contentShape(tile.item) === "square" ? 1 : 16 / 9}
          getTime={() => creatorTimelineSeconds({ platform: tile.item.platform, kind: tile.item.kind, seconds: positionRef.current })} mediaRef={videoRef} fit={tile.fit} compact />
      ) : null}
        </div>
      ) : src ? (
        <div style={mediaFrameStyle} className={tile.item.platform === "twitch" ? "absolute inset-0 bg-black" : "absolute left-1/2 top-1/2 overflow-hidden bg-black -translate-x-1/2 -translate-y-1/2"}>
          <iframe
          ref={iframeRef}
          title={tile.item.title}
          src={src}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="origin"
          onLoad={() => {
            setFrameReadyToken((value) => value + 1);
            const source = iframeRef.current?.contentWindow;
            if (tile.item.youtubeId && source) {
              listenToYouTube(source, `core-room-${tile.id}`);
            }
          }}
          className={`pointer-events-auto absolute inset-0 z-10 h-full w-full ${tile.fit === "cover" && tile.item.platform !== "twitch" ? "scale-[1.02]" : ""}`}
        />
          {focused && tile.item.platform === "twitch" ? (
            <CreatorTags placement="rail" panelContainer={creatorContainer} key={`creators:${tile.item.key}:${tile.item.publishedAt ?? ""}`} assetKey={`${tile.item.platform}:${tile.item.key}`} title={tile.item.title}
              sourceRatio={contentShape(tile.item) === "portrait" ? 9 / 16 : 16 / 9}
              getTime={() => creatorTimelineSeconds({ platform: tile.item.platform, kind: tile.item.kind, seconds: positionRef.current })} mediaRef={videoRef} fit={tile.fit} compact />
          ) : null}
        </div>
      ) : (
        <div data-room-surface className="absolute inset-0 grid place-items-center bg-room-panel p-6 text-center text-room-ink">
          <div>
            <p className="text-sm font-semibold">This source opens on {tile.item.platform}.</p>
            {tile.item.url ? <a href={tile.item.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-room-ink px-4 text-xs font-semibold text-room-inverse shadow-xs-skeuomorphic ring-1 ring-inset ring-room-ink/80 outline-focus-ring transition duration-100 ease-linear hover:bg-room-ink/90 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.98]">Open source <ExternalLink className="size-3.5" /></a> : null}
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

      {focused && !standby && !photo && !tooSmallForTwitch && (tile.item.platform === "youtube" || tile.item.platform === "house") ? (
        <CreatorTags key={`creators:${tile.item.key}:${tile.item.publishedAt ?? ""}`} assetKey={`${tile.item.platform}:${tile.item.key}`} title={tile.item.title}
          liveStartedAt={tile.item.kind === "live" ? tile.item.publishedAt : undefined}
          sourceRatio={contentShape(tile.item) === "portrait" ? 9 / 16 : contentShape(tile.item) === "square" ? 1 : 16 / 9}
          getTime={() => creatorTimelineSeconds({ platform: tile.item.platform, kind: tile.item.kind, seconds: positionRef.current })} mediaRef={videoRef} fit={tile.fit} compact />
      ) : null}
      {!standby && !compact && tile.item.kind !== "live" && tile.item.format !== "photo" && !(native && tile.item.platform === "house") ? (
        <OnScreenIdentityOverlay
          contentId={tile.item.key}
          mode="vod"
          variant="compact"
          getMediaTimeMs={readPresenceTimeMs}
          className="pointer-events-auto absolute inset-x-0 bottom-12 z-20"
        />
      ) : null}

      {focused && tile.item.platform !== "twitch" ? <PlayerNetworkWatermark channel={player.channel} compact /> : null}

      {!standby ? (
        <span
          className="pointer-events-none absolute left-2 top-2 z-10 grid size-7 place-items-center rounded-full bg-room-glass/65 text-room-secondary ring-1 ring-room-ink/12 backdrop-blur-sm"
          aria-label={tile.muted ? "Audio muted" : "Audio on"}
        >
          {tile.muted ? <VolumeX className="size-3.5" aria-hidden /> : <Volume2 className="size-3.5" aria-hidden />}
        </span>
      ) : null}

      {compact && !standby && !tooSmallForTwitch ? (
        <button
          type="button"
          onPointerDown={(event) => swap.begin(event, tile.id, swapMeta, { hold: true })}
          onContextMenu={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            player.focusTile(tile.id);
          }}
          className="absolute inset-0 z-20 flex cursor-pointer touch-manipulation select-none items-end bg-gradient-to-t from-black/80 via-transparent to-transparent p-2 text-left outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-[-3px]"
          aria-label={`Watch ${tile.item.memberLabel} in the main view`}
        >
          <span className="min-w-0">
            <span className="flex items-center gap-1 truncate text-[11px] font-semibold text-white">{tile.item.kind === "live" ? <span className="size-1.5 shrink-0 rounded-full bg-red-500" /> : null}<span className="truncate">{tile.item.memberLabel}</span></span>
            <span className="block truncate text-[9px] text-white/70">{tile.muted ? "Muted" : "Sound on"} · tap to watch · hold to move</span>
          </span>
        </button>
      ) : null}

      {!compact ? <div data-room-surface={tile.item.platform === "twitch" || undefined} className={`multiview-room__tile-toolbar text-room-ink pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 p-2.5 ${tile.item.platform === "twitch" ? "h-16 bg-room-panel" : "bg-gradient-to-b from-black/85 via-black/30 to-transparent opacity-100 transition duration-150 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"}`}>
        <IconControlTooltip title="Move player" description="Drag onto another player to swap places. Arrow keys work too." placement="bottom">
          <button
            type="button"
            onPointerDown={(event) => swap.begin(event, tile.id, swapMeta)}
            onKeyDown={(event) => swap.keyboard(event, tile.id, swapMeta.title)}
            onClick={(event) => event.stopPropagation()}
            className="pointer-events-auto grid size-11 shrink-0 cursor-grab touch-none select-none place-items-center rounded-xl bg-room-glass/55 text-room-secondary shadow-xs-skeuomorphic ring-1 ring-inset ring-room-ink/15 outline-focus-ring backdrop-blur-md transition duration-150 ease-out hover:-translate-y-px hover:bg-room-glass/80 hover:text-room-ink hover:ring-room-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-0 active:scale-[.94] active:cursor-grabbing md:size-9 md:rounded-lg"
            aria-label={`Move ${tile.item.title}. Drag onto another player, or use arrow keys to swap.`}
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
            className="pointer-events-auto min-h-11 min-w-0 flex-1 cursor-pointer rounded-lg px-1.5 py-0.5 text-left outline-focus-ring transition duration-100 ease-linear hover:-translate-y-px hover:bg-room-ink/8 focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-0 active:scale-[.995] md:min-h-0"
            aria-label={`Make ${tile.item.title} the main player`}
          >
            <p className="truncate text-xs font-semibold text-room-ink">{readableTitle(tile.item.title)}</p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] text-room-muted">
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
          {!mobile ? (
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
          ) : null}
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
      </div> : null}

      {moreOpen ? (
        <PlayerActions outsideVideo={tile.item.platform === "twitch"}>
        <div
          ref={moreMenuRef}
          id={`tile-more-${tile.id}`}
          role="group"
          aria-label={`${tile.item.title} controls`}
          className={tile.item.platform === "twitch" ? "relative w-full max-w-sm rounded-xl border border-room-ink/15 bg-room-raised p-2 text-xs" : "absolute right-2 top-14 z-40 max-h-[calc(100%-4rem)] w-56 overflow-y-auto overscroll-contain rounded-xl border border-room-ink/15 bg-room-raised/97 p-1.5 text-xs shadow-2xl backdrop-blur-xl [scrollbar-width:thin] md:top-12 md:max-h-[calc(100%-3.5rem)]"}
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
          {!mobile ? <><div className="my-1 h-px bg-room-ink/8" />
          <div className="grid grid-cols-2 gap-1 p-1">
            <ResizeButton label="Narrower" disabled={tile.colSpan <= 1} onClick={() => player.updateTile(tile.id, { colSpan: Math.max(1, tile.colSpan - 1) })} />
            <ResizeButton label="Wider" disabled={tile.colSpan >= player.gridColumns - tile.col + 1} onClick={() => player.updateTile(tile.id, { colSpan: Math.min(player.gridColumns - tile.col + 1, tile.colSpan + 1) })} />
            <ResizeButton label="Shorter" disabled={tile.rowSpan <= 1} onClick={() => player.updateTile(tile.id, { rowSpan: Math.max(1, tile.rowSpan - 1) })} />
            <ResizeButton label="Taller" disabled={tile.rowSpan >= 6} onClick={() => player.updateTile(tile.id, { rowSpan: Math.min(6, tile.rowSpan + 1) })} />
          </div></> : null}
          <div className="my-1 h-px bg-room-ink/8" />
          <MenuButton icon={Check} label="More like this" active={feedback === "like"} onClick={() => updateFeedback("like")} />
          <MenuButton icon={X} label="Less like this" active={feedback === "dislike"} onClick={() => updateFeedback("dislike")} />
          <MenuButton icon={Trash2} label="Not interested" active={feedback === "not_interested"} onClick={() => updateFeedback("not_interested")} />
        </div>
        </PlayerActions>
      ) : null}

      {!standby && !compact && tile.item.platform !== "twitch" ? (
        <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/45 to-transparent opacity-100 transition duration-150 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 ${mobile ? "px-2 pb-1 pt-6" : "px-2.5 pb-2.5 pt-10"}`}>
          <div className={`pointer-events-auto flex items-center gap-2 px-0.5 ${mobile ? "" : "mb-2"}`}>
            {mobile && (native || tile.item.youtubeId || tile.item.platform === "tiktok") ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  const media = videoRef.current;
                  if (media) {
                    if (media.paused) void media.play(); else media.pause();
                  } else if (tile.item.youtubeId) {
                    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: isTilePlaying ? "pauseVideo" : "playVideo", args: [] }), "*");
                  } else if (tile.item.platform === "tiktok") {
                    iframeRef.current?.contentWindow?.postMessage({ "x-tiktok-player": true, type: isTilePlaying ? "pause" : "play" }, "*");
                  }
                }}
                aria-label={isTilePlaying ? "Pause player" : "Play player"}
                className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full text-white outline-focus-ring focus-visible:outline-2"
              >
                {isTilePlaying ? <Pause className="size-4 fill-current" aria-hidden /> : <Play className="size-4 fill-current" aria-hidden />}
              </button>
            ) : null}
            <span className="w-9 shrink-0 text-right text-[9px] tabular-nums text-room-secondary">{formatPlaybackTime(tileProgress.position)}</span>
            <input
              type="range"
              min="0"
              max={tile.item.kind === "live" ? 1 : Math.max(1, tileProgress.duration || durationRef.current || 1)}
              step="0.1"
              value={tile.item.kind === "live" ? 1 : Math.min(tileProgress.position, Math.max(1, tileProgress.duration || durationRef.current || 1))}
              disabled={(!native && !tile.item.youtubeId && tile.item.platform !== "tiktok") || tile.item.kind === "live" || !(tileProgress.duration || durationRef.current)}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                const media = videoRef.current;
                const position = Number(event.target.value);
                if (!Number.isFinite(position)) return;
                checkpointTile();
                if (media) media.currentTime = position;
                else if (tile.item.youtubeId) iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "seekTo", args: [position, true] }), "*");
                else if (tile.item.platform === "tiktok") iframeRef.current?.contentWindow?.postMessage({ "x-tiktok-player": true, type: "seekTo", value: position }, "*");
                positionRef.current = position;
                setTileProgress((current) => ({ ...current, position }));
                if (passportCredit && playingRef.current) {
                  measurementStartedAtRef.current = performance.now();
                  trackTick(tile.item.key, tile.item.kind, tile.item.memberSlug, 0, undefined, position, durationRef.current, tile.item.platform, tile.item.youtubeId || media ? player.playbackRate : 1);
                }
              }}
              className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-room-ink/20 accent-[#ff3850] disabled:cursor-default disabled:opacity-55"
              aria-label={native || tile.item.youtubeId || tile.item.platform === "tiktok" ? "Seek within this player" : "Provider playback progress"}
            />
            {tile.item.kind === "live" ? (
              <span className="inline-flex w-9 items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] text-red-400"><span className="size-1.5 rounded-full bg-red-500" />Live</span>
            ) : (
              <span className="w-9 text-[9px] tabular-nums text-room-secondary">{formatPlaybackTime(tileProgress.duration || durationRef.current)}</span>
            )}
          </div>
          {!mobile ? <div className="flex items-end justify-between gap-2">
          <div className="pointer-events-auto flex items-center gap-1.5">
            {native || tile.item.youtubeId || tile.item.platform === "tiktok" ? (
              <TileButton
                label={isTilePlaying ? "Pause player" : "Play player"}
                description="Play or pause this source."
                icon={isTilePlaying ? Pause : Play}
                onClick={() => {
                  const media = videoRef.current;
                  if (media) {
                    if (media.paused) void media.play(); else media.pause();
                  } else if (tile.item.youtubeId) {
                    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: isTilePlaying ? "pauseVideo" : "playVideo", args: [] }), "*");
                  } else if (tile.item.platform === "tiktok") {
                    iframeRef.current?.contentWindow?.postMessage({ "x-tiktok-player": true, type: isTilePlaying ? "pause" : "play" }, "*");
                  }
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
          <span className="pointer-events-none rounded-full bg-room-glass/55 px-2 py-1 text-[9px] font-medium text-room-muted ring-1 ring-room-ink/10">CORE controls</span>
          </div> : null}
        </div>
      ) : null}

      {shape === "portrait" && !compact ? <span className="pointer-events-none absolute bottom-2 right-2 z-20 rounded-full bg-room-glass/60 px-2 py-1 text-[9px] text-room-muted">9:16</span> : null}
    </article>
  );
}, (previous, next) => (
  previous.tile === next.tile
  && previous.active === next.active
  && previous.focused === next.focused
  && previous.passportCredit === next.passportCredit
  && previous.maximized === next.maximized
  && previous.mobile === next.mobile
  && previous.compact === next.compact
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
    <IconControlTooltip title={label} description={description} placement="top">
      <button
        ref={buttonRef}
        type="button"
        onClick={(event) => { event.stopPropagation(); onClick(); }}
        className={`grid size-11 cursor-pointer place-items-center rounded-lg shadow-xs-skeuomorphic ring-1 ring-inset outline-focus-ring transition duration-100 ease-linear hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-0 active:scale-[.97] md:size-9 ${active ? "bg-room-ink text-room-inverse ring-room-ink/90 hover:bg-room-ink/90" : "bg-room-glass/65 text-room-secondary ring-room-ink/15 hover:bg-room-glass/85 hover:text-room-ink hover:ring-room-ink/30"}`}
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
    <button type="button" disabled={disabled} aria-pressed={active} onClick={onClick} className={`flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-left text-[11px] outline-focus-ring transition duration-100 ease-linear hover:bg-room-ink/8 hover:text-room-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-35 disabled:active:scale-100 md:min-h-9 ${active ? "bg-room-ink/10 text-room-ink ring-1 ring-inset ring-room-ink/12" : "text-room-secondary"}`}>
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
      className="min-h-11 cursor-pointer rounded-lg bg-room-ink/5 px-2 text-[10px] text-room-secondary shadow-xs-skeuomorphic ring-1 ring-inset ring-room-ink/8 outline-focus-ring transition duration-100 ease-linear hover:bg-room-ink/10 hover:text-room-ink hover:ring-room-ink/18 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100 md:min-h-9"
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
        <p className="text-xs font-semibold text-room-ink">Room setup</p>
        <p className="mt-1 text-[10px] leading-4 text-room-faint">Start with a room style, then tune only what you need.</p>
      </div>

      <section className="mb-3" aria-label="Room presets">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-room-faint">Start with a style</p>
          <span className="text-[9px] text-room-faint">You can change every detail later</span>
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
                className={`group min-h-[7rem] cursor-pointer rounded-xl p-2.5 text-left shadow-xs-skeuomorphic ring-1 ring-inset outline-focus-ring transition duration-100 ease-linear hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-0 active:scale-[.99] ${selected ? "bg-room-ink text-room-inverse ring-room-ink/90" : "bg-room-ink/[0.035] text-room-secondary ring-room-ink/10 hover:bg-room-ink/[0.08] hover:text-room-ink hover:ring-room-ink/20"}`}
              >
                <span className={`grid h-7 w-11 grid-flow-row-dense gap-1 ${recipe.blocks}`} aria-hidden>
                  {Array.from({ length: 6 }).map((_, index) => <span key={index} className={`rounded-[3px] ${selected ? "bg-room-glass/70" : "bg-room-ink/45 group-hover:bg-room-ink/70"}`} />)}
                </span>
                <span className="mt-2 block text-[11px] font-semibold">{recipe.label}</span>
                <span className={`mt-0.5 block text-[9px] leading-3 ${selected ? "text-room-inverse/60" : "text-room-faint"}`}>{recipe.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2 border-b border-room-ink/8 pb-3">
        <ToolbarButton label="Add player" icon={Plus} onClick={onAdd} primary />
        {liveCount > 0 ? (
          <ToolbarButton label="Watch live channels" icon={Radio} onClick={onFill} />
        ) : (
          <ToolbarButton label="No one live" icon={Radio} onClick={() => undefined} disabled />
        )}
        <ToolbarButton label="Share room" icon={Share2} onClick={onShare} />
      </div>

      <div className="mt-3 grid grid-cols-2 rounded-xl bg-room-ink/[0.035] p-1 ring-1 ring-inset ring-room-ink/8" role="group" aria-label="Room settings detail">
        <button type="button" onClick={() => setAdvancedOpen(false)} aria-pressed={!advancedOpen} className={`min-h-10 rounded-lg px-3 text-[10px] font-semibold transition ${!advancedOpen ? "bg-room-ink text-room-inverse" : "text-room-muted hover:text-room-ink"}`}>Room</button>
        <button type="button" onClick={() => setAdvancedOpen(true)} aria-pressed={advancedOpen} className={`min-h-10 rounded-lg px-3 text-[10px] font-semibold transition ${advancedOpen ? "bg-room-ink text-room-inverse" : "text-room-muted hover:text-room-ink"}`}>Advanced</button>
      </div>

      <div className="mt-3 space-y-2">
        <SettingGroup id="layout" title="Layout" description="Preset and grid size" open={openSection === "layout"} onToggle={() => toggleSection("layout")}>
          <div className="grid grid-cols-2 gap-2">
            {WORKSPACE_PRESETS.filter((entry) => entry.id !== "freeform").map((entry) => {
              const selected = player.layoutPreset === entry.id;
              return <button key={entry.id} type="button" onClick={() => player.applyPreset(entry.id)} aria-pressed={selected} className={`min-h-12 cursor-pointer rounded-xl px-3 text-left shadow-xs-skeuomorphic ring-1 ring-inset outline-focus-ring transition duration-100 ease-linear hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-0 active:scale-[.99] ${selected ? "bg-room-ink text-room-inverse ring-room-ink/90" : "bg-room-ink/[0.035] text-room-secondary ring-room-ink/8 hover:bg-room-ink/[0.08] hover:text-room-ink hover:ring-room-ink/18"}`}><span className="block text-[10px] font-semibold">{entry.label}</span><span className={`mt-0.5 block text-[8px] ${selected ? "text-room-inverse/58" : "text-room-faint"}`}>{entry.description}</span></button>;
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
          <div className="rounded-xl bg-gradient-to-br from-white/[0.08] to-white/[0.025] p-3 ring-1 ring-inset ring-room-ink/10"><p className="text-[11px] font-semibold text-room-secondary">Smart audio focus</p><p className="mt-1 text-[9px] leading-4 text-room-muted">The focused tile is the primary audio source. When mixing is enabled, other tiles stay lower so speech remains understandable; each tile can still be muted or made primary from its hover controls.</p></div>
          <SettingToggle label="Mix audio" description="Allow more than one audible tile at a safe level" value={player.mixAudio} onChange={player.setMixAudio} />
          <button type="button" onClick={player.muteAll} className="min-h-11 cursor-pointer rounded-xl bg-room-ink/5 px-3 text-left text-xs text-room-secondary shadow-xs-skeuomorphic ring-1 ring-inset ring-room-ink/10 outline-focus-ring transition duration-100 ease-linear hover:bg-room-ink/10 hover:text-room-ink focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.99]">Mute every tile</button>
          {player.tiles.length ? (
            <div className="rounded-xl bg-room-ink/[0.035] p-2 ring-1 ring-inset ring-room-ink/8">
              <div className="mb-1 flex items-center justify-between px-1"><p className="text-[10px] font-semibold text-room-secondary">Audio mixer</p><span className="text-[9px] text-room-faint">Choose one lead or fine-tune a mix</span></div>
              <div className="space-y-1">
                {player.tiles.slice(0, 8).map((tile) => {
                  const lead = focused?.id === tile.id && !tile.muted;
                  return <div key={tile.id} className={`flex min-h-11 items-center gap-2 rounded-lg px-2 ${lead ? "bg-room-ink/10" : ""}`}><button type="button" onClick={() => player.focusTile(tile.id, { takeAudio: true })} className={`grid size-7 shrink-0 place-items-center rounded-md outline-focus-ring transition focus-visible:outline-2 focus-visible:outline-offset-2 ${lead ? "bg-room-ink text-room-inverse" : "bg-room-ink/8 text-room-muted hover:bg-room-ink/14 hover:text-room-ink"}`} aria-label={`Make ${tile.item.memberLabel} the audio lead`}><Volume2 className="size-3.5" aria-hidden /></button><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold text-room-secondary">{tile.item.memberLabel}</span><span className="block text-[8px] text-room-faint">{tile.muted ? "Muted" : lead ? "Audio lead" : `${Math.round(tile.volume * 100)}%`} · {tile.delaySeconds ? `${tile.delaySeconds}s offset` : "Live edge"}</span></span><input type="range" min="0" max="1" step="0.05" value={tile.muted ? 0 : tile.volume} onChange={(event) => player.updateTile(tile.id, { volume: Number(event.target.value), muted: Number(event.target.value) === 0 })} className="h-8 w-16 cursor-pointer accent-room-ink" aria-label={`${tile.item.memberLabel} volume`} /></div>;
                })}
              </div>
            </div>
          ) : null}
          {focused ? (
            <label className="grid gap-1 text-[10px] text-room-muted">
              Sync delay
              <div className="flex items-center rounded-xl bg-room-ink/5 ring-1 ring-room-ink/10">
                <input type="number" min={0} max={7200} step={5} value={focused.delaySeconds} onChange={(event) => player.updateTile(focused.id, { delaySeconds: Number(event.target.value) })} className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-xs text-room-ink outline-none" />
                <span className="pr-3 text-[10px] text-room-faint">sec</span>
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
              return <button key={option.id} type="button" onClick={() => player.setChatDock(option.id)} aria-pressed={selected} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 text-left shadow-xs-skeuomorphic ring-1 ring-inset outline-focus-ring transition duration-100 ease-linear hover:bg-room-ink/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.99] ${selected ? "bg-room-ink text-room-inverse ring-room-ink/90" : "bg-room-ink/[0.035] text-room-secondary ring-room-ink/8"}`}><MessageSquare className="size-3.5 shrink-0" aria-hidden /><span className="min-w-0"><span className="block text-[10px] font-semibold">{option.label}</span><span className={`mt-0.5 block text-[9px] ${selected ? "text-room-inverse/58" : "text-room-faint"}`}>{option.description}</span></span></button>;
            })}
          </div>
          <p className="rounded-xl bg-white/[0.035] px-3 py-2 text-[9px] leading-4 text-white/38">Twitch chat follows the main stage, including changes from your phone. Use Chat settings for channels, text size, and filters.</p>
        </SettingGroup>

        {advancedOpen ? <SettingGroup id="advanced" title="Advanced controls" description="Keyboard shortcuts and precise playback" open={openSection === "advanced"} onToggle={() => toggleSection("advanced")}>
          <div className="rounded-xl bg-room-ink/[0.035] p-3 text-[10px] leading-5 text-room-muted"><p className="font-semibold text-room-secondary">Quick controls</p><p className="mt-1">Press <kbd className="rounded bg-room-ink/10 px-1.5 py-0.5 text-room-secondary">1–9</kbd> to focus a tile, <kbd className="rounded bg-room-ink/10 px-1.5 py-0.5 text-room-secondary">F</kbd> to maximize it, <kbd className="rounded bg-room-ink/10 px-1.5 py-0.5 text-room-secondary">M</kbd> to toggle its audio, and <kbd className="rounded bg-room-ink/10 px-1.5 py-0.5 text-room-secondary">Esc</kbd> to restore the grid.</p></div>
          <SettingToggle label="Preview autoplay" description="Let hover previews begin when available" value={player.previewAutoplay} onChange={player.setPreviewAutoplay} />
          <SettingToggle label="Preview sound" description="Start supported hover previews with sound" value={player.previewSoundEnabled} onChange={player.setPreviewSoundEnabled} />
          <SettingToggle label="Captions" description="Show captions on supported sources" value={player.captionsEnabled} onChange={player.setCaptionsEnabled} />
          <div className="grid grid-cols-2 gap-2"><button type="button" onClick={resetRoom} className="min-h-11 cursor-pointer rounded-xl px-3 text-[10px] font-semibold text-room-muted ring-1 ring-room-ink/12 transition hover:bg-room-ink/8 hover:text-room-ink">Reset room</button><button type="button" disabled={!resetSnapshot} onClick={() => { if (resetSnapshot) player.importWorkspace(resetSnapshot); setResetSnapshot(null); }} className="min-h-11 cursor-pointer rounded-xl px-3 text-[10px] font-semibold text-room-muted ring-1 ring-room-ink/12 transition hover:bg-room-ink/8 hover:text-room-ink disabled:cursor-not-allowed disabled:opacity-35">Undo reset</button></div>
        </SettingGroup> : null}

        {advancedOpen ? <SettingGroup id="saved" title="Saved layouts" description={canSaveLayouts ? "Save or restore a room" : `${savedLayoutsPlan} · reusable synced rooms`} open={openSection === "saved"} onToggle={() => toggleSection("saved")}>
          {canSaveLayouts ? (
            <div className="flex gap-2">
              <input value={layoutName} onChange={(event) => onLayoutName(event.target.value)} placeholder="Layout name" maxLength={80} className="min-h-11 min-w-0 flex-1 rounded-xl bg-room-ink/5 px-3 text-xs text-room-ink outline-none ring-1 ring-room-ink/10 placeholder:text-room-faint focus:ring-room-ink/25" />
              <IconControlTooltip title="Save layout" description="Save this room under the entered name.">
                <button type="button" onClick={onSave} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl bg-room-ink text-room-inverse shadow-xs-skeuomorphic ring-1 ring-inset ring-room-ink/90 outline-focus-ring transition duration-100 ease-linear hover:bg-room-ink/90 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.97]" aria-label="Save layout"><Save className="size-4" aria-hidden /></button>
              </IconControlTooltip>
            </div>
          ) : (
            <Link
              href={savedLayoutsHref as never}
              className="flex min-h-14 items-center gap-3 rounded-xl bg-gradient-to-br from-white/10 to-white/[0.035] px-3 text-left ring-1 ring-inset ring-room-ink/12 transition hover:bg-room-ink/12 hover:ring-room-ink/22 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-room-ink/70"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-room-ink text-room-inverse"><LockKeyhole className="size-4" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold text-room-ink">Save this room with {savedLayoutsPlan}</span>
                <span className="mt-0.5 block text-[9px] leading-4 text-room-muted">Name reusable layouts and sync them across your devices.</span>
              </span>
            </Link>
          )}
          <div className="max-h-56 space-y-2 overflow-y-auto pr-0.5">
            {player.savedLayouts.map((layout) => (
              <article key={`${layout.name}-${layout.updatedAt}`} className="group flex items-center gap-2 rounded-xl bg-room-ink/[0.035] p-2 ring-1 ring-room-ink/8 transition hover:bg-room-ink/[0.06] hover:ring-room-ink/16">
                <button type="button" onClick={() => player.loadLayout(layout.name)} className="grid h-11 w-14 shrink-0 grid-cols-3 gap-1 rounded-lg bg-room-glass/35 p-1.5 outline-focus-ring transition group-hover:bg-room-glass/50 focus-visible:outline-2 focus-visible:outline-offset-2" aria-label={`Open ${layout.name}`}>
                  {Array.from({ length: Math.min(6, Math.max(1, layout.tiles.length)) }).map((_, index) => <span key={index} className={`rounded-[2px] ${index === 0 ? "bg-room-ink/70" : "bg-room-ink/25"} ${layout.preset === "main-three" && index === 0 ? "col-span-2 row-span-2" : ""}`} />)}
                </button>
                <button type="button" onClick={() => player.loadLayout(layout.name)} className="min-h-11 min-w-0 flex-1 cursor-pointer rounded-lg px-1 text-left outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2"><span className="block truncate text-[11px] font-semibold text-room-secondary">{layout.name}</span><span className="mt-0.5 block text-[9px] text-room-faint">{layout.tiles.length} view{layout.tiles.length === 1 ? "" : "s"} · {WORKSPACE_PRESETS.find((entry) => entry.id === layout.preset)?.label ?? "Custom"}{layout.remote ? " · synced" : ""}</span></button>
                <IconControlTooltip title="Delete layout" description="Remove this saved room from your layouts.">
                  <button type="button" onClick={() => void player.deleteLayout(layout.name)} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg text-room-faint transition hover:bg-room-ink/8 hover:text-room-ink" aria-label={`Delete ${layout.name}`}><Trash2 className="size-3.5" aria-hidden /></button>
                </IconControlTooltip>
              </article>
            ))}
            {player.savedLayouts.length === 0 ? <p className="py-2 text-[11px] text-room-faint">{canSaveLayouts ? "Saved layouts appear here and sync when you sign in." : "Any layouts already on this device remain available."}</p> : null}
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

function MainStagePicker({
  groups,
  mainItemKey,
  mobile,
  onClose,
  onChoose,
}: {
  groups: Array<{
    key: string;
    memberLabel: string;
    sources: Array<{ item: Playable; tileId: string | null }>;
  }>;
  mainItemKey: string | null;
  mobile: boolean;
  onClose: () => void;
  onChoose: (item: Playable) => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef);

  return (
    <div className="fixed inset-0 z-[95] grid place-items-end bg-black/72 p-3 backdrop-blur-sm md:place-items-center md:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} id="main-stage-picker" role="dialog" aria-modal="true" aria-labelledby="main-stage-title" aria-describedby="main-stage-description" tabIndex={-1} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }} className={`flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-3xl border border-room-ink/15 bg-room-panel shadow-[0_32px_120px_rgba(0,0,0,.78)] ${mobile ? "max-w-none" : "max-w-md"}`}>
        <header className="flex shrink-0 items-start justify-between gap-3 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
          <div>
            <span aria-hidden className="mb-3 grid h-8 w-12 grid-cols-[1fr_12px] grid-rows-2 gap-1 rounded-md bg-room-ink/5 p-1 ring-1 ring-inset ring-room-ink/10"><span className="row-span-2 grid place-items-center rounded-sm bg-room-ink text-room-inverse"><Play className="size-3 fill-current" /></span><span className="rounded-sm bg-room-ink/25" /><span className="rounded-sm bg-room-ink/15" /></span>
            <h2 id="main-stage-title" className="text-xl font-semibold tracking-tight text-room-ink">Choose your main stage</h2>
            <p id="main-stage-description" className="mt-1.5 text-xs leading-5 text-room-ink/55">Pick the stream to feature in the main player.</p>
          </div>
          <button type="button" onClick={onClose} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border border-room-ink/10 text-room-ink/60 transition hover:border-room-ink/30 hover:bg-room-ink/10 hover:text-room-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-room-ink" aria-label="Close main stage picker"><X className="size-4" aria-hidden /></button>
        </header>
        <div className="min-h-0 space-y-2.5 overflow-y-auto overscroll-contain px-3 pb-1">
          {groups.map((group) => {
            const selected = group.sources.find(({ item }) => item.key === mainItemKey);
            const preview = selected?.item ?? group.sources[0]?.item;
            return (
              <div key={group.key} className={`overflow-hidden rounded-2xl border p-3 transition ${selected ? "border-room-ink/35 bg-room-ink/[0.08]" : "border-room-ink/10 bg-room-ink/[0.035]"}`}>
                <div className="flex items-center gap-3">
                  <span className="relative block aspect-video w-24 shrink-0 overflow-hidden rounded-xl bg-black ring-1 ring-room-ink/8">{preview?.poster ? <img src={preview.poster} alt="" className="h-full w-full object-cover" /> : null}<span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-room-ink"><span className="size-1 rounded-full bg-room-ink" />Live</span></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-room-ink">{group.memberLabel}</p>
                    <p className="mt-1 truncate text-xs text-room-ink/50">{readableTitle(preview?.title ?? "")}</p>
                  </div>
                </div>
                <div className={`mt-3 grid gap-2 ${group.sources.length > 1 ? "min-[400px]:grid-cols-2" : "grid-cols-1"}`}>
                  {group.sources.map(({ item }) => {
                    const active = item.key === mainItemKey;
                    return (
                      <button key={item.key} type="button" onClick={() => onChoose(item)} aria-pressed={active} aria-label={`Make ${group.memberLabel} on ${platformLabel(item)} the main stage`} className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold ring-1 ring-inset transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-room-ink ${active ? "bg-room-ink text-room-inverse ring-room-ink" : "bg-room-ink/[0.06] text-room-ink/85 ring-room-ink/15 hover:bg-room-ink hover:text-room-inverse hover:ring-room-ink"}`}>
                        {active ? <Check className="size-3.5 shrink-0" aria-hidden /> : <MonitorPlay className="size-3.5 shrink-0" aria-hidden />}
                        <span>{active ? "Main stage" : "Make main"}</span>
                        <span aria-hidden className={`h-3 w-px ${active ? "bg-black/20" : "bg-room-ink/20"}`} />
                        <span className={active ? "text-room-inverse/60" : "text-current opacity-65"}>{platformLabel(item)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {!groups.length ? <p className="p-4 text-center text-xs text-room-ink/45">No live streams are available for the main stage.</p> : null}
        </div>
        <div className="shrink-0 px-3 pb-3 pt-2"><button type="button" onClick={onClose} className="min-h-11 w-full cursor-pointer rounded-xl px-3 text-xs font-medium text-room-ink/55 transition hover:bg-room-ink/5 hover:text-room-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-room-ink">Keep current view</button></div>
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
    <section className="overflow-hidden rounded-2xl bg-room-ink/[0.025] ring-1 ring-inset ring-room-ink/8">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`multiview-setting-${id}`}
        className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-3 text-left outline-focus-ring transition duration-100 ease-linear hover:bg-room-ink/[0.035] focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold text-room-secondary">{title}</span>
          <span className="mt-0.5 block text-[9px] text-room-faint">{description}</span>
        </span>
        <ChevronDown className={`size-4 shrink-0 text-room-faint transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <div id={`multiview-setting-${id}`} hidden={!open} className="space-y-2 border-t border-room-ink/7 p-3">
        {children}
      </div>
    </section>
  );
}

function SettingSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div className="grid gap-1">
      <p className="text-[10px] text-room-muted">{label}</p>
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
  return <label className="grid gap-1 rounded-xl bg-room-ink/[0.035] px-3 py-2 text-[10px] text-room-muted">{label}<input type="range" min={min} max={max} step={step} value={value} onPointerDown={onBegin} onFocus={onBegin} onChange={(event) => onChange(Number(event.target.value))} onPointerUp={onCommit} onBlur={onCommit} className="h-11 cursor-pointer accent-room-ink md:h-8" /></label>;
}

function SettingToggle({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" onClick={() => onChange(!value)} aria-pressed={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-room-ink/[0.035] px-3 text-left shadow-xs-skeuomorphic ring-1 ring-inset ring-room-ink/8 outline-focus-ring transition duration-100 ease-linear hover:bg-room-ink/[0.065] hover:ring-room-ink/15 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.99]"><span className={`relative h-5 w-9 shrink-0 rounded-full transition ${value ? "bg-room-ink" : "bg-room-ink/12"}`}><span className={`absolute top-0.5 size-4 rounded-full transition ${value ? "left-[18px] bg-room-inverse" : "left-0.5 bg-room-ink/55"}`} /></span><span className="min-w-0"><span className="block text-[11px] font-semibold text-room-secondary">{label}</span><span className="block truncate text-[9px] text-room-faint">{description}</span></span></button>;
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
  searching,
  searchFailed,
  onRetrySearch,
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
  searching: boolean;
  searchFailed: boolean;
  onRetrySearch: () => void;
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
      <section role="dialog" aria-modal="true" aria-label={title} className="absolute inset-x-0 bottom-0 flex max-h-[86dvh] flex-col rounded-t-3xl border border-room-ink/12 bg-room-panel shadow-2xl md:inset-y-4 md:left-auto md:right-4 md:max-h-none md:w-[28rem] md:rounded-3xl">
        <header className="flex items-start justify-between gap-4 border-b border-room-ink/8 p-4">
          <div><h2 className="text-base font-semibold">{title}</h2><p className="mt-1 text-sm text-room-secondary">{queue ? "Choose what should play after the focused title." : "Live streams, videos, shorts, and photos in one grid."}</p></div>
          <IconControlTooltip title="Close" description="Return to your multiview room." placement="bottom">
            <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-xl text-room-muted hover:bg-room-ink/8 hover:text-room-ink" aria-label="Close"><X className="size-4" aria-hidden /></button>
          </IconControlTooltip>
        </header>
        <div className="space-y-2 border-b border-room-ink/8 p-3">
          <label className="relative block"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-room-faint" /><input autoFocus value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search titles, members, platforms…" className="min-h-11 w-full rounded-xl bg-room-ink/5 pl-10 pr-3 text-sm outline-none ring-1 ring-room-ink/10 placeholder:text-room-faint focus:ring-room-ink/25" /></label>
          <div className="flex gap-2"><input value={url} onChange={(event) => onUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onAddUrl(); }} aria-label="Paste a YouTube, Twitch, TikTok or Instagram URL" placeholder="Paste a video or post URL" className="min-h-11 min-w-0 flex-1 rounded-xl bg-room-ink/5 px-3 text-xs outline-none ring-1 ring-room-ink/10 placeholder:text-room-faint focus:ring-room-ink/25" /><button type="button" onClick={onAddUrl} className="min-h-11 rounded-xl bg-room-ink px-3 text-xs font-semibold text-room-inverse">Add URL</button></div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {searching ? <p role="status" className="px-2 pb-3 text-xs text-room-muted">Searching the archive…</p> : null}
          {searchFailed ? <p role="status" className="px-2 pb-3 text-xs text-room-secondary">Archive search could not load. <button type="button" className="underline" onClick={onRetrySearch}>Retry</button></p> : null}
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1">
            {sources.map((item) => {
              const open = openKeys.has(item.key);
              return (
                <button key={item.key} type="button" disabled={open && !replace} onClick={() => onChoose(item)} className="group flex min-h-20 w-full min-w-0 items-center gap-3 overflow-hidden rounded-xl bg-room-ink/[0.035] p-2 text-left ring-1 ring-room-ink/8 transition hover:bg-room-ink/8 hover:ring-room-ink/18 disabled:opacity-40">
                  <span className="relative block aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-black"><WatchThumb src={item.poster} youtubeId={item.youtubeId} tiktokSourceUrl={item.platform === "tiktok" ? item.sourceUrl : undefined} instagramSourceUrl={item.platform === "instagram" ? item.sourceUrl : undefined} alt="" className="h-full w-full object-cover" fallback={<span className="grid h-full place-items-center text-center text-xs text-room-muted">Preview unavailable</span>} />{item.kind === "live" ? <span className="absolute left-1.5 top-1.5 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold uppercase">Live</span> : null}</span>
                  <span className="min-w-0 flex-1"><span className="line-clamp-2 text-sm font-semibold leading-5">{readableTitle(item.title)}</span><span className="mt-1 block truncate text-[13px] text-room-secondary">{item.memberLabel} · {item.platform}</span><span className="mt-1 block text-xs text-room-muted">{open ? "Already open" : replace ? "Use in this tile" : queue ? "Add to Up Next" : "Add as a tile"}</span></span>
                </button>
              );
            })}
          </div>
          {sources.length === 0 && !searching && !searchFailed ? <p className="p-8 text-center text-xs text-room-faint">No playable titles match.</p> : null}
        </div>
      </section>
    </div>
  );
}

function ChatDockPlacementNote({ dock }: { dock: "bottom" | "floating" }) {
  const player = usePlayer();
  const label = dock === "bottom" ? "below the grid" : "as a floating panel";
  return (
    <div className="grid h-full min-h-52 place-items-center p-5 text-center">
      <div className="max-w-[15rem]">
        <MessageSquare className="mx-auto size-5 text-room-faint" aria-hidden />
        <p className="mt-3 text-xs font-semibold text-room-secondary">Chat is open {label}</p>
        <p className="mt-1 text-[10px] leading-4 text-room-faint">Move it back here whenever you want chat beside the room controls.</p>
        <button type="button" onClick={() => player.setChatDock("right")} className="mt-4 min-h-10 rounded-xl px-3 text-[10px] font-semibold text-room-secondary ring-1 ring-room-ink/14 transition hover:bg-room-ink/8 hover:text-room-ink">Use side panel</button>
      </div>
    </div>
  );
}
