"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { WatchItem } from "@/lib/watch/types";
import { clampMultiviewItems, effectiveMultiviewFillLimit } from "@/lib/watch/multiview-access";
import { useSubscription } from "@/hooks/useSubscription";
import { catalogPlayables, itemToPlayable, type Playable } from "@/lib/watch/playable";
import {
  DEFAULT_PREVIEW_VOLUME,
  nextPreviewAudioOwner,
  normalizePreviewVolume,
} from "@/lib/watch/preview-audio";
import {
  encodeWorkspace,
  DEFAULT_CHAT_FLOATING_RECT,
  DEFAULT_CHAT_DOCK_SIZE,
  WORKSPACE_SNAPSHOT_VERSION,
  normalizeWorkspace,
  positionsForPreset,
  type AutoplayMode,
  type ChatDockMode,
  type ChatDockSize,
  type SavedWorkspace,
  type NormalizedWorkspaceSnapshot,
  type WorkspacePreset,
  type WorkspaceSnapshot,
  type WorkspaceTile,
} from "@/lib/watch/workspace";
import { gridTileToNormalizedRect } from "@/lib/watch/room-layout";
import type { ChatViewMode } from "@/lib/chat-layouts";
import type { PlayerCompanionView } from "@/lib/watch/player-companion";
import {
  MAX_SHORT_FORM_PRELOAD_ITEMS,
  mergeRefreshedChannelItems,
  shortFormNavigationItems,
  shortFormNavigationPosition,
  shortFormPreloadItems,
  shortFormNavigationTarget,
  type ShortFormNavigationDirection,
} from "@/lib/watch/short-form-navigation";

export type PlayerMode = "theater" | "mini";
export type AccessibilityPreset = "standard" | "captions" | "audio-description" | "calm";
export type QualityPreference = "auto" | "best" | "balanced" | "data-saver";

export type PlayerSeekRequest = {
  itemKey: string;
  seconds: number;
  requestId: number;
};

export type PlayerAiringContext = {
  /** The exact playable this Guide time belongs to. Prevents stale airtimes after Skip. */
  itemKey: string;
  network: string;
  channel: string;
  startsAt: string;
  endsAt?: string;
  status: "live" | "upcoming" | "replay" | "published";
  continuous: boolean;
};

export type PlayerChannelContext = {
  /** Stable source id used to keep a linear channel intact across navigation. */
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
  /** Network/community mark shown on the active shared player surface. */
  artwork?: string;
  /** Optional TV-guide metadata attached when playback is tuned from the Guide. */
  airing?: PlayerAiringContext;
};

/** Normalized (0–1) floating-chat geometry used by WorkspaceSnapshot v3. */
export type WorkspaceFloatingRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type WorkspaceSnapshotExtensions = {
  snapDensity?: number;
  chatFloatingRect?: WorkspaceFloatingRect;
  mixAudio?: boolean;
  maxActivePlayers?: number;
  autoplayMode?: AutoplayMode;
  dataSaver?: boolean;
  captionsEnabled?: boolean;
  playbackRate?: number;
  qualityPreference?: QualityPreference;
};

/**
 * Room-wide settings are valid even when a saved room intentionally has no
 * player tiles. Keeping this projection separate from tile restoration makes
 * that boundary explicit: an empty room is still a complete workspace, not
 * a reason to silently fall back to the previous room's chat or playback
 * configuration.
 */
export function workspaceRestoreSettings(
  snapshot: NormalizedWorkspaceSnapshot,
  multiviewTileLimit: number,
) {
  return {
    preset: snapshot.preset,
    columns: snapshot.columns,
    snapDensity: snapshot.snapDensity,
    chatDock: snapshot.chatDock,
    chatChannels: snapshot.chatChannels.slice(0, multiviewTileLimit),
    chatMode: snapshot.chatMode,
    chatFocusedLogin: snapshot.chatFocusedLogin,
    chatTextScale: snapshot.chatTextScale,
    showChatTimestamps: snapshot.showChatTimestamps,
    chatDockSize: { ...snapshot.chatDockSize },
    chatFloatingRect: { ...snapshot.chatFloatingRect },
    mixAudio: snapshot.mixAudio,
    maxActivePlayers: Math.min(multiviewTileLimit, snapshot.maxActivePlayers),
    autoplayMode: snapshot.autoplayMode,
    dataSaver: snapshot.dataSaver,
    captionsEnabled: snapshot.captionsEnabled,
    playbackRate: snapshot.playbackRate,
    qualityPreference: snapshot.qualityPreference,
  };
}

export type PlayOptions = {
  mode?: PlayerMode;
  /** Advanced surfaces can send a card straight to a new workspace tile. */
  target?: "focus" | "new-tile";
  /** Attach playback to an ordered network/channel instead of recommendations. */
  channel?: PlayerChannelContext;
  /** Start at a real chapter/moment timestamp when the provider is seekable. */
  startAtSeconds?: number;
};

type AddTileOptions = {
  focus?: boolean;
  muted?: boolean;
  replaceTileId?: string;
};

/**
 * A partial room update intended for the Room Studio.  The provider merges a
 * draft with its current workspace and commits it as a single transaction,
 * rather than making callers update every tile one at a time.
 */
export type WorkspaceLayoutDraft = Partial<
  Omit<WorkspaceSnapshot, "version" | "name" | "updatedAt" | "chatDockSize" | "chatFloatingRect">
> & {
  chatDockSize?: Partial<ChatDockSize>;
  chatFloatingRect?: Partial<WorkspaceFloatingRect>;
};

export type ApplyWorkspaceLayoutOptions = {
  /** Keep a valid fullscreen tile selected. Defaults to clearing it. */
  preserveMaximized?: boolean;
};

export type PlayerContextValue = {
  // Backwards-compatible single-player contract. `current` mirrors the
  // focused workspace tile so older Watch surfaces keep behaving exactly as
  // before while the multiview route can operate on all tiles.
  current: Playable | null;
  ready: boolean;
  queue: Playable[];
  nextUp: Playable | null;
  history: Playable[];
  channel: PlayerChannelContext | null;
  seekRequest: PlayerSeekRequest | null;
  autoplay: boolean;
  autoplayMode: AutoplayMode;
  previewAutoplay: boolean;
  previewSoundEnabled: boolean;
  previewVolume: number;
  activePreviewAudioId: string | null;
  dataSaver: boolean;
  ambientLighting: boolean;
  captionsEnabled: boolean;
  playbackRate: number;
  qualityPreference: QualityPreference;
  audioDescription: boolean;
  accessibilityPreset: AccessibilityPreset;
  mode: PlayerMode;
  queueOpen: boolean;
  companionView: PlayerCompanionView;
  play: (item: WatchItem | Playable, extras?: Array<WatchItem | Playable>, options?: PlayOptions) => void;
  playChannel: (
    channel: PlayerChannelContext,
    items: Array<WatchItem | Playable>,
    start?: WatchItem | Playable | number,
  ) => void;
  shortFormNavigation: { index: number; total: number } | null;
  /** Upcoming shorts in the exact channel/navigation order, capped at five. */
  shortFormPreloads: Playable[];
  navigateShortForm: (direction: ShortFormNavigationDirection) => boolean;
  skip: () => void;
  previous: () => void;
  stop: () => void;
  minimize: () => void;
  expand: () => void;
  requestSeek: (seconds: number) => void;
  setAutoplay: (value: boolean) => void;
  setAutoplayMode: (value: AutoplayMode) => void;
  setPreviewAutoplay: (value: boolean) => void;
  setPreviewSoundEnabled: (value: boolean) => void;
  setPreviewVolume: (value: number) => void;
  claimPreviewAudio: (ownerId: string) => void;
  releasePreviewAudio: (ownerId: string) => void;
  setDataSaver: (value: boolean) => void;
  setAmbientLighting: (value: boolean) => void;
  setCaptionsEnabled: (value: boolean) => void;
  setPlaybackRate: (value: number) => void;
  setQualityPreference: (value: QualityPreference) => void;
  setAudioDescription: (value: boolean) => void;
  applyAccessibilityPreset: (value: AccessibilityPreset) => void;
  setQueueOpen: (value: boolean) => void;
  setCompanionView: (value: PlayerCompanionView) => void;
  addToQueue: (item: WatchItem | Playable, position?: "next" | "end") => boolean;
  clearQueue: () => void;
  /** Replace the queue exactly after normalizing unsafe or duplicate entries. */
  replaceQueue: (items: Playable[]) => void;
  removeFromQueue: (key: string) => void;
  moveQueueItem: (key: string, direction: -1 | 1) => void;
  playFromQueue: (key: string) => void;
  refill: (items: Playable[], options?: { channelId?: string }) => void;

  // Workspace contract.
  tiles: WorkspaceTile[];
  focusedTileId: string | null;
  focusedTile: WorkspaceTile | null;
  layoutPreset: WorkspacePreset;
  gridColumns: number;
  /** Canonical v3 board density; may be higher than legacy grid columns. */
  snapDensity: number;
  maximizedTileId: string | null;
  mixAudio: boolean;
  maxActivePlayers: number;
  chatDock: ChatDockMode;
  chatChannels: string[];
  chatMode: ChatViewMode;
  chatFocusedLogin: string | null;
  chatTextScale: number;
  showChatTimestamps: boolean;
  chatDockSize: ChatDockSize;
  /**
   * The v3 Room Studio board stores floating chat as normalized geometry.
   * Keep it reactive so a Studio resize updates the live dock without
   * translating back through the legacy pixel offsets.
   */
  chatFloatingRect: WorkspaceFloatingRect;
  savedLayouts: SavedWorkspace[];
  addTile: (item: WatchItem | Playable, options?: AddTileOptions) => string | null;
  replaceTile: (tileId: string, item: WatchItem | Playable) => void;
  removeTile: (tileId: string) => void;
  finishTile: (tileId: string) => void;
  focusTile: (tileId: string, options?: { takeAudio?: boolean }) => void;
  updateTile: (
    tileId: string,
    patch: Partial<Omit<WorkspaceTile, "id" | "item">>,
  ) => void;
  swapTiles: (firstId: string, secondId: string) => void;
  applyPreset: (preset: WorkspacePreset) => void;
  setGridColumns: (columns: number) => void;
  setMaximizedTileId: (tileId: string | null) => void;
  setMixAudio: (value: boolean) => void;
  muteAll: () => void;
  setMaxActivePlayers: (value: number) => void;
  setChatDock: (value: ChatDockMode) => void;
  setChatChannels: (channels: string[]) => void;
  setChatMode: (value: ChatViewMode) => void;
  setChatFocusedLogin: (value: string | null) => void;
  setChatTextScale: (value: number) => void;
  setShowChatTimestamps: (value: boolean) => void;
  setChatDockSize: (patch: Partial<ChatDockSize>) => void;
  fillWithLive: (items: Array<WatchItem | Playable>, options?: { limit?: number }) => void;
  workspaceSnapshot: (name?: string) => WorkspaceSnapshot;
  /** Atomically replaces the full room layout without sequential tile updates. */
  applyWorkspaceLayout: (
    snapshot: WorkspaceSnapshot,
    options?: ApplyWorkspaceLayoutOptions,
  ) => boolean;
  /** Atomically merges a Room Studio draft onto the current room. */
  applyWorkspaceDraft: (
    draft: WorkspaceLayoutDraft,
    options?: ApplyWorkspaceLayoutOptions,
  ) => boolean;
  importWorkspace: (snapshot: WorkspaceSnapshot) => void;
  shareWorkspace: (name?: string) => string;
  saveLayout: (name: string) => Promise<void>;
  loadLayout: (name: string) => void;
  deleteLayout: (name: string) => Promise<void>;
};

