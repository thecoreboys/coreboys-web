import type { Playable } from "./playable";
import type { ChatViewMode } from "@/lib/chat-layouts";
import {
  DEFAULT_ROOM_SNAP_DENSITY,
  LEGACY_FLOATING_REFERENCE_VIEWPORT,
  gridTileToNormalizedRect,
  normalizeRoomRect,
  normalizeSnapDensity,
  normalizedRectToGridPosition,
  presetNormalizedRects,
  solveRoomLayout,
  type NormalizedRect,
  type RoomLayoutPreset,
} from "./room-layout";

export type { NormalizedRect } from "./room-layout";

export type AutoplayMode =
  | "off"
  | "queue"
  | "same-creator"
  | "similar"
  | "live-first"
  | "keep-grid-full";

export type WorkspacePreset = RoomLayoutPreset;

export type ChatDockMode = "closed" | "left" | "right" | "bottom" | "floating";
export type ChatDockSize = {
  side: number;
  bottom: number;
  floatingWidth: number;
  floatingHeight: number;
  floatingX: number;
  floatingY: number;
};
export type PlayerFit = "contain" | "cover";

export type WorkspaceTile = {
  id: string;
  item: Playable;
  /**
   * v3 logical-board geometry. Legacy grid coordinates remain beside this
   * field while old runtime surfaces are migrated to the shared layout engine.
   */
  rect?: NormalizedRect;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  muted: boolean;
  volume: number;
  pinned: boolean;
  fit: PlayerFit;
  standby: boolean;
  /** Per-source start/delay offset. VODs seek forward; live tiles retain it as a sync hint. */
  delaySeconds: number;
};

export type WorkspaceSnapshotVersion = 2 | 3;

/**
 * A compatibility-friendly snapshot shape. New snapshots always normalize to
 * v3, while the v2 literal remains accepted at client boundaries until old
 * session/local-storage writers have naturally rotated out.
 */
export type WorkspaceSnapshot = {
  version: WorkspaceSnapshotVersion;
  name: string;
  preset: WorkspacePreset;
  /** Legacy grid column count, retained for older room renderers. */
  columns: number;
  /** v3 logical board snap density. */
  snapDensity?: number;
  focusedTileId: string | null;
  chatDock: ChatDockMode;
  chatChannels: string[];
  chatMode: ChatViewMode;
  chatFocusedLogin: string | null;
  chatTextScale: number;
  /** Message times are intentionally quiet by default. */
  showChatTimestamps: boolean;
  chatDockSize: ChatDockSize;
  /** v3 floating-chat coordinates, normalized to the room board. */
  chatFloatingRect?: NormalizedRect;
  /** Room-scoped audio and playback preferences. */
  mixAudio?: boolean;
  maxActivePlayers?: number;
  autoplayMode?: AutoplayMode;
  dataSaver?: boolean;
  captionsEnabled?: boolean;
  playbackRate?: number;
  qualityPreference?: "auto" | "best" | "balanced" | "data-saver";
  tiles: WorkspaceTile[];
  updatedAt: string;
};

export type NormalizedWorkspaceTile = WorkspaceTile & { rect: NormalizedRect };

/** The canonical v3 payload produced by normalize/decode/encode. */
export type NormalizedWorkspaceSnapshot = Omit<
  WorkspaceSnapshot,
  | "version"
  | "snapDensity"
  | "chatFloatingRect"
  | "mixAudio"
  | "maxActivePlayers"
  | "autoplayMode"
  | "dataSaver"
  | "captionsEnabled"
  | "playbackRate"
  | "qualityPreference"
  | "tiles"
> & {
  version: 3;
  snapDensity: number;
  chatFloatingRect: NormalizedRect;
  mixAudio: boolean;
  maxActivePlayers: number;
  autoplayMode: AutoplayMode;
  dataSaver: boolean;
  captionsEnabled: boolean;
  playbackRate: number;
  qualityPreference: "auto" | "best" | "balanced" | "data-saver";
  tiles: NormalizedWorkspaceTile[];
};

export const WORKSPACE_SNAPSHOT_VERSION = 3 as const;

export const DEFAULT_CHAT_DOCK_SIZE: ChatDockSize = {
  side: 368,
  bottom: 360,
  floatingWidth: 368,
  floatingHeight: 520,
  floatingX: 24,
  floatingY: 24,
};

export const DEFAULT_CHAT_FLOATING_RECT: NormalizedRect = {
  x: 0.727778,
  y: 0.328395,
  width: 0.255556,
  height: 0.641975,
};

export type SavedWorkspace = WorkspaceSnapshot & { remote?: boolean };

/**
 * Passport credit follows one intentional audio source in Multiview. Other
 * tiles still checkpoint resume state, but cannot reset the server's
 * single-credit playback cursor or multiply rewards.
 */
export function multiviewPassportCreditTileId(
  tiles: Pick<WorkspaceTile, "id" | "muted" | "standby">[],
  activeTileIds: Iterable<string>,
  focusedTileId: string | null,
): string | null {
  const active = new Set(activeTileIds);
  const eligible = (tile: Pick<WorkspaceTile, "id" | "muted" | "standby">) =>
    active.has(tile.id) && !tile.standby && !tile.muted;
  const focused = focusedTileId ? tiles.find((tile) => tile.id === focusedTileId) : null;
  return focused && eligible(focused) ? focused.id : tiles.find(eligible)?.id ?? null;
}

export const WORKSPACE_PRESETS: Array<{
  id: WorkspacePreset;
  label: string;
  description: string;
}> = [
  { id: "theater-first", label: "Theater first", description: "One cinematic main stream with companion views" },
  { id: "solo", label: "Solo", description: "One focused player" },
  { id: "split", label: "50 / 50", description: "Two equal players" },
  { id: "quad", label: "Quad", description: "Four equal players" },
  { id: "main-three", label: "Main + 3", description: "One large player with three sidecars" },
  { id: "three-two", label: "Director", description: "Six equal monitoring views" },
  { id: "portrait-wall", label: "Portrait wall", description: "Vertical-first tiles" },
  { id: "chat-first", label: "Chat first", description: "Players leave room for the chat dock" },
  { id: "freeform", label: "Freeform", description: "Resize and arrange every tile" },
];

export const AUTOPLAY_MODES: Array<{
  id: AutoplayMode;
  label: string;
  description: string;
}> = [
  { id: "off", label: "Off", description: "Stop when a title ends" },
  { id: "queue", label: "Queue", description: "Play the queue in order" },
  { id: "same-creator", label: "Same creator", description: "Favor the current member" },
  { id: "similar", label: "Similar", description: "Favor matching formats and platforms" },
  { id: "live-first", label: "Live first", description: "Move live streams ahead" },
  { id: "keep-grid-full", label: "Keep grid full", description: "Replace ended tiles automatically" },
];

const MAX_SHARE_TILES = 12;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function legacyBoardRows(tiles: readonly unknown[], fallback: number): number {
  let rows = fallback;
  for (const candidate of tiles) {
    if (!isRecord(candidate)) continue;
    const row = clampInt(candidate.row, 1, 96, 1);
    const span = clampInt(candidate.rowSpan, 1, 96, 2);
    rows = Math.max(rows, Math.min(96, row + span - 1));
  }
  return rows;
}

function legacyFloatingRect(size: ChatDockSize): NormalizedRect {
  const { width, height } = LEGACY_FLOATING_REFERENCE_VIEWPORT;
  // v2 uses right/bottom pixel offsets, whereas the v3 board records a
  // top-left normalized rectangle. Convert once at ingestion and clamp it.
  return normalizeRoomRect({
    x: (width - size.floatingX - size.floatingWidth) / width,
    y: (height - size.floatingY - size.floatingHeight) / height,
    width: size.floatingWidth / width,
    height: size.floatingHeight / height,
  }, DEFAULT_CHAT_FLOATING_RECT, { minWidth: 0.15, minHeight: 0.18 });
}

function normalizeAutoplayMode(value: unknown): AutoplayMode {
  return ["off", "queue", "same-creator", "similar", "live-first", "keep-grid-full"].includes(String(value))
    ? value as AutoplayMode
    : "live-first";
}