const PlayerCtx = createContext<PlayerContextValue | null>(null);
const SESSION_STORE = "core-now-playing:v4";
const PREVIOUS_SESSION_STORE = "core-now-playing:v3";
const SECONDARY_SESSION_STORE = "core-now-playing:v2";
const LEGACY_STORE = "core-now-playing:v1";
const PREF_STORE = "core-player-prefs:v2";
const PREVIOUS_PREF_STORE = "core-player-prefs:v1";
const LAYOUT_STORE = "core-player-layouts:v1";
const LAYOUT_TOMBSTONE_STORE = "core-player-layout-tombstones:v1";
const MAX_HISTORY = 50;
const MAX_TILES = 12;
const MAX_RECOMMENDATION_QUEUE = 30;

type LayoutTombstone = { name: string; deletedAt: string };

function asPlayable(item: WatchItem | Playable): Playable | null {
  if ("key" in item) return item;
  return itemToPlayable(item);
}

function validAiring(value: unknown): PlayerAiringContext | undefined {
  if (!value || typeof value !== "object") return undefined;
  const airing = value as Partial<PlayerAiringContext>;
  const statuses: PlayerAiringContext["status"][] = ["live", "upcoming", "replay", "published"];
  if (typeof airing.itemKey !== "string" || !airing.itemKey.trim()) return undefined;
  if (typeof airing.network !== "string" || !airing.network.trim()) return undefined;
  if (typeof airing.channel !== "string" || !airing.channel.trim()) return undefined;
  if (typeof airing.startsAt !== "string") return undefined;
  if (!airing.status || !statuses.includes(airing.status)) return undefined;

  const startsAt = airing.startsAt.trim().slice(0, 80);
  const startsAtMs = Date.parse(startsAt);
  if (!Number.isFinite(startsAtMs)) return undefined;
  const candidateEnd = typeof airing.endsAt === "string" ? airing.endsAt.trim().slice(0, 80) : "";
  const candidateEndMs = Date.parse(candidateEnd);
  const endsAt = Number.isFinite(candidateEndMs) && candidateEndMs > startsAtMs
    ? candidateEnd
    : undefined;

  return {
    itemKey: airing.itemKey.trim().slice(0, 240),
    network: airing.network.trim().slice(0, 120),
    channel: airing.channel.trim().slice(0, 120),
    startsAt,
    endsAt,
    status: airing.status,
    continuous: airing.continuous === true,
  };
}

function validChannel(value: unknown): PlayerChannelContext | null {
  if (!value || typeof value !== "object") return null;
  const channel = value as Partial<PlayerChannelContext>;
  if (typeof channel.id !== "string" || !channel.id.trim()) return null;
  if (typeof channel.title !== "string" || !channel.title.trim()) return null;
  return {
    id: channel.id.trim().slice(0, 120),
    title: channel.title.trim().slice(0, 120),
    subtitle: typeof channel.subtitle === "string" ? channel.subtitle.trim().slice(0, 180) : undefined,
    href: typeof channel.href === "string" ? channel.href : undefined,
    artwork: typeof channel.artwork === "string" ? channel.artwork : undefined,
    airing: validAiring(channel.airing),
  };
}

function channelOrder(items: Playable[], currentKey: string): Playable[] {
  const seed = unique(items);
  if (seed.length < 2) return [];
  const index = seed.findIndex((item) => item.key === currentKey);
  if (index < 0) return seed;
  return [...seed.slice(index + 1), ...seed.slice(0, index)];
}

function liveFirst(items: Playable[]): Playable[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const liveDelta = Number(b.item.kind === "live") - Number(a.item.kind === "live");
      return liveDelta || a.index - b.index;
    })
    .map(({ item }) => item);
}