function normalizeQualityPreference(value: unknown): NormalizedWorkspaceSnapshot["qualityPreference"] {
  return ["auto", "best", "balanced", "data-saver"].includes(String(value))
    ? value as NormalizedWorkspaceSnapshot["qualityPreference"]
    : "auto";
}

/**
 * Keep Playable payloads crossing a share/session boundary narrow and safe.
 * Watch-together rooms reuse this exact trust boundary so a peer cannot smuggle
 * arbitrary iframe URLs or oversized metadata into another viewer's player.
 */
export function normalizeSharedPlayable(value: unknown): Playable | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Playable>;
  if (
    typeof raw.key !== "string" ||
    !raw.key ||
    typeof raw.title !== "string" ||
    typeof raw.platform !== "string" ||
    typeof raw.kind !== "string"
  ) return null;
  // Keep the share format deliberately narrow. Rendering still applies the
  // trusted-host checks in embedFor, so a shared layout cannot become an
  // arbitrary iframe launcher.
  return {
    key: raw.key.slice(0, 240),
    kind: raw.kind as Playable["kind"],
    platform: raw.platform as Playable["platform"],
    title: raw.title.slice(0, 240),
    poster: typeof raw.poster === "string" ? raw.poster.slice(0, 2_000) : "",
    memberSlug: typeof raw.memberSlug === "string" ? raw.memberSlug.slice(0, 80) : null,
    memberLabel: typeof raw.memberLabel === "string" ? raw.memberLabel.slice(0, 120) : "CORE",
    accountLabel: typeof raw.accountLabel === "string" ? raw.accountLabel.slice(0, 120) : undefined,
    youtubeId: typeof raw.youtubeId === "string" ? raw.youtubeId.slice(0, 80) : null,
    twitchLogin: typeof raw.twitchLogin === "string" ? raw.twitchLogin.slice(0, 80) : null,
    vodId: typeof raw.vodId === "string" ? raw.vodId.slice(0, 100) : null,
    clipSrc: typeof raw.clipSrc === "string" ? raw.clipSrc.slice(0, 40) : null,
    clipId: typeof raw.clipId === "string" ? raw.clipId.slice(0, 160) : null,
    url: typeof raw.url === "string" ? raw.url.slice(0, 2_000) : null,
    sourceUrl: typeof raw.sourceUrl === "string" ? raw.sourceUrl.slice(0, 2_000) : undefined,
    mediaUrl: typeof raw.mediaUrl === "string" ? raw.mediaUrl.slice(0, 2_000) : undefined,
    embedUrl: typeof raw.embedUrl === "string" ? raw.embedUrl.slice(0, 2_000) : undefined,
    embeddable: raw.embeddable !== false,
    orientation: raw.orientation,
    durationSeconds: typeof raw.durationSeconds === "number" ? raw.durationSeconds : undefined,
    publishedAt: typeof raw.publishedAt === "string" ? raw.publishedAt : undefined,
    format: raw.format,
    recommendationReason:
      typeof raw.recommendationReason === "string" ? raw.recommendationReason.slice(0, 180) : undefined,
  };
}

export function normalizeWorkspace(value: unknown): NormalizedWorkspaceSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.tiles)) return null;
  const raw = value as Partial<WorkspaceSnapshot> & Record<string, unknown>;
  const sourceVersion = clampInt(raw.version, 0, WORKSPACE_SNAPSHOT_VERSION, 0);
  const preset = WORKSPACE_PRESETS.some((entry) => entry.id === raw.preset)
    ? raw.preset as WorkspacePreset
    // Missing presets in old saved rooms were freeform; brand-new malformed
    // payloads get the current Theater-first default instead.
    : sourceVersion === 2 ? "freeform" : "theater-first";
  const columns = clampInt(raw.columns, 4, 12, DEFAULT_ROOM_SNAP_DENSITY);
  const snapDensity = normalizeSnapDensity(raw.snapDensity, columns);

  // `tile` was the original name for a chat bound to the right-side player
  // panel. Preserve those saved rooms by migrating them to the new dock.
  const legacyDock = raw.chatDock as string | undefined;
  const dock: ChatDockMode = legacyDock === "tile"
    ? "right"
    : ["closed", "left", "right", "bottom", "floating"].includes(legacyDock ?? "")
      ? legacyDock as ChatDockMode
      : sourceVersion >= 3 ? "right" : "closed";
  const rawDockSize = isRecord(raw.chatDockSize) ? raw.chatDockSize as Partial<ChatDockSize> : undefined;
  const chatDockSize: ChatDockSize = {
    side: clampInt(rawDockSize?.side, 280, 520, DEFAULT_CHAT_DOCK_SIZE.side),
    bottom: clampInt(rawDockSize?.bottom, 220, 560, DEFAULT_CHAT_DOCK_SIZE.bottom),
    floatingWidth: clampInt(rawDockSize?.floatingWidth, 280, 560, DEFAULT_CHAT_DOCK_SIZE.floatingWidth),
    floatingHeight: clampInt(rawDockSize?.floatingHeight, 320, 760, DEFAULT_CHAT_DOCK_SIZE.floatingHeight),
    floatingX: clampInt(rawDockSize?.floatingX, 8, 2_000, DEFAULT_CHAT_DOCK_SIZE.floatingX),
    floatingY: clampInt(rawDockSize?.floatingY, 8, 2_000, DEFAULT_CHAT_DOCK_SIZE.floatingY),
  };
  const chatFloatingRect = normalizeRoomRect(
    isRecord(raw.chatFloatingRect) ? raw.chatFloatingRect as Partial<NormalizedRect> : undefined,
    legacyFloatingRect(chatDockSize),
    { minWidth: 0.15, minHeight: 0.18 },
  );

  const sourceTiles = (Array.isArray(raw.tiles) ? raw.tiles : []).slice(0, MAX_SHARE_TILES);
  const legacyRows = legacyBoardRows(sourceTiles, snapDensity);
  const seenItems = new Set<string>();
  const seenIds = new Set<string>();
  const candidates = sourceTiles.flatMap((candidate, index) => {
    if (!isRecord(candidate)) return [];
    const tile = candidate as Partial<WorkspaceTile>;
    const item = normalizeSharedPlayable(tile.item);
    if (!item || seenItems.has(item.key)) return [];
    seenItems.add(item.key);
    const fallbackId = `shared-${index}-${item.key}`;
    const requestedId = typeof tile.id === "string" && tile.id.trim()
      ? tile.id.trim().slice(0, 100)
      : fallbackId;
    const id = seenIds.has(requestedId) ? `${fallbackId}-${index}` : requestedId;
    seenIds.add(id);
    const col = clampInt(tile.col, 1, columns, 1);
    const row = clampInt(tile.row, 1, 96, index + 1);
    const colSpan = clampInt(tile.colSpan, 1, columns - col + 1, Math.ceil(columns / 2));
    const rowSpan = clampInt(tile.rowSpan, 1, 96, 2);
    const legacyRect = gridTileToNormalizedRect({ col, row, colSpan, rowSpan }, columns, legacyRows);
    const rect = normalizeRoomRect(
      isRecord(tile.rect) ? tile.rect as Partial<NormalizedRect> : undefined,
      legacyRect,
      { minWidth: 1 / snapDensity, minHeight: 1 / snapDensity },
    );
    return [{
      id,
      item,
      rect,
      col,
      row,
      colSpan,
      rowSpan,
      muted: tile.muted !== false,
      volume: Math.min(1, Math.max(0, typeof tile.volume === "number" ? tile.volume : 0.8)),
      pinned: Boolean(tile.pinned),
      fit: tile.fit === "cover" ? "cover" : "contain",
      standby: Boolean(tile.standby),
      delaySeconds: clampInt(tile.delaySeconds, 0, 7_200, 0),
    } satisfies NormalizedWorkspaceTile];
  });

  // Repair overlaps/out-of-bounds positions rather than allowing an imported
  // workspace to recreate the unbounded, overlapping Studio canvas. If a
  // malformed layout cannot fit its requested rectangles, preserve its sources
  // with a deterministic preset arrangement instead of silently dropping them.
  let solution = solveRoomLayout(
    candidates.map((tile) => ({ id: tile.id, rect: tile.rect })),
    { snapDensity, anchorId: typeof raw.focusedTileId === "string" ? raw.focusedTileId : null },
  );
  if (solution.rejectedIds.length) {
    const fallbackPreset = preset === "freeform" ? "theater-first" : preset;
    const fallbackRects = presetNormalizedRects(fallbackPreset, candidates.length, snapDensity);
    solution = solveRoomLayout(
      candidates.map((tile, index) => ({ id: tile.id, rect: fallbackRects[index] ?? tile.rect })),
      { snapDensity },
    );
  }
  const solvedById = new Map(solution.tiles.map((tile) => [tile.id, tile.rect]));
  const tiles = candidates.flatMap((tile) => {
    const rect = solvedById.get(tile.id);
    if (!rect) return [];
    const grid = normalizedRectToGridPosition(rect, columns, snapDensity);
    return [{ ...tile, ...grid, rect } satisfies NormalizedWorkspaceTile];
  });
  const focus = tiles.some((tile) => tile.id === raw.focusedTileId)
    ? raw.focusedTileId as string
    : tiles[0]?.id ?? null;

  return {
    version: WORKSPACE_SNAPSHOT_VERSION,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 80) : "Shared layout",
    preset,
    columns,
    snapDensity,
    focusedTileId: focus,
    chatDock: dock,
    chatChannels: Array.isArray(raw.chatChannels)
      ? raw.chatChannels.filter((entry): entry is string => typeof entry === "string").slice(0, 12)
      : [],
    chatMode: raw.chatMode === "columns" || raw.chatMode === "focused" ? raw.chatMode : "combined",
    chatFocusedLogin: typeof raw.chatFocusedLogin === "string" ? raw.chatFocusedLogin.slice(0, 80) : null,
    chatTextScale: Math.max(0.7, Math.min(1.8, Number(raw.chatTextScale) || 1)),
    showChatTimestamps: raw.showChatTimestamps === true,
    chatDockSize,
    chatFloatingRect,
    mixAudio: raw.mixAudio === true,
    maxActivePlayers: clampInt(raw.maxActivePlayers, 1, 8, 4),
    autoplayMode: normalizeAutoplayMode(raw.autoplayMode),
    dataSaver: raw.dataSaver === true,
    captionsEnabled: raw.captionsEnabled === true,
    playbackRate: Math.max(0.5, Math.min(2, Number(raw.playbackRate) || 1)),
    qualityPreference: normalizeQualityPreference(raw.qualityPreference),
    tiles,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64ToBytes(encoded: string): Uint8Array {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodeWorkspace(snapshot: WorkspaceSnapshot): string {
  const normalized = normalizeWorkspace(snapshot) ?? snapshot;
  const compact = {
    ...normalized,
    tiles: normalized.tiles.map((tile) => ({
      ...tile,
      item: {
        ...tile.item,
        // Catalog art can be rediscovered after load and is the largest,
        // least essential part of a URL-carried workspace.
        poster: tile.item.poster.length > 800 ? "" : tile.item.poster,
        sourceUrl: tile.item.sourceUrl === tile.item.url ? undefined : tile.item.sourceUrl,
      },
    })),
  };
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(compact)));
}

export function decodeWorkspace(encoded: string): NormalizedWorkspaceSnapshot | null {
  if (!encoded || encoded.length > 48_000) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64ToBytes(encoded))) as unknown;
    return normalizeWorkspace(parsed);
  } catch {
    return null;
  }
}

export function positionsForPreset(
  preset: WorkspacePreset,
  tileCount: number,
  snapDensity = DEFAULT_ROOM_SNAP_DENSITY,
): Array<Pick<WorkspaceTile, "col" | "row" | "colSpan" | "rowSpan">> {
  const count = Math.max(1, Math.min(MAX_SHARE_TILES, tileCount));
  const density = normalizeSnapDensity(snapDensity);
  return presetNormalizedRects(preset, count, density)
    .map((rect) => normalizedRectToGridPosition(rect, density, density));
}