function unique(items: Playable[], blocked: Set<string> = new Set()): Playable[] {
  const seen = new Set(blocked);
  return items.filter((item) => {
    if (item.embeddable === false && !item.mediaUrl && !item.embedUrl) return false;
    if (!item?.key || seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}

function tileId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `tile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeTile(item: Playable, index: number, muted = index > 0): WorkspaceTile {
  // The first tile is a real Theater surface, not a half-width starter grid.
  // As soon as a companion is added `positionTiles` reapplies the active
  // preset and gives every tile its matching normalized rectangle.
  const isFirstTile = index === 0;
  const col = isFirstTile ? 1 : index % 2 === 0 ? 1 : 7;
  const row = isFirstTile ? 1 : Math.floor(index / 2) * 2 + 1;
  const colSpan = isFirstTile ? 12 : 6;
  const rowSpan = isFirstTile ? 12 : 2;
  return {
    id: tileId(),
    item,
    rect: gridTileToNormalizedRect({ col, row, colSpan, rowSpan }),
    col,
    row,
    colSpan,
    rowSpan,
    muted,
    volume: 0.8,
    pinned: false,
    fit: "contain",
    standby: false,
    delaySeconds: 0,
  };
}

function positionTiles(
  tiles: WorkspaceTile[],
  preset: WorkspacePreset,
  columns: number,
): WorkspaceTile[] {
  // Generate the preset on this room's actual logical board.  Projecting a
  // 12-cell recipe onto an 8-cell saved room makes Studio and Theater disagree
  // about the side rail after a restore.
  const positions = positionsForPreset(preset, tiles.length, columns);
  return tiles.map((tile, index) => {
    const position = positions[index];
    if (!position || preset === "freeform") return tile;
    return { ...tile, ...position, rect: gridTileToNormalizedRect(position, columns, columns) };
  });
}

/**
 * Saved/share snapshots must never retain a reference to live room state.
 * Room Studio keeps drafts around for undo and Save can happen immediately
 * after a drop, so a shallow object copy here is not sufficient.
 */
function cloneWorkspaceSnapshot<T extends WorkspaceSnapshot>(snapshot: T): T {
  if (typeof structuredClone === "function") return structuredClone(snapshot);
  return JSON.parse(JSON.stringify(snapshot)) as T;
}

/**
 * Preserve tile and playable object identity whenever a layout-only change
 * reaches the provider. Provider iframes are keyed by tile id, but retaining
 * these references also keeps memoized tiles from doing unnecessary work.
 */
function reconcileWorkspaceTiles(
  previous: WorkspaceTile[],
  incoming: WorkspaceTile[],
): WorkspaceTile[] {
  const existingById = new Map(previous.map((tile) => [tile.id, tile]));
  return incoming.map((candidate) => {
    const existing = existingById.get(candidate.id);
    if (!existing || existing.item.key !== candidate.item.key) return candidate;
    const withStablePlayable = { ...candidate, item: existing.item } as WorkspaceTile;
    return JSON.stringify(existing) === JSON.stringify(withStablePlayable)
      ? existing
      : withStablePlayable;
  });
}

function localLayouts(): SavedWorkspace[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAYOUT_STORE) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      const normalized = normalizeWorkspace(entry);
      const remote = Boolean(entry && typeof entry === "object" && (entry as { remote?: unknown }).remote === true);
      return normalized ? [{ ...normalized, remote }] : [];
    });
  } catch {
    return [];
  }
}

function writeLocalLayouts(layouts: SavedWorkspace[]) {
  try { localStorage.setItem(LAYOUT_STORE, JSON.stringify(layouts)); } catch { /* best effort */ }
}

function localLayoutTombstones(): Record<string, LayoutTombstone> {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAYOUT_TOMBSTONE_STORE) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const tombstones: Record<string, LayoutTombstone> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      const entry = value as Partial<LayoutTombstone>;
      if (typeof entry.name !== "string" || typeof entry.deletedAt !== "string") continue;
      if (!Number.isFinite(Date.parse(entry.deletedAt))) continue;
      tombstones[key.toLowerCase()] = { name: entry.name.slice(0, 80), deletedAt: entry.deletedAt };
    }
    return tombstones;
  } catch {
    return {};
  }
}

function writeLayoutTombstones(tombstones: Record<string, LayoutTombstone>) {
  try {
    if (Object.keys(tombstones).length) {
      localStorage.setItem(LAYOUT_TOMBSTONE_STORE, JSON.stringify(tombstones));
    } else {
      localStorage.removeItem(LAYOUT_TOMBSTONE_STORE);
    }
  } catch {
    // A failed remote delete can still be retried during this session.
  }
}

function layoutTimestamp(layout: { updatedAt?: string } | null | undefined) {
  const timestamp = Date.parse(layout?.updatedAt ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const subscription = useSubscription();
  const multiviewTileLimit = subscription.hasFeature("multiview.expanded") ? MAX_TILES : 2;
  // A room belongs to the signed-in viewer. Keep this lightweight and useful:
  // any account can save/sync its own workspace, while player-count upgrades
  // remain a separate entitlement.
  const savedLayoutSyncAllowed = subscription.signedIn;
  const [current, setCurrent] = useState<Playable | null>(null);
  const [queue, setQueue] = useState<Playable[]>([]);
  const [history, setHistory] = useState<Playable[]>([]);
  const [channel, setChannel] = useState<PlayerChannelContext | null>(null);
  const [channelItems, setChannelItems] = useState<Playable[]>([]);
  const [autoplayMode, setAutoplayModeState] = useState<AutoplayMode>("live-first");
  const [previewAutoplay, setPreviewAutoplay] = useState(true);
  // Hover previews start with sound unless a viewer has explicitly muted them.
  // Browsers can still require a direct gesture for a particular provider; the
  // preview control handles that gracefully without changing this preference.
  const [previewSoundEnabled, setPreviewSoundEnabledState] = useState(true);
  const [previewVolume, setPreviewVolumeState] = useState(DEFAULT_PREVIEW_VOLUME);
  const [activePreviewAudioId, setActivePreviewAudioId] = useState<string | null>(null);
  const [dataSaver, setDataSaverState] = useState(false);
  const [ambientLighting, setAmbientLighting] = useState(true);
  const [captionsEnabled, setCaptionsEnabledState] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [qualityPreference, setQualityPreferenceState] = useState<QualityPreference>("auto");
  const [audioDescription, setAudioDescription] = useState(false);
  const [accessibilityPreset, setAccessibilityPreset] = useState<AccessibilityPreset>("standard");
  const [seekRequest, setSeekRequest] = useState<PlayerSeekRequest | null>(null);
  const [mode, setMode] = useState<PlayerMode>("mini");
  const [queueOpen, setQueueOpen] = useState(false);
  const [companionView, setCompanionView] = useState<PlayerCompanionView>("details");
  const [tiles, setTiles] = useState<WorkspaceTile[]>([]);
  const [focusedTileId, setFocusedTileId] = useState<string | null>(null);
  // New rooms open as a Theater surface: one focused program with companion
  // views, rather than starting as a generic technical grid.
  const [layoutPreset, setLayoutPreset] = useState<WorkspacePreset>("theater-first");
  const [gridColumnsState, setGridColumnsState] = useState(12);
  const [snapDensityState, setSnapDensityState] = useState(12);
  const [maximizedTileId, setMaximizedTileIdState] = useState<string | null>(null);
  const [mixAudio, setMixAudioState] = useState(false);
  const [maxActivePlayersState, setMaxActivePlayersState] = useState(4);
  const [chatDock, setChatDockState] = useState<ChatDockMode>("right");
  const [chatChannels, setChatChannelsState] = useState<string[]>([]);
  const [chatMode, setChatModeState] = useState<ChatViewMode>("combined");
  const [chatFocusedLogin, setChatFocusedLoginState] = useState<string | null>(null);
  const [chatTextScale, setChatTextScaleState] = useState(1);
  const [showChatTimestamps, setShowChatTimestampsState] = useState(false);
  const [chatDockSize, setChatDockSizeState] = useState<ChatDockSize>(DEFAULT_CHAT_DOCK_SIZE);
  const [chatFloatingRect, setChatFloatingRectState] = useState<WorkspaceFloatingRect>({ ...DEFAULT_CHAT_FLOATING_RECT });
  const [savedLayouts, setSavedLayouts] = useState<SavedWorkspace[]>([]);
  const [ready, setReady] = useState(false);
  const currentRef = useRef<Playable | null>(null);
  const queueRef = useRef<Playable[]>([]);
  const historyRef = useRef<Playable[]>([]);
  const channelRef = useRef<PlayerChannelContext | null>(null);
  const channelItemsRef = useRef<Playable[]>([]);
  const tilesRef = useRef<WorkspaceTile[]>([]);
  const focusedRef = useRef<string | null>(null);
  const autoplayModeRef = useRef<AutoplayMode>("live-first");
  const presetRef = useRef<WorkspacePreset>("theater-first");
  const columnsRef = useRef(12);
  const dataSaverRef = useRef(false);
  const captionsEnabledRef = useRef(false);
  const playbackRateRef = useRef(1);
  const qualityPreferenceRef = useRef<QualityPreference>("auto");
  const mixAudioRef = useRef(false);
  const maxActivePlayersRef = useRef(4);
  const maximizedTileRef = useRef<string | null>(null);
  const chatDockRef = useRef<ChatDockMode>("right");
  const chatChannelsRef = useRef<string[]>([]);
  const chatModeRef = useRef<ChatViewMode>("combined");
  const chatFocusedLoginRef = useRef<string | null>(null);
  const chatTextScaleRef = useRef(1);
  const showChatTimestampsRef = useRef(false);
  const chatDockSizeRef = useRef<ChatDockSize>({ ...DEFAULT_CHAT_DOCK_SIZE });
  const workspaceGeometryRef = useRef<Required<Pick<WorkspaceSnapshotExtensions, "snapDensity" | "chatFloatingRect">>>({
    snapDensity: 12,
    chatFloatingRect: { ...DEFAULT_CHAT_FLOATING_RECT },
  });
  const requestRef = useRef(0);
  const queueGenerationRef = useRef(0);
  const queueFetchRef = useRef<{
    contextKey: string;
    request: Promise<{ items: Playable[]; generation: number }>;
  } | null>(null);
  const queueRefillBlockedKeyRef = useRef<string | null>(null);
  const restoredClientStateRef = useRef(false);
  const savedLayoutsRef = useRef<SavedWorkspace[]>([]);
  const activePreviewAudioRef = useRef<string | null>(null);
  const layoutMutationsRef = useRef(new Map<string, Promise<void>>());
  const layoutLocalWritesRef = useRef(new Map<string, number>());

  const setPreviewSoundEnabled = useCallback((value: boolean) => {
    setPreviewSoundEnabledState(value);
  }, []);

  const setPreviewVolume = useCallback((value: number) => {
    setPreviewVolumeState(normalizePreviewVolume(value));
  }, []);

  const claimPreviewAudio = useCallback((ownerId: string) => {
    const next = nextPreviewAudioOwner(activePreviewAudioRef.current, { type: "claim", ownerId });
    if (next === activePreviewAudioRef.current) return;
    activePreviewAudioRef.current = next;
    setActivePreviewAudioId(next);
  }, []);

  const releasePreviewAudio = useCallback((ownerId: string) => {
    const next = nextPreviewAudioOwner(activePreviewAudioRef.current, { type: "release", ownerId });
    if (next === activePreviewAudioRef.current) return;
    activePreviewAudioRef.current = next;
    setActivePreviewAudioId(next);
  }, []);

  const commitQueue = useCallback((
    nextOrUpdater: Playable[] | ((previous: Playable[]) => Playable[]),
  ) => {
    const next = typeof nextOrUpdater === "function"
      ? nextOrUpdater(queueRef.current)
      : nextOrUpdater;
    queueGenerationRef.current += 1;
    queueRef.current = next;
    setQueue(next);
    return next;
  }, []);

  const takeQueueHead = useCallback(() => {
    const [head, ...tail] = queueRef.current;
    if (head) commitQueue(tail);
    return head ?? null;
  }, [commitQueue]);

  const commitAutoplayMode = useCallback((value: AutoplayMode) => {
    autoplayModeRef.current = value;
    setAutoplayModeState(value);
  }, []);

  const setDataSaver = useCallback((value: boolean) => {
    const next = Boolean(value);
    dataSaverRef.current = next;
    setDataSaverState(next);
  }, []);

  const setCaptionsEnabled = useCallback((value: boolean) => {
    const next = Boolean(value);
    captionsEnabledRef.current = next;
    setCaptionsEnabledState(next);
  }, []);

  const setQualityPreference = useCallback((value: QualityPreference) => {
    if (!["auto", "best", "balanced", "data-saver"].includes(value)) return;
    qualityPreferenceRef.current = value;
    setQualityPreferenceState(value);
  }, []);

  const setMaximizedTileId = useCallback((value: string | null | ((current: string | null) => string | null)) => {
    const next = typeof value === "function" ? value(maximizedTileRef.current) : value;
    maximizedTileRef.current = next;
    setMaximizedTileIdState(next);
  }, []);

  const setChatDock = useCallback((value: ChatDockMode) => {
    chatDockRef.current = value;
    setChatDockState(value);
  }, []);

  const commitSavedLayouts = useCallback((layouts: SavedWorkspace[]) => {
    savedLayoutsRef.current = layouts;
    writeLocalLayouts(layouts);
    setSavedLayouts(layouts);
  }, []);

  const enqueueLayoutMutation = useCallback((name: string, mutation: () => Promise<void>) => {
    const key = name.toLowerCase();
    const previous = layoutMutationsRef.current.get(key) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(mutation)
      .finally(() => {
        if (layoutMutationsRef.current.get(key) === next) layoutMutationsRef.current.delete(key);
      });
    layoutMutationsRef.current.set(key, next);
    return next;
  }, []);

  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { channelRef.current = channel; }, [channel]);
  useEffect(() => { channelItemsRef.current = channelItems; }, [channelItems]);
  useEffect(() => { tilesRef.current = tiles; }, [tiles]);
  useEffect(() => { focusedRef.current = focusedTileId; }, [focusedTileId]);
  useEffect(() => { autoplayModeRef.current = autoplayMode; }, [autoplayMode]);
  useEffect(() => { presetRef.current = layoutPreset; }, [layoutPreset]);
  useEffect(() => { columnsRef.current = gridColumnsState; }, [gridColumnsState]);

  useEffect(() => {
    if (subscription.loading || restoredClientStateRef.current) return;
    restoredClientStateRef.current = true;
    try {
      const raw = sessionStorage.getItem(SESSION_STORE)
        ?? sessionStorage.getItem(PREVIOUS_SESSION_STORE)
        ?? sessionStorage.getItem(SECONDARY_SESSION_STORE)
        ?? sessionStorage.getItem(LEGACY_STORE);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          current?: Playable | null;
          queue?: Playable[];
          history?: Playable[];
          channel?: PlayerChannelContext | null;
          channelItems?: Playable[];
          tiles?: WorkspaceTile[];
          workspaceVersion?: WorkspaceSnapshot["version"];
          focusedTileId?: string | null;
          layoutPreset?: WorkspacePreset;
          gridColumns?: number;
          snapDensity?: number;
          chatDock?: ChatDockMode;
          chatChannels?: string[];
          chatMode?: ChatViewMode;
          chatFocusedLogin?: string | null;
          chatTextScale?: number;
          showChatTimestamps?: boolean;
          chatDockSize?: ChatDockSize;
          chatFloatingRect?: WorkspaceFloatingRect;
          mixAudio?: boolean;
          maxActivePlayers?: number;
          autoplayMode?: AutoplayMode;
          dataSaver?: boolean;
          captionsEnabled?: boolean;
          playbackRate?: number;
          qualityPreference?: QualityPreference;
        };
        if (Array.isArray(parsed.queue)) commitQueue(unique(parsed.queue));
        if (Array.isArray(parsed.history)) setHistory(unique(parsed.history).slice(-MAX_HISTORY));
        const restoredChannel = validChannel(parsed.channel);
        const restoredChannelItems = Array.isArray(parsed.channelItems)
          ? unique(parsed.channelItems)
          : [];
        if (restoredChannel && restoredChannelItems.length) {
          setChannel(restoredChannel);
          setChannelItems(restoredChannelItems);
        }
        const restored = normalizeWorkspace({
          version: parsed.workspaceVersion ?? WORKSPACE_SNAPSHOT_VERSION,
          name: "Session",
          preset: parsed.layoutPreset ?? "theater-first",
          columns: parsed.gridColumns ?? 12,
          snapDensity: parsed.snapDensity,
          focusedTileId: parsed.focusedTileId ?? null,
          chatDock: parsed.chatDock ?? "right",
          chatChannels: parsed.chatChannels ?? [],
          chatMode: parsed.chatMode ?? "combined",
          chatFocusedLogin: parsed.chatFocusedLogin ?? null,
          chatTextScale: parsed.chatTextScale ?? 1,
          showChatTimestamps: parsed.showChatTimestamps ?? false,
          chatDockSize: parsed.chatDockSize ?? DEFAULT_CHAT_DOCK_SIZE,
          chatFloatingRect: parsed.chatFloatingRect ?? DEFAULT_CHAT_FLOATING_RECT,
          mixAudio: parsed.mixAudio,
          maxActivePlayers: parsed.maxActivePlayers,
          autoplayMode: parsed.autoplayMode,
          dataSaver: parsed.dataSaver,
          captionsEnabled: parsed.captionsEnabled,
          playbackRate: parsed.playbackRate,
          qualityPreference: parsed.qualityPreference,
          tiles: parsed.tiles ?? [],
          updatedAt: new Date().toISOString(),
        });
        // Apply room-wide state before considering whether this workspace has
        // media. A saved "chat-only" room is still a complete room: restoring
        // it must not retain the previous preset, dock, or playback settings.
        if (restored) {
          const settings = workspaceRestoreSettings(restored, multiviewTileLimit);
          workspaceGeometryRef.current = {
            snapDensity: settings.snapDensity,
            chatFloatingRect: settings.chatFloatingRect,
          };
          presetRef.current = settings.preset;
          columnsRef.current = settings.columns;
          mixAudioRef.current = settings.mixAudio;
          maxActivePlayersRef.current = settings.maxActivePlayers;
          autoplayModeRef.current = settings.autoplayMode;
          dataSaverRef.current = settings.dataSaver;
          captionsEnabledRef.current = settings.captionsEnabled;
          playbackRateRef.current = settings.playbackRate;
          qualityPreferenceRef.current = settings.qualityPreference;
          setLayoutPreset(settings.preset);
          setGridColumnsState(settings.columns);
          setSnapDensityState(settings.snapDensity);
          setChatDock(settings.chatDock);
          setChatChannels(settings.chatChannels);
          setChatMode(settings.chatMode);
          setChatFocusedLogin(settings.chatFocusedLogin);
          setChatTextScale(settings.chatTextScale);
          setShowChatTimestamps(settings.showChatTimestamps);
          setChatDockSize(settings.chatDockSize);
          setChatFloatingRectState(settings.chatFloatingRect);
          setMixAudioState(settings.mixAudio);
          setMaxActivePlayersState(settings.maxActivePlayers);
          setAutoplayModeState(settings.autoplayMode);
          setDataSaverState(settings.dataSaver);
          setCaptionsEnabledState(settings.captionsEnabled);
          setPlaybackRateState(settings.playbackRate);
          setQualityPreferenceState(settings.qualityPreference);
        }
        if (restored?.tiles.length) {
          const allowedTiles = clampMultiviewItems(restored.tiles, multiviewTileLimit);
          const restoredTiles = restored.preset === "freeform" || allowedTiles.some((tile) => "rect" in tile)
            ? allowedTiles
            : positionTiles(allowedTiles, restored.preset, restored.columns);
          const restoredFocus = restoredTiles.some((tile) => tile.id === restored.focusedTileId)
            ? restored.focusedTileId
            : restoredTiles[0]?.id ?? null;
          tilesRef.current = restoredTiles;
          focusedRef.current = restoredFocus;
          currentRef.current = restoredTiles.find((tile) => tile.id === restoredFocus)?.item ?? restoredTiles[0]!.item;
          setTiles(restoredTiles);
          setFocusedTileId(restoredFocus);
          setCurrent(currentRef.current);
        } else if (parsed.current) {
          const tile = makeTile(parsed.current, 0, false);
          tilesRef.current = [tile];
          focusedRef.current = tile.id;
          currentRef.current = parsed.current;
          setCurrent(parsed.current);
          setTiles([tile]);
          setFocusedTileId(tile.id);
        }
      }
      const prefs = localStorage.getItem(PREF_STORE) ?? localStorage.getItem(PREVIOUS_PREF_STORE);
      if (prefs) {
        const parsed = JSON.parse(prefs) as {
          autoplay?: boolean;
          autoplayMode?: AutoplayMode;
          previewAutoplay?: boolean;
          previewSoundEnabled?: boolean;
          previewVolume?: number;
          dataSaver?: boolean;
          ambientLighting?: boolean;
          mixAudio?: boolean;
          maxActivePlayers?: number;
          captionsEnabled?: boolean;
          playbackRate?: number;
          qualityPreference?: QualityPreference;
          audioDescription?: boolean;
          accessibilityPreset?: AccessibilityPreset;
        };
        if (["off", "queue", "same-creator", "similar", "live-first", "keep-grid-full"].includes(parsed.autoplayMode ?? "")) {
          commitAutoplayMode(parsed.autoplayMode!);
        } else if (typeof parsed.autoplay === "boolean") {
          commitAutoplayMode(parsed.autoplay ? "live-first" : "off");
        }
        if (typeof parsed.previewAutoplay === "boolean") setPreviewAutoplay(parsed.previewAutoplay);
        if (typeof parsed.previewSoundEnabled === "boolean") {
          setPreviewSoundEnabledState(parsed.previewSoundEnabled);
        }
        if (typeof parsed.previewVolume === "number") {
          setPreviewVolumeState(normalizePreviewVolume(parsed.previewVolume));
        }
        if (typeof parsed.dataSaver === "boolean") setDataSaver(parsed.dataSaver);
        if (typeof parsed.ambientLighting === "boolean") setAmbientLighting(parsed.ambientLighting);
        if (typeof parsed.captionsEnabled === "boolean") setCaptionsEnabled(parsed.captionsEnabled);
        if (typeof parsed.playbackRate === "number" && Number.isFinite(parsed.playbackRate)) {
          setPlaybackRate(parsed.playbackRate);
        }
        if (["auto", "best", "balanced", "data-saver"].includes(parsed.qualityPreference ?? "")) {
          setQualityPreference(parsed.qualityPreference!);
        }
        if (typeof parsed.audioDescription === "boolean") setAudioDescription(parsed.audioDescription);
        if (["standard", "captions", "audio-description", "calm"].includes(parsed.accessibilityPreset ?? "")) {
          setAccessibilityPreset(parsed.accessibilityPreset!);
        }
        if (typeof parsed.mixAudio === "boolean") setMixAudio(parsed.mixAudio);
        if (typeof parsed.maxActivePlayers === "number") {
          setMaxActivePlayers(parsed.maxActivePlayers);
        }
      }
      commitSavedLayouts(localLayouts());
    } catch {
      // Corrupt or unavailable client storage should never stop playback.
    }
    setReady(true);
  }, [commitAutoplayMode, commitQueue, commitSavedLayouts, multiviewTileLimit, subscription.loading]);

  useEffect(() => {
    if (!ready || subscription.loading) return;
    setChatChannels(chatChannelsRef.current.slice(0, multiviewTileLimit));
    setMaxActivePlayers(maxActivePlayersRef.current);
    if (tilesRef.current.length <= multiviewTileLimit) return;
    const allowed = clampMultiviewItems(tilesRef.current, multiviewTileLimit);
    const next = presetRef.current === "freeform"
      ? allowed
      : positionTiles(allowed, presetRef.current, columnsRef.current);
    const nextFocus = next.some((tile) => tile.id === focusedRef.current)
      ? focusedRef.current
      : next[0]?.id ?? null;
    const nextCurrent = next.find((tile) => tile.id === nextFocus)?.item ?? next[0]?.item ?? null;
    tilesRef.current = next;
    focusedRef.current = nextFocus;
    currentRef.current = nextCurrent;
    setTiles(next);
    setFocusedTileId(nextFocus);
    setCurrent(nextCurrent);
    setMaximizedTileId((id) => id && next.some((tile) => tile.id === id) ? id : null);
  }, [multiviewTileLimit, ready, subscription.loading]);

  useEffect(() => {
    // Device-local playback/accessibility preferences are available to every
    // fan. The saved-layout entitlement only gates account-synced layouts.
    if (!ready) return;
    try {
      sessionStorage.setItem(SESSION_STORE, JSON.stringify({
        current,
        queue,
        history: history.slice(-MAX_HISTORY),
        channel,
        channelItems,
        tiles,
        workspaceVersion: WORKSPACE_SNAPSHOT_VERSION,
        focusedTileId,
        layoutPreset,
        gridColumns: gridColumnsState,
        snapDensity: workspaceGeometryRef.current.snapDensity,
        chatDock,
        chatChannels,
        chatMode,
        chatFocusedLogin,
        chatTextScale,
        showChatTimestamps,
        chatDockSize,
        chatFloatingRect: workspaceGeometryRef.current.chatFloatingRect,
        mixAudio,
        maxActivePlayers: maxActivePlayersState,
        autoplayMode,
        dataSaver,
        captionsEnabled,
        playbackRate,
        qualityPreference,
      }));
      localStorage.setItem(PREF_STORE, JSON.stringify({
        autoplayMode,
        previewAutoplay,
        previewSoundEnabled,
        previewVolume,
        dataSaver,
        ambientLighting,
        mixAudio,
        maxActivePlayers: maxActivePlayersState,
        captionsEnabled,
        playbackRate,
        qualityPreference,
        audioDescription,
        accessibilityPreset,
      }));
    } catch {
      // Private browsing can make storage unavailable.
    }
  }, [
    autoplayMode,
    ambientLighting,
    accessibilityPreset,
    audioDescription,
    captionsEnabled,
    channel,
    channelItems,
    chatChannels,
    chatDock,
    chatDockSize,
    chatFloatingRect,
    chatFocusedLogin,
    chatMode,
    chatTextScale,
    current,
    dataSaver,
    focusedTileId,
    gridColumnsState,
    history,
    layoutPreset,
    maxActivePlayersState,
    mixAudio,
    playbackRate,
    previewAutoplay,
    previewSoundEnabled,
    previewVolume,
    queue,
    qualityPreference,
    ready,
    showChatTimestamps,
    snapDensityState,
    tiles,
  ]);

  // Signed-in fans receive last-write-wins reconciliation. Local edits stay
  // durable while offline, and delete tombstones prevent a stale account copy
  // from returning before its DELETE can be retried.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const requestedAt = Date.now();
    void fetch("/api/account/workspaces?kind=watch", { credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { items?: Array<{ name: string; payload: unknown; updatedAt?: string }> }) => {
        if (cancelled) return;
        const remoteLayouts = (data.items ?? []).flatMap((entry) => {
          const normalized = normalizeWorkspace(entry.payload);
          if (!normalized) return [];
          const serverUpdatedAt = typeof entry.updatedAt === "string" && Number.isFinite(Date.parse(entry.updatedAt))
            ? entry.updatedAt
            : normalized.updatedAt;
          return [{ ...normalized, name: entry.name, updatedAt: serverUpdatedAt, remote: true }];
        });
        const local = savedLayoutsRef.current;
        const tombstones = localLayoutTombstones();
        const remoteByName = new Map(remoteLayouts.map((layout) => [layout.name.toLowerCase(), layout]));
        const resolved = new Map<string, SavedWorkspace>();
        const pendingUpserts: SavedWorkspace[] = [];

        for (const remote of remoteLayouts) {
          const key = remote.name.toLowerCase();
          const tombstone = tombstones[key];
          if (tombstone && Date.parse(tombstone.deletedAt) >= layoutTimestamp(remote)) continue;
          if (tombstone) delete tombstones[key];
          resolved.set(key, remote);
        }

        for (const localLayout of local) {
          const key = localLayout.name.toLowerCase();
          const tombstone = tombstones[key];
          if (tombstone && Date.parse(tombstone.deletedAt) >= layoutTimestamp(localLayout)) continue;
          const remote = remoteByName.get(key);
          if (!remote) {
            // A previously synced layout missing remotely was deleted on
            // another device. Preserve work created after this GET began;
            // its PUT may have completed after the response snapshot.
            const writtenDuringRequest = (layoutLocalWritesRef.current.get(key) ?? 0) >= requestedAt;
            if (!localLayout.remote || writtenDuringRequest) {
              resolved.set(key, { ...localLayout, remote: Boolean(localLayout.remote) });
              if (!localLayout.remote) pendingUpserts.push(localLayout);
            }
            continue;
          }
          if (layoutTimestamp(localLayout) > layoutTimestamp(remote)) {
            resolved.set(key, { ...localLayout, remote: false });
            pendingUpserts.push(localLayout);
          }
        }

        const order = [
          ...local.map((layout) => layout.name.toLowerCase()),
          ...remoteLayouts.map((layout) => layout.name.toLowerCase()),
        ];
        const merged = [...new Set(order)].flatMap((key) => {
          const layout = resolved.get(key);
          return layout ? [layout] : [];
        });
        writeLayoutTombstones(tombstones);
        commitSavedLayouts(merged);

        for (const tombstone of Object.values(tombstones)) {
          void enqueueLayoutMutation(tombstone.name, async () => {
            const query = new URLSearchParams({ kind: "watch", name: tombstone.name });
            const response = await fetch(`/api/account/workspaces?${query}`, {
              method: "DELETE",
              credentials: "same-origin",
            });
            if (!response.ok) throw new Error("layout_delete_failed");
            const current = localLayoutTombstones();
            const key = tombstone.name.toLowerCase();
            if (current[key]?.deletedAt === tombstone.deletedAt) {
              delete current[key];
              writeLayoutTombstones(current);
            }
          }).catch(() => undefined);
        }

        for (const layout of pendingUpserts) {
          void enqueueLayoutMutation(layout.name, async () => {
            const response = await fetch("/api/account/workspaces", {
              method: "PUT",
              credentials: "same-origin",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ kind: "watch", name: layout.name, payload: layout }),
            });
            if (!response.ok) throw new Error("layout_save_failed");
            const payload = await response.json().catch(() => null) as { item?: { updatedAt?: string } } | null;
            const serverUpdatedAt = payload?.item?.updatedAt;
            const next = savedLayoutsRef.current.map((entry) => (
              entry.name.toLowerCase() === layout.name.toLowerCase() && entry.updatedAt === layout.updatedAt
                ? {
                    ...entry,
                    remote: true,
                    updatedAt: typeof serverUpdatedAt === "string" && Number.isFinite(Date.parse(serverUpdatedAt))
                      ? serverUpdatedAt
                      : entry.updatedAt,
                  }
                : entry
            ));
            commitSavedLayouts(next);
          }).catch(() => undefined);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [commitSavedLayouts, enqueueLayoutMutation, ready, savedLayoutSyncAllowed, subscription.loading]);

  const remember = useCallback((item: Playable | null) => {
    if (!item) return;
    const without = historyRef.current.filter((entry) => entry.key !== item.key);
    const next = [...without, item].slice(-MAX_HISTORY);
    historyRef.current = next;
    setHistory(next);
  }, []);

  const focusTile = useCallback((id: string, options?: { takeAudio?: boolean }) => {
    const target = tilesRef.current.find((tile) => tile.id === id);
    if (!target) return;
    currentRef.current = target.item;
    focusedRef.current = id;
    setSeekRequest(null);
    setFocusedTileId(id);
    setCurrent(target.item);
    if (options?.takeAudio) {
      const next = tilesRef.current.map((tile) => ({
        ...tile,
        muted: tile.id === id ? false : (mixAudio ? tile.muted : true),
      }));
      tilesRef.current = next;
      setTiles(next);
    }
  }, [mixAudio]);

  const setFocusedPlayable = useCallback((item: Playable) => {
    currentRef.current = item;
    queueRefillBlockedKeyRef.current = null;
    setSeekRequest(null);
    const emptyTile = makeTile(item, 0, false);
    const previous = tilesRef.current;
    const duplicate = previous.find((tile) => tile.item.key === item.key);
    const focus = duplicate ?? previous.find((tile) => tile.id === focusedRef.current) ?? previous[0] ?? emptyTile;
    const next = previous.length === 0
      ? [emptyTile]
      : previous.map((tile) => tile.id === focus.id ? { ...tile, item } : tile);
    tilesRef.current = next;
    focusedRef.current = focus.id;
    setTiles(next);
    setFocusedTileId(focus.id);
    setCurrent(item);
  }, []);

  const addTile = useCallback((item: WatchItem | Playable, options?: AddTileOptions): string | null => {
    const playable = asPlayable(item);
    if (!playable) return null;
    const duplicate = tilesRef.current.find((tile) => tile.item.key === playable.key);
    if (duplicate) {
      if (queueRef.current.some((entry) => entry.key === playable.key)) {
        commitQueue((items) => items.filter((entry) => entry.key !== playable.key));
      }
      if (options?.focus !== false) focusTile(duplicate.id, { takeAudio: false });
      return duplicate.id;
    }
    if (options?.replaceTileId) {
      const replaced = tilesRef.current.find((tile) => tile.id === options.replaceTileId);
      if (!replaced) return null;
      if (queueRef.current.some((entry) => entry.key === playable.key)) {
        commitQueue((items) => items.filter((entry) => entry.key !== playable.key));
      }
      const next = tilesRef.current.map((tile) => tile.id === options.replaceTileId ? { ...tile, item: playable } : tile);
      tilesRef.current = next;
      setTiles(next);
      if (focusedRef.current === options.replaceTileId || options.focus !== false) {
        focusedRef.current = options.replaceTileId;
        currentRef.current = playable;
        setFocusedTileId(options.replaceTileId);
        setCurrent(playable);
      }
      return options.replaceTileId;
    }
    if (tilesRef.current.length >= multiviewTileLimit) return null;
    if (queueRef.current.some((entry) => entry.key === playable.key)) {
      commitQueue((items) => items.filter((entry) => entry.key !== playable.key));
    }
    const id = tileId();
    const previous = tilesRef.current;
    const nextPreset: WorkspacePreset = presetRef.current === "solo" && previous.length > 0
      ? "split"
      : presetRef.current;
    const next = positionTiles([
      ...previous,
      // A new multiview tile has to satisfy the browser's autoplay policy on
      // its first paint. Start it muted even when it is the first tile, then
      // let an explicit room audio action take sound after the stream is
      // already running. Previously the first manually-added tile started
      // audible, which left YouTube/Twitch on their provider Play state.
      { ...makeTile(playable, previous.length, options?.muted ?? true), id },
    ], nextPreset, columnsRef.current);
    if (nextPreset !== presetRef.current) {
      presetRef.current = nextPreset;
      setLayoutPreset(nextPreset);
    }
    tilesRef.current = next;
    setTiles(next);
    if (options?.focus !== false || !currentRef.current) {
      focusedRef.current = id;
      currentRef.current = playable;
      setFocusedTileId(id);
      setCurrent(playable);
    }
    return id;
  }, [commitQueue, focusTile, multiviewTileLimit]);

  const play = useCallback((item: WatchItem | Playable, extras?: Array<WatchItem | Playable>, options?: PlayOptions) => {
    const now = asPlayable(item);
    if (!now) return;
    queueRefillBlockedKeyRef.current = null;
    requestRef.current += 1;
    setSeekRequest(
      typeof options?.startAtSeconds === "number" && Number.isFinite(options.startAtSeconds)
        ? { itemKey: now.key, seconds: Math.max(0, options.startAtSeconds), requestId: requestRef.current }
        : null,
    );
    const prior = currentRef.current;
    if (prior && prior.key !== now.key) remember(prior);
    const contextual = (extras ?? []).map(asPlayable).filter((entry): entry is Playable => Boolean(entry));
    const playbackChannel = validChannel(options?.channel);
    if (playbackChannel) {
      const seed = unique([now, ...contextual]);
      const nextQueue = channelOrder(seed, now.key);
      channelRef.current = playbackChannel;
      channelItemsRef.current = seed;
      setChannel(playbackChannel);
      setChannelItems(seed);
      commitQueue(nextQueue);
      if (autoplayModeRef.current === "off") commitAutoplayMode("queue");
    } else {
      channelRef.current = null;
      channelItemsRef.current = [];
      setChannel(null);
      setChannelItems([]);
      const blocked = new Set<string>([
        now.key,
        ...(prior ? [prior.key] : []),
        ...tilesRef.current.map((tile) => tile.item.key),
        ...historyRef.current.map((entry) => entry.key),
      ]);
      const nextQueue = liveFirst(unique([...contextual, ...queueRef.current], blocked));
      commitQueue(nextQueue);
    }
    if (options?.target === "new-tile") addTile(now, { focus: true });
    else setFocusedPlayable(now);
    setMode(options?.mode ?? "theater");
    setQueueOpen(false);
  }, [addTile, commitAutoplayMode, commitQueue, remember, setFocusedPlayable]);

  const playChannel = useCallback((
    context: PlayerChannelContext,
    items: Array<WatchItem | Playable>,
    start?: WatchItem | Playable | number,
  ) => {
    const playbackChannel = validChannel(context);
    const seed = unique(items.map(asPlayable).filter((item): item is Playable => Boolean(item)));
    if (!playbackChannel || !seed.length) return;
    let now: Playable | undefined;
    if (typeof start === "number") {
      now = seed[Math.min(seed.length - 1, Math.max(0, Math.round(start)))];
    } else if (start) {
      const requested = asPlayable(start);
      now = requested ? seed.find((item) => item.key === requested.key) ?? requested : undefined;
      if (now && !seed.some((item) => item.key === now!.key)) seed.unshift(now);
    }
    now ??= seed[0];
    if (!now) return;
    queueRefillBlockedKeyRef.current = null;
    requestRef.current += 1;
    setSeekRequest(null);
    const prior = currentRef.current;
    if (prior && prior.key !== now.key) remember(prior);
    channelRef.current = playbackChannel;
    channelItemsRef.current = seed;
    setChannel(playbackChannel);
    setChannelItems(seed);
    const nextQueue = channelOrder(seed, now.key);
    commitQueue(nextQueue);
    setFocusedPlayable(now);
    if (autoplayModeRef.current === "off") commitAutoplayMode("queue");
    setMode("theater");
    setQueueOpen(false);
  }, [commitAutoplayMode, commitQueue, remember, setFocusedPlayable]);

  const removeTile = useCallback((id: string) => {
    const previous = tilesRef.current;
    const removed = previous.find((tile) => tile.id === id);
    const next = positionTiles(previous.filter((tile) => tile.id !== id), presetRef.current, columnsRef.current);
    tilesRef.current = next;
    setTiles(next);
    if (removed) remember(removed.item);
    if (focusedRef.current === id) {
      const successor = next[0] ?? null;
      focusedRef.current = successor?.id ?? null;
      currentRef.current = successor?.item ?? null;
      setFocusedTileId(successor?.id ?? null);
      setCurrent(successor?.item ?? null);
    }
    setMaximizedTileId((value) => value === id ? null : value);
  }, [remember]);

  const replaceTile = useCallback((id: string, item: WatchItem | Playable) => {
    const playable = asPlayable(item);
    if (!playable) return;
    const duplicate = tilesRef.current.find((tile) => tile.item.key === playable.key);
    if (duplicate && duplicate.id !== id) {
      focusTile(duplicate.id);
      return;
    }
    const replaced = tilesRef.current.find((tile) => tile.id === id);
    if (!replaced) return;
    if (queueRef.current.some((entry) => entry.key === playable.key)) {
      commitQueue((items) => items.filter((entry) => entry.key !== playable.key));
    }
    remember(replaced.item);
    const next = tilesRef.current.map((tile) => tile.id === id ? { ...tile, item: playable } : tile);
    tilesRef.current = next;
    setTiles(next);
    if (focusedRef.current === id) {
      currentRef.current = playable;
      setCurrent(playable);
    }
  }, [commitQueue, focusTile, remember]);

  const updateTile = useCallback((id: string, patch: Partial<Omit<WorkspaceTile, "id" | "item">>) => {
    const nextTiles = tilesRef.current.map((tile) => {
      const next = (() => {
        if (tile.id !== id) return tile;
        const col = Math.min(columnsRef.current, Math.max(1, Math.round(patch.col ?? tile.col)));
        const colSpan = Math.min(columnsRef.current - col + 1, Math.max(1, Math.round(patch.colSpan ?? tile.colSpan)));
        const row = Math.min(columnsRef.current, Math.max(1, Math.round(patch.row ?? tile.row)));
        const rowSpan = Math.min(
          columnsRef.current - row + 1,
          Math.max(1, Math.round(patch.rowSpan ?? tile.rowSpan)),
        );
        return {
          ...tile,
          ...patch,
          col,
          colSpan,
          row,
          rowSpan,
          // Legacy grid controls still have a valid v3 representation. A
          // Studio `rect` draft is left intact and normalized on atomic apply.
          rect: patch.rect ?? gridTileToNormalizedRect({ col, row, colSpan, rowSpan }, columnsRef.current, columnsRef.current),
          volume: Math.min(1, Math.max(0, patch.volume ?? tile.volume)),
          delaySeconds: Math.min(7_200, Math.max(0, Math.round(patch.delaySeconds ?? tile.delaySeconds))),
        };
      })();
      if (patch.muted === false && !mixAudio && tile.id !== id) return { ...next, muted: true };
      return next;
    });
    tilesRef.current = nextTiles;
    setTiles(nextTiles);
    if (patch.muted === false) focusTile(id);
    if (Object.keys(patch).some((key) => ["col", "row", "colSpan", "rowSpan"].includes(key))) {
      presetRef.current = "freeform";
      setLayoutPreset("freeform");
    }
  }, [focusTile, mixAudio]);

  const swapTiles = useCallback((firstId: string, secondId: string) => {
    if (firstId === secondId) return;
    const first = tilesRef.current.find((tile) => tile.id === firstId);
    const second = tilesRef.current.find((tile) => tile.id === secondId);
    if (!first || !second) return;
    const firstPosition = { col: first.col, row: first.row, colSpan: first.colSpan, rowSpan: first.rowSpan, rect: first.rect };
    const secondPosition = { col: second.col, row: second.row, colSpan: second.colSpan, rowSpan: second.rowSpan, rect: second.rect };
    const next = tilesRef.current.map((tile) => tile.id === firstId
      ? { ...tile, ...secondPosition }
      : tile.id === secondId
        ? { ...tile, ...firstPosition }
        : tile);
    tilesRef.current = next;
    setTiles(next);
    presetRef.current = "freeform";
    setLayoutPreset("freeform");
  }, []);

  const applyPreset = useCallback((preset: WorkspacePreset) => {
    presetRef.current = preset;
    setLayoutPreset(preset);
    const next = positionTiles(tilesRef.current, preset, columnsRef.current);
    tilesRef.current = next;
    setTiles(next);
  }, []);

  const setGridColumns = useCallback((columns: number) => {
    const next = Math.min(12, Math.max(4, Math.round(columns)));
    const previous = columnsRef.current;
    columnsRef.current = next;
    workspaceGeometryRef.current = { ...workspaceGeometryRef.current, snapDensity: next };
    setGridColumnsState(next);
    setSnapDensityState(next);
    const nextTiles = tilesRef.current.map((tile) => {
      const col = Math.min(next, Math.max(1, Math.round((tile.col - 1) * next / previous) + 1));
      const colSpan = Math.min(next - col + 1, Math.max(1, Math.round(tile.colSpan * next / previous)));
      return {
        ...tile,
        col,
        colSpan,
        rect: gridTileToNormalizedRect({ col, row: tile.row, colSpan, rowSpan: tile.rowSpan }, next, next),
      };
    });
    tilesRef.current = nextTiles;
    setTiles(nextTiles);
    presetRef.current = "freeform";
    setLayoutPreset("freeform");
  }, []);

  const setMixAudio = useCallback((value: boolean) => {
    const nextValue = Boolean(value);
    mixAudioRef.current = nextValue;
    setMixAudioState(nextValue);
    if (!nextValue) {
      const focus = focusedRef.current;
      const next = tilesRef.current.map((tile) => ({ ...tile, muted: tile.id !== focus }));
      tilesRef.current = next;
      setTiles(next);
    }
  }, []);

  const muteAll = useCallback(() => {
    const next = tilesRef.current.map((tile) => ({ ...tile, muted: true }));
    tilesRef.current = next;
    setTiles(next);
  }, []);

  const setMaxActivePlayers = useCallback((value: number) => {
    const next = Math.min(multiviewTileLimit, 8, Math.max(1, Math.round(value)));
    maxActivePlayersRef.current = next;
    setMaxActivePlayersState(next);
  }, [multiviewTileLimit]);

  const setChatChannels = useCallback((channels: string[]) => {
    const next = Array.from(new Set(channels.map((channel) => channel.trim().toLowerCase()).filter(Boolean))).slice(0, multiviewTileLimit);
    chatChannelsRef.current = next;
    setChatChannelsState(next);
  }, [multiviewTileLimit]);

  const setChatMode = useCallback((value: ChatViewMode) => {
    chatModeRef.current = value;
    setChatModeState(value);
  }, []);

  const setChatFocusedLogin = useCallback((value: string | null) => {
    const next = value ? value.trim().toLowerCase().slice(0, 80) : null;
    chatFocusedLoginRef.current = next;
    setChatFocusedLoginState(next);
  }, []);

  const setChatTextScale = useCallback((value: number) => {
    if (!Number.isFinite(value)) return;
    const next = Math.max(0.7, Math.min(1.8, value));
    chatTextScaleRef.current = next;
    setChatTextScaleState(next);
  }, []);

  const setShowChatTimestamps = useCallback((value: boolean) => {
    const next = Boolean(value);
    showChatTimestampsRef.current = next;
    setShowChatTimestampsState(next);
  }, []);

  const setChatDockSize = useCallback((patch: Partial<ChatDockSize>) => {
    const current = chatDockSizeRef.current;
    const next = {
      side: Math.max(280, Math.min(520, Math.round(patch.side ?? current.side))),
      bottom: Math.max(220, Math.min(560, Math.round(patch.bottom ?? current.bottom))),
      floatingWidth: Math.max(280, Math.min(560, Math.round(patch.floatingWidth ?? current.floatingWidth))),
      floatingHeight: Math.max(320, Math.min(760, Math.round(patch.floatingHeight ?? current.floatingHeight))),
      floatingX: Math.max(8, Math.min(2_000, Math.round(patch.floatingX ?? current.floatingX))),
      floatingY: Math.max(8, Math.min(2_000, Math.round(patch.floatingY ?? current.floatingY))),
    } satisfies ChatDockSize;
    chatDockSizeRef.current = next;
    setChatDockSizeState(next);
  }, []);

  const fillWithLive = useCallback((items: Array<WatchItem | Playable>, options?: { limit?: number }) => {
    const live = items
      .map(asPlayable)
      .filter((item): item is Playable => Boolean(item && item.kind === "live"));
    if (!live.length) return;
    const roomLimit = effectiveMultiviewFillLimit(multiviewTileLimit, options?.limit);
    const previous = tilesRef.current
      .slice(0, roomLimit)
      // A room can be restored with its former audio lead unmuted. That
      // prevents browser autoplay on a fresh visit, leaving the provider on
      // its Play screen. Auto-filled live rooms always boot muted; the user
      // can deliberately take audio once every feed is already running.
      .map((tile) => tile.item.kind === "live" && !tile.muted ? { ...tile, muted: true } : tile);
    const seen = new Set(previous.map((tile) => tile.item.key));
    const additions = live
      .filter((item) => !seen.has(item.key))
      .slice(0, Math.max(0, roomLimit - previous.length));
    const combined = [
      ...previous,
      // Browser autoplay policies reliably allow muted starts only. Keep the
      // room's focused tile visible as the audio lead, but start every
      // automatically-filled live stream muted so Twitch/YouTube can render
      // and play immediately without a provider-side Play click.
      ...additions.map((item, index) => makeTile(item, previous.length + index, true)),
    ];
    // A newly populated room is always Theater-first. Subsequent live fills
    // preserve a viewer's selected preset or freeform canvas instead of
    // snapping their room back to a generic grid.
    const preset: WorkspacePreset = previous.length ? presetRef.current : "theater-first";
    const next = positionTiles(combined, preset, columnsRef.current);
    tilesRef.current = next;
    setTiles(next);
    if (!previous.length && next[0]) {
      focusedRef.current = next[0].id;
      currentRef.current = next[0].item;
      setFocusedTileId(next[0].id);
      setCurrent(next[0].item);
      // A fresh live room opens like Theater: streams first, with its
      // combined conversation immediately available in the right dock. A
      // saved or already-configured room keeps the viewer's chosen placement.
      if (chatDockRef.current === "closed") {
        chatDockRef.current = "right";
        setChatDockState("right");
      }
    }
    presetRef.current = preset;
    setLayoutPreset(preset);
  }, [multiviewTileLimit]);

  const fetchFreshQueue = useCallback((): Promise<{ items: Playable[]; generation: number }> => {
    const active = currentRef.current;
    const contextKey = [
      active?.key ?? "",
      active?.memberSlug ?? "",
      active?.platform ?? "",
      active?.format ?? "",
      autoplayModeRef.current,
    ].join("\u001f");
    if (queueFetchRef.current?.contextKey === contextKey) return queueFetchRef.current.request;
    const generation = queueGenerationRef.current;
    const request = (async () => {
      try {
        const excluded = [
          ...historyRef.current.map((entry) => entry.key),
          ...tilesRef.current.map((tile) => tile.item.key),
        ].slice(-50);
        const query = new URLSearchParams();
        if (excluded.length) query.set("exclude", excluded.join(","));
        query.set("mode", autoplayModeRef.current);
        if (active?.key) query.set("from", active.key);
        if (active?.memberSlug) query.set("member", active.memberSlug);
        if (active?.platform) query.set("platform", active.platform);
        if (active?.format) query.set("format", active.format);
        const response = await fetch(`/api/watch/queue?${query}`, { credentials: "same-origin" });
        if (!response.ok) throw new Error("queue_unavailable");
        const data = await response.json() as { items?: Playable[] };
        const blocked = new Set([
          ...historyRef.current.map((entry) => entry.key),
          ...tilesRef.current.map((tile) => tile.item.key),
        ]);
        return {
          items: unique(data.items ?? [], blocked).slice(0, MAX_RECOMMENDATION_QUEUE),
          generation,
        };
      } catch {
        return { items: [], generation };
      }
    })();
    const pending = { contextKey, request };
    queueFetchRef.current = pending;
    void request.finally(() => {
      if (queueFetchRef.current === pending) queueFetchRef.current = null;
    });
    return request;
  }, []);

  const skip = useCallback(() => {
    const prior = currentRef.current;
    if (prior) remember(prior);
    const head = takeQueueHead();
    if (head) {
      setFocusedPlayable(head);
      return;
    }
    const channelSeed = channelItemsRef.current;
    if (prior && channelRef.current && channelSeed.length > 1) {
      const [next, ...rest] = channelOrder(channelSeed, prior.key);
      if (next) {
        setFocusedPlayable(next);
        commitQueue(rest);
        return;
      }
    }
    if (autoplayModeRef.current === "off") {
      const focus = focusedRef.current;
      if (focus) removeTile(focus);
      else setCurrent(null);
      setQueueOpen(false);
      return;
    }
    const expectedKey = prior?.key ?? null;
    void fetchFreshQueue().then(({ items: fresh, generation }) => {
      if ((currentRef.current?.key ?? null) !== expectedKey) return;
      const queued = takeQueueHead();
      if (queued) {
        setFocusedPlayable(queued);
        return;
      }
      if (generation !== queueGenerationRef.current) {
        const focus = focusedRef.current;
        if (focus) removeTile(focus);
        else setCurrent(null);
        setQueueOpen(false);
        return;
      }
      const [next, ...rest] = fresh;
      if (next) setFocusedPlayable(next);
      else {
        const focus = focusedRef.current;
        if (focus) removeTile(focus);
      }
      commitQueue(rest);
      if (!next) setQueueOpen(false);
    });
  }, [commitQueue, fetchFreshQueue, remember, removeTile, setFocusedPlayable, takeQueueHead]);

  const finishTile = useCallback((id: string) => {
    const isFocus = focusedRef.current === id;
    if (autoplayModeRef.current === "off") {
      removeTile(id);
      return;
    }
    const canConsumeQueue = isFocus || autoplayModeRef.current === "keep-grid-full";
    const head = canConsumeQueue ? takeQueueHead() : null;
    if (head && (isFocus || autoplayModeRef.current === "keep-grid-full")) {
      remember(tilesRef.current.find((tile) => tile.id === id)?.item ?? null);
      replaceTile(id, head);
      return;
    }
    if (autoplayModeRef.current === "keep-grid-full") {
      const expectedKey = tilesRef.current.find((tile) => tile.id === id)?.item.key;
      void fetchFreshQueue().then(({ items: fresh, generation }) => {
        if (!expectedKey || tilesRef.current.find((tile) => tile.id === id)?.item.key !== expectedKey) return;
        const queued = takeQueueHead();
        if (queued) {
          replaceTile(id, queued);
          return;
        }
        if (generation !== queueGenerationRef.current) {
          removeTile(id);
          return;
        }
        const [next, ...rest] = fresh;
        if (next) replaceTile(id, next);
        else removeTile(id);
        commitQueue(rest);
      });
      return;
    }
    if (isFocus) skip();
    else removeTile(id);
  }, [commitQueue, fetchFreshQueue, remember, removeTile, replaceTile, skip, takeQueueHead]);

  const previous = useCallback(() => {
    requestRef.current += 1;
    const priorItems = historyRef.current;
    const prior = priorItems[priorItems.length - 1];
    if (!prior) return;
    const now = currentRef.current;
    const nextHistory = priorItems.slice(0, -1);
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    setFocusedPlayable(prior);
    if (now) {
      const nextQueue = unique([now, ...queueRef.current], new Set([prior.key]));
      commitQueue(nextQueue);
    }
  }, [commitQueue, setFocusedPlayable]);

  const navigateShortForm = useCallback((direction: ShortFormNavigationDirection) => {
    const prior = currentRef.current;
    if (!prior) return false;
    const tunedSeed = channelRef.current
      && channelItemsRef.current.some((item) => item.key === prior.key)
      ? channelItemsRef.current
      : null;
    const seed = tunedSeed ?? unique([
      ...historyRef.current,
      prior,
      ...queueRef.current,
    ]);
    const target = shortFormNavigationTarget(seed, prior.key, direction);
    if (!target || target.item.key === prior.key) return false;
    requestRef.current += 1;
    remember(prior);
    setFocusedPlayable(target.item);
    commitQueue(channelOrder(
      tunedSeed ?? shortFormNavigationItems(seed),
      target.item.key,
    ));
    return true;
  }, [commitQueue, remember, setFocusedPlayable]);

  const stop = useCallback(() => {
    requestRef.current += 1;
    tilesRef.current.forEach((tile) => remember(tile.item));
    channelRef.current = null;
    channelItemsRef.current = [];
    setCurrent(null);
    currentRef.current = null;
    setTiles([]);
    tilesRef.current = [];
    setFocusedTileId(null);
    focusedRef.current = null;
    setMaximizedTileId(null);
    commitQueue([]);
    setChannel(null);
    setChannelItems([]);
    setSeekRequest(null);
    setQueueOpen(false);
    setMode("mini");
  }, [commitQueue, remember]);

  const refill = useCallback((items: Playable[], options?: { channelId?: string }) => {
    const requestedChannelId = options?.channelId?.trim();
    if (requestedChannelId) {
      const activeChannel = channelRef.current;
      const activeItem = currentRef.current;
      const previousItems = channelItemsRef.current;
      if (
        activeChannel?.id !== requestedChannelId
        || !activeItem
        || !previousItems.some((item) => item.key === activeItem.key)
      ) return;
      const refreshedItems = unique(items);
      if (!refreshedItems.length) return;
      const merged = mergeRefreshedChannelItems(previousItems, refreshedItems, activeItem.key);
      channelItemsRef.current = merged;
      setChannelItems(merged);
      commitQueue(channelOrder(merged, activeItem.key));
      return;
    }
    if (
      !items.length
      || channelRef.current
      || queueRefillBlockedKeyRef.current === currentRef.current?.key
    ) return;
    commitQueue((previous) => {
      const blocked = new Set([
        ...historyRef.current.map((entry) => entry.key),
        ...tilesRef.current.map((tile) => tile.item.key),
      ]);
      return liveFirst(unique([...previous, ...items], blocked)).slice(0, MAX_RECOMMENDATION_QUEUE);
    });
  }, [commitQueue]);

  const addToQueue = useCallback((item: WatchItem | Playable, position: "next" | "end" = "end") => {
    const playable = asPlayable(item);
    if (
      !playable
      || tilesRef.current.some((tile) => tile.item.key === playable.key)
      || queueRef.current.some((entry) => entry.key === playable.key)
    ) return false;
    commitQueue((items) => {
      return position === "next" ? [playable, ...items] : [...items, playable];
    });
    if (autoplayModeRef.current === "off") commitAutoplayMode("queue");
    return true;
  }, [commitAutoplayMode, commitQueue]);

  const clearQueue = useCallback(() => {
    queueRefillBlockedKeyRef.current = currentRef.current?.key ?? null;
    commitQueue([]);
  }, [commitQueue]);

  const replaceQueue = useCallback((items: Playable[]) => {
    const blocked = new Set<string>([
      ...(currentRef.current ? [currentRef.current.key] : []),
      ...tilesRef.current.map((tile) => tile.item.key),
    ]);
    queueRefillBlockedKeyRef.current = currentRef.current?.key ?? null;
    commitQueue(unique(items, blocked).slice(0, MAX_RECOMMENDATION_QUEUE));
  }, [commitQueue]);

  const removeFromQueue = useCallback((key: string) => {
    commitQueue((items) => items.filter((item) => item.key !== key));
  }, [commitQueue]);

  const moveQueueItem = useCallback((key: string, direction: -1 | 1) => {
    commitQueue((items) => {
      const index = items.findIndex((item) => item.key === key);
      const destination = index + direction;
      if (index < 0 || destination < 0 || destination >= items.length) return items;
      const next = [...items];
      const [moved] = next.splice(index, 1);
      if (!moved) return items;
      next.splice(destination, 0, moved);
      return next;
    });
  }, [commitQueue]);

  const playFromQueue = useCallback((key: string) => {
    requestRef.current += 1;
    const items = queueRef.current;
    const index = items.findIndex((item) => item.key === key);
    if (index < 0) return;
    const chosen = items[index];
    if (!chosen) return;
    remember(currentRef.current);
    setFocusedPlayable(chosen);
    const next = [...items.slice(index + 1), ...items.slice(0, index)];
    commitQueue(next);
    setQueueOpen(false);
  }, [commitQueue, remember, setFocusedPlayable]);

  const setAutoplayMode = useCallback((value: AutoplayMode) => {
    commitAutoplayMode(value);
  }, [commitAutoplayMode]);

  const setAutoplay = useCallback((value: boolean) => {
    commitAutoplayMode(value ? "live-first" : "off");
  }, [commitAutoplayMode]);

  const requestSeek = useCallback((seconds: number) => {
    const active = currentRef.current;
    if (!active || !Number.isFinite(seconds)) return;
    requestRef.current += 1;
    setSeekRequest({
      itemKey: active.key,
      seconds: Math.max(0, seconds),
      requestId: requestRef.current,
    });
  }, []);

  const setPlaybackRate = useCallback((value: number) => {
    if (!Number.isFinite(value)) return;
    const next = Math.min(2, Math.max(0.5, value));
    playbackRateRef.current = next;
    setPlaybackRateState(next);
  }, []);

  const applyAccessibilityPreset = useCallback((value: AccessibilityPreset) => {
    setAccessibilityPreset(value);
    if (value === "standard") {
      setCaptionsEnabled(false);
      setAudioDescription(false);
      setPlaybackRate(1);
      return;
    }
    if (value === "captions") {
      setCaptionsEnabled(true);
      setAudioDescription(false);
      return;
    }
    if (value === "audio-description") {
      setAudioDescription(true);
      return;
    }
    setCaptionsEnabled(true);
    setAudioDescription(false);
    setPlaybackRate(0.9);
    setPreviewAutoplay(false);
    setPreviewSoundEnabled(true);
  }, [setPlaybackRate, setPreviewSoundEnabled]);

  const workspaceSnapshot = useCallback((name = "My layout"): WorkspaceSnapshot => {
    const geometry = workspaceGeometryRef.current;
    const snapshot = {
      version: WORKSPACE_SNAPSHOT_VERSION,
      name: name.trim().slice(0, 80) || "My layout",
      preset: presetRef.current,
      columns: columnsRef.current,
      focusedTileId: focusedRef.current,
      chatDock: chatDockRef.current,
      chatChannels: [...chatChannelsRef.current],
      chatMode: chatModeRef.current,
      chatFocusedLogin: chatFocusedLoginRef.current,
      chatTextScale: chatTextScaleRef.current,
      showChatTimestamps: showChatTimestampsRef.current,
      chatDockSize: { ...chatDockSizeRef.current },
      snapDensity: geometry.snapDensity,
      chatFloatingRect: { ...geometry.chatFloatingRect },
      mixAudio: mixAudioRef.current,
      maxActivePlayers: maxActivePlayersRef.current,
      autoplayMode: autoplayModeRef.current,
      dataSaver: dataSaverRef.current,
      captionsEnabled: captionsEnabledRef.current,
      playbackRate: playbackRateRef.current,
      qualityPreference: qualityPreferenceRef.current,
      tiles: tilesRef.current,
      updatedAt: new Date().toISOString(),
    } as WorkspaceSnapshot & WorkspaceSnapshotExtensions;
    return cloneWorkspaceSnapshot(snapshot) as WorkspaceSnapshot;
  }, []);

  /**
   * Commit every room field together. This is deliberately the only bulk
   * import path: it updates refs before state so an immediate Save/Share sees
   * the finished layout, and it never loops through `updateTile`.
   */
  const applyWorkspaceLayout = useCallback((
    snapshot: WorkspaceSnapshot,
    options?: ApplyWorkspaceLayoutOptions,
  ): boolean => {
    const normalized = normalizeWorkspace(cloneWorkspaceSnapshot(snapshot));
    if (!normalized) return false;
    const extended = normalized as WorkspaceSnapshot & WorkspaceSnapshotExtensions;
    const allowedTiles = clampMultiviewItems(normalized.tiles, multiviewTileLimit);
    // v3 carries normalized rectangles. Keep those exact geometry values
    // instead of recalculating the legacy grid positions during an import.
    const hasNormalizedGeometry = allowedTiles.some((tile) => "rect" in (tile as object));
    const positionedTiles = normalized.preset === "freeform" || hasNormalizedGeometry
      ? allowedTiles
      : positionTiles(allowedTiles, normalized.preset, normalized.columns);
    const nextTiles = reconcileWorkspaceTiles(tilesRef.current, positionedTiles);
    const nextFocus = nextTiles.some((tile) => tile.id === normalized.focusedTileId)
      ? normalized.focusedTileId
      : nextTiles[0]?.id ?? null;
    const nextCurrent = nextTiles.find((tile) => tile.id === nextFocus)?.item
      ?? nextTiles[0]?.item
      ?? null;
    const nextMixAudio = typeof extended.mixAudio === "boolean"
      ? extended.mixAudio
      : mixAudioRef.current;
    const nextMaxActivePlayers = Math.min(
      multiviewTileLimit,
      8,
      Math.max(1, Math.round(extended.maxActivePlayers ?? maxActivePlayersRef.current)),
    );
    const nextAutoplayMode = ["off", "queue", "same-creator", "similar", "live-first", "keep-grid-full"].includes(
      extended.autoplayMode ?? "",
    )
      ? extended.autoplayMode as AutoplayMode
      : autoplayModeRef.current;
    const nextDataSaver = typeof extended.dataSaver === "boolean"
      ? extended.dataSaver
      : dataSaverRef.current;
    const nextCaptionsEnabled = typeof extended.captionsEnabled === "boolean"
      ? extended.captionsEnabled
      : captionsEnabledRef.current;
    const nextPlaybackRate = Number.isFinite(extended.playbackRate)
      ? Math.min(2, Math.max(0.5, Number(extended.playbackRate)))
      : playbackRateRef.current;
    const nextQualityPreference = ["auto", "best", "balanced", "data-saver"].includes(
      extended.qualityPreference ?? "",
    )
      ? extended.qualityPreference as QualityPreference
      : qualityPreferenceRef.current;
    const candidateGeometry = extended.chatFloatingRect;
    const nextGeometry = candidateGeometry
      && [candidateGeometry.x, candidateGeometry.y, candidateGeometry.width, candidateGeometry.height].every(Number.isFinite)
      ? {
          snapDensity: Math.min(24, Math.max(4, Math.round(extended.snapDensity ?? workspaceGeometryRef.current.snapDensity))),
          chatFloatingRect: {
            x: Math.min(1, Math.max(0, candidateGeometry.x)),
            y: Math.min(1, Math.max(0, candidateGeometry.y)),
            width: Math.min(1, Math.max(0.12, candidateGeometry.width)),
            height: Math.min(1, Math.max(0.18, candidateGeometry.height)),
          },
        }
      : {
          ...workspaceGeometryRef.current,
          snapDensity: Math.min(24, Math.max(4, Math.round(extended.snapDensity ?? workspaceGeometryRef.current.snapDensity))),
        };
    const nextChatDockSize = { ...normalized.chatDockSize };
    const nextChatChannels = normalized.chatChannels.slice(0, multiviewTileLimit);
    const nextMaximized = options?.preserveMaximized
      && maximizedTileRef.current
      && nextTiles.some((tile) => tile.id === maximizedTileRef.current)
      ? maximizedTileRef.current
      : null;

    requestRef.current += 1;
    tilesRef.current = nextTiles;
    focusedRef.current = nextFocus;
    currentRef.current = nextCurrent;
    presetRef.current = normalized.preset;
    columnsRef.current = normalized.columns;
    mixAudioRef.current = nextMixAudio;
    maxActivePlayersRef.current = nextMaxActivePlayers;
    autoplayModeRef.current = nextAutoplayMode;
    dataSaverRef.current = nextDataSaver;
    captionsEnabledRef.current = nextCaptionsEnabled;
    playbackRateRef.current = nextPlaybackRate;
    qualityPreferenceRef.current = nextQualityPreference;
    chatDockRef.current = normalized.chatDock;
    chatChannelsRef.current = nextChatChannels;
    chatModeRef.current = normalized.chatMode;
    chatFocusedLoginRef.current = normalized.chatFocusedLogin;
    chatTextScaleRef.current = normalized.chatTextScale;
    showChatTimestampsRef.current = normalized.showChatTimestamps;
    chatDockSizeRef.current = nextChatDockSize;
    workspaceGeometryRef.current = nextGeometry;
    maximizedTileRef.current = nextMaximized;

    setSeekRequest(null);
    setTiles(nextTiles);
    setFocusedTileId(nextFocus);
    setCurrent(nextCurrent);
    setLayoutPreset(normalized.preset);
    setGridColumnsState(normalized.columns);
    setSnapDensityState(nextGeometry.snapDensity);
    setMixAudioState(nextMixAudio);
    setMaxActivePlayersState(nextMaxActivePlayers);
    setAutoplayModeState(nextAutoplayMode);
    setDataSaverState(nextDataSaver);
    setCaptionsEnabledState(nextCaptionsEnabled);
    setPlaybackRateState(nextPlaybackRate);
    setQualityPreferenceState(nextQualityPreference);
    setChatDockState(normalized.chatDock);
    setChatChannelsState(nextChatChannels);
    setChatModeState(normalized.chatMode);
    setChatFocusedLoginState(normalized.chatFocusedLogin);
    setChatTextScaleState(normalized.chatTextScale);
    setShowChatTimestampsState(normalized.showChatTimestamps);
    setChatDockSizeState(nextChatDockSize);
    setChatFloatingRectState({ ...nextGeometry.chatFloatingRect });
    setMaximizedTileIdState(nextMaximized);
    return true;
  }, [multiviewTileLimit]);

  const applyWorkspaceDraft = useCallback((
    draft: WorkspaceLayoutDraft,
    options?: ApplyWorkspaceLayoutOptions,
  ): boolean => {
    const current = workspaceSnapshot("Room edit") as WorkspaceSnapshot & WorkspaceSnapshotExtensions;
    const draftGeometry = draft.chatFloatingRect;
    const currentGeometry = current.chatFloatingRect ?? workspaceGeometryRef.current.chatFloatingRect;
    const next = {
      ...current,
      ...draft,
      // A draft never changes its identity or schema version; those belong to
      // save/share boundaries, not an in-progress Room Studio adjustment.
      version: current.version,
      name: current.name,
      updatedAt: current.updatedAt,
      chatDockSize: draft.chatDockSize
        ? { ...current.chatDockSize, ...draft.chatDockSize }
        : current.chatDockSize,
      chatFloatingRect: draftGeometry
        ? { ...currentGeometry, ...draftGeometry }
        : currentGeometry,
    } as WorkspaceSnapshot & WorkspaceSnapshotExtensions;
    return applyWorkspaceLayout(next, options);
  }, [applyWorkspaceLayout, workspaceSnapshot]);

  const importWorkspace = useCallback((snapshot: WorkspaceSnapshot) => {
    void applyWorkspaceLayout(snapshot);
  }, [applyWorkspaceLayout]);

  const shareWorkspace = useCallback((name?: string) => encodeWorkspace(workspaceSnapshot(name)), [workspaceSnapshot]);

  const saveLayout = useCallback(async (name: string) => {
    if (!savedLayoutSyncAllowed) return;
    const snapshot = workspaceSnapshot(name);
    const key = snapshot.name.toLowerCase();
    layoutLocalWritesRef.current.set(key, Date.now());
    const tombstones = localLayoutTombstones();
    delete tombstones[key];
    writeLayoutTombstones(tombstones);
    commitSavedLayouts([
      { ...snapshot, remote: false },
      ...savedLayoutsRef.current.filter((entry) => entry.name.toLowerCase() !== key),
    ]);
    await enqueueLayoutMutation(snapshot.name, async () => {
      const response = await fetch("/api/account/workspaces", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "watch", name: snapshot.name, payload: snapshot }),
      });
      if (!response.ok) throw new Error("layout_save_failed");
      const payload = await response.json().catch(() => null) as { item?: { updatedAt?: string } } | null;
      const serverUpdatedAt = payload?.item?.updatedAt;
      const next = savedLayoutsRef.current.map((entry) => (
        entry.name.toLowerCase() === key && entry.updatedAt === snapshot.updatedAt
          ? {
              ...entry,
              remote: true,
              updatedAt: typeof serverUpdatedAt === "string" && Number.isFinite(Date.parse(serverUpdatedAt))
                ? serverUpdatedAt
                : entry.updatedAt,
            }
          : entry
      ));
      commitSavedLayouts(next);
    }).catch(() => undefined);
  }, [commitSavedLayouts, enqueueLayoutMutation, savedLayoutSyncAllowed, workspaceSnapshot]);

  const loadLayout = useCallback((name: string) => {
    const layout = savedLayouts.find((entry) => entry.name === name);
    if (layout) importWorkspace(layout);
  }, [importWorkspace, savedLayouts]);

  const deleteLayout = useCallback(async (name: string) => {
    const key = name.toLowerCase();
    const tombstone = { name, deletedAt: new Date().toISOString() };
    const tombstones = { ...localLayoutTombstones(), [key]: tombstone };
    writeLayoutTombstones(tombstones);
    commitSavedLayouts(savedLayoutsRef.current.filter((entry) => entry.name.toLowerCase() !== key));
    await enqueueLayoutMutation(name, async () => {
      const query = new URLSearchParams({ kind: "watch", name });
      const response = await fetch(`/api/account/workspaces?${query}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("layout_delete_failed");
      const current = localLayoutTombstones();
      if (current[key]?.deletedAt === tombstone.deletedAt) {
        delete current[key];
        writeLayoutTombstones(current);
      }
    }).catch(() => undefined);
  }, [commitSavedLayouts, enqueueLayoutMutation]);

  const focusedTile = tiles.find((tile) => tile.id === focusedTileId) ?? null;
  const autoplay = autoplayMode !== "off";
  // A tuned channel can remain available while another Multiview tile is in
  // focus. Only expose it as active when the focused item belongs to that
  // channel, so unrelated tiles never inherit its label or watermark.
  const activeChannel = useMemo(() => {
    if (!channel || !current) return null;
    return channelItems.some((item) => item.key === current.key) ? channel : null;
  }, [channel, channelItems, current]);
  const shortFormSeed = useMemo(() => (
    activeChannel
      ? channelItems
      : unique([
          ...history,
          ...(current ? [current] : []),
          ...queue,
        ])
  ), [activeChannel, channelItems, current, history, queue]);
  const shortFormNavigation = useMemo(() => shortFormNavigationPosition(
    shortFormSeed,
    current?.key,
  ), [current?.key, shortFormSeed]);
  const shortFormPreloads = useMemo(() => shortFormPreloadItems(
    shortFormSeed,
    current?.key,
    MAX_SHORT_FORM_PRELOAD_ITEMS,
  ), [current?.key, shortFormSeed]);

  const value = useMemo<PlayerContextValue>(() => ({
    current,
    ready,
    queue,
    nextUp: queue[0] ?? null,
    history,
    channel: activeChannel,
    seekRequest,
    autoplay,
    autoplayMode,
    previewAutoplay,
    previewSoundEnabled,
    previewVolume,
    activePreviewAudioId,
    dataSaver,
    ambientLighting,
    captionsEnabled,
    playbackRate,
    qualityPreference,
    audioDescription,
    accessibilityPreset,
    mode,
    queueOpen,
    companionView,
    play,
    playChannel,
    shortFormNavigation,
    shortFormPreloads,
    navigateShortForm,
    skip,
    previous,
    stop,
    minimize: () => setMode("mini"),
    expand: () => setMode("theater"),
    requestSeek,
    setAutoplay,
    setAutoplayMode,
    setPreviewAutoplay,
    setPreviewSoundEnabled,
    setPreviewVolume,
    claimPreviewAudio,
    releasePreviewAudio,
    setDataSaver,
    setAmbientLighting,
    setCaptionsEnabled,
    setPlaybackRate,
    setQualityPreference,
    setAudioDescription,
    applyAccessibilityPreset,
    setQueueOpen,
    setCompanionView,
    addToQueue,
    clearQueue,
    replaceQueue,
    removeFromQueue,
    moveQueueItem,
    playFromQueue,
    refill,
    tiles,
    focusedTileId,
    focusedTile,
    layoutPreset,
    gridColumns: gridColumnsState,
    snapDensity: snapDensityState,
    maximizedTileId,
    mixAudio,
    maxActivePlayers: maxActivePlayersState,
    chatDock,
    chatChannels,
    chatMode,
    chatFocusedLogin,
    chatTextScale,
    showChatTimestamps,
    chatDockSize,
    chatFloatingRect,
    savedLayouts,
    addTile,
    replaceTile,
    removeTile,
    finishTile,
    focusTile,
    updateTile,
    swapTiles,
    applyPreset,
    setGridColumns,
    setMaximizedTileId,
    setMixAudio,
    muteAll,
    setMaxActivePlayers,
    setChatDock,
    setChatChannels,
    setChatMode,
    setChatFocusedLogin,
    setChatTextScale,
    setShowChatTimestamps,
    setChatDockSize,
    fillWithLive,
    workspaceSnapshot,
    applyWorkspaceLayout,
    applyWorkspaceDraft,
    importWorkspace,
    shareWorkspace,
    saveLayout,
    loadLayout,
    deleteLayout,
  }), [
    accessibilityPreset, addTile, addToQueue, ambientLighting, applyAccessibilityPreset, applyPreset, audioDescription,
    activeChannel, autoplay, autoplayMode, captionsEnabled, chatChannels, chatDock, chatDockSize, chatFloatingRect, chatFocusedLogin, chatMode, chatTextScale, companionView, current,
    clearQueue, dataSaver, deleteLayout, fillWithLive, finishTile, focusTile, focusedTile,
    focusedTileId, gridColumnsState, history, importWorkspace, layoutPreset,
    loadLayout, maxActivePlayersState, maximizedTileId, mixAudio, mode, muteAll, playbackRate,
    moveQueueItem, navigateShortForm, play, playChannel, playFromQueue, previewAutoplay, previewSoundEnabled,
    previewVolume, activePreviewAudioId, previous, queue, queueOpen, refill, replaceQueue,
    qualityPreference, ready, removeFromQueue, removeTile, replaceTile, requestSeek,
    savedLayouts, saveLayout, seekRequest, setAutoplay, setPlaybackRate, setChatDockSize, setChatFocusedLogin, setChatMode, setChatTextScale, setShowChatTimestamps,
    setAutoplayMode, setChatChannels, setGridColumns, setMaxActivePlayers,
    setPreviewSoundEnabled, setPreviewVolume, claimPreviewAudio, releasePreviewAudio,
    setMixAudio, shareWorkspace, shortFormNavigation, shortFormPreloads, skip, stop, swapTiles, tiles, updateTile,
    showChatTimestamps, snapDensityState, workspaceSnapshot, applyWorkspaceLayout, applyWorkspaceDraft,
  ]);

  return <PlayerCtx.Provider value={value}>{children}</PlayerCtx.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerCtx);
  if (!ctx) throw new Error("usePlayer must be used inside PlayerProvider");
  return ctx;
}

export function usePlayerOptional() {
  return useContext(PlayerCtx);
}

export { catalogPlayables };
