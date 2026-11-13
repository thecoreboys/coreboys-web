"use client";
/* eslint-disable @next/next/no-img-element -- Studio previews use lightweight posters from runtime provider URLs. */
import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutGrid, MessageSquare, PanelRight, Volume2, X } from "lucide-react";

import { usePlayer } from "@/components/providers/PlayerProvider";

import { contentShape } from "@/lib/watch/playable";

import { readableTitle } from "@/lib/watch/presentation";

import { AUTOPLAY_MODES, DEFAULT_CHAT_FLOATING_RECT, WORKSPACE_PRESETS, type WorkspaceTile, type WorkspaceSnapshot, type WorkspacePreset } from "@/lib/watch/workspace";

import { WatchSelect } from "@/components/watch/WatchSelect";

import { gridTileToNormalizedRect, moveAndResolveRoomLayout, normalizeRoomRect, normalizedRectToGridPosition, presetNormalizedRects, resizeRoomTileEdge, resolvePresetRoomLayout, roomLayoutMatchesPreset, shouldStackTwitchRoom, swapRoomTiles, theaterRoomFrame, type NormalizedRect, type RoomLayoutTile, type RoomTileEdge } from "@/lib/watch/room-layout";

export type RoomTileWithRect = WorkspaceTile & { rect?: NormalizedRect };

export type StudioWorkspaceSnapshot = WorkspaceSnapshot & {
  snapDensity?: number;
  tiles: RoomTileWithRect[];
};

function roomTileRect(tile: WorkspaceTile, columns = 12, density = 12): NormalizedRect {
  const known = (tile as RoomTileWithRect).rect;
  return known ?? gridTileToNormalizedRect(tile, columns, density);
}

type StudioTab = "layout" | "chat" | "playback" | "audio" | "saved";
type ChatDockPlacement = "left" | "right" | "bottom" | "floating";

type TheaterStudioAction = {
  kind: "move" | "edge" | "chat" | "chat-resize";
  pointerId: number;
  tileId?: string;
  edges?: RoomTileEdge[];
  startX: number;
  startY: number;
  /** The media board's inner tile area (inside its padding). */
  board: DOMRect;
  /** The whole preview: board, chat column and any bottom chat strip. */
  frame: DOMRect;
  /** Real room pixels per preview pixel, for chat dock sizes. */
  pxScale: number;
  before: StudioWorkspaceSnapshot;
  startRect: NormalizedRect;
  moved: boolean;
} | null;

const EDGE_HANDLES: Array<{ edge: RoomTileEdge; className: string }> = [
  { edge: "left", className: "inset-y-4 left-0 w-2 cursor-ew-resize" },
  { edge: "right", className: "inset-y-4 right-0 w-2 cursor-ew-resize" },
  { edge: "top", className: "inset-x-4 top-0 h-2 cursor-ns-resize" },
  { edge: "bottom", className: "inset-x-4 bottom-0 h-2 cursor-ns-resize" },
];

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

/** The Theater room's main view: the pinned tile, otherwise the first one. */
function studioMainId(snapshot: StudioWorkspaceSnapshot) {
  return snapshot.tiles.find((tile) => tile.pinned)?.id ?? snapshot.tiles[0]?.id ?? null;
}

function studioTiles(snapshot: StudioWorkspaceSnapshot): RoomLayoutTile[] {
  const density = studioDensity(snapshot);
  const raw = snapshot.tiles.map((tile) => ({ id: tile.id, rect: roomTileRect(tile, density, density) }));
  // Mirror the Theater surface exactly while a preset is still untouched:
  // the pinned main source owns the cinematic slot, and a Twitch pair gets
  // the same 60/40 split the room uses for Twitch's 400px minimum. Once any
  // geometry is edited, the saved rectangles take over and stay literal.
  return roomLayoutMatchesPreset(snapshot.preset, raw, density)
    ? resolvePresetRoomLayout(snapshot.preset, raw, {
        focusedId: studioMainId(snapshot),
        snapDensity: density,
        twitchSafeTheaterPair: snapshot.tiles.length === 2 && snapshot.tiles.some((tile) => tile.item.platform === "twitch"),
      })
    : raw;
}

function studioTileRect(tile: WorkspaceTile, snapshot: StudioWorkspaceSnapshot): NormalizedRect {
  const density = studioDensity(snapshot);
  return studioTiles(snapshot).find((entry) => entry.id === tile.id)?.rect
    ?? roomTileRect(tile, density, density);
}

function sameGeometry(left: readonly RoomLayoutTile[], right: readonly RoomLayoutTile[]) {
  return JSON.stringify(left) === JSON.stringify(right);
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

/** Freeze edited geometry as a freeform room, unless nothing moved. */
function withStudioGeometry(before: StudioWorkspaceSnapshot, tiles: readonly RoomLayoutTile[]): StudioWorkspaceSnapshot {
  if (sameGeometry(tiles, studioTiles(before))) return before;
  const density = studioDensity(before);
  return applyStudioRects({ ...before, preset: "freeform", columns: density, snapDensity: density }, tiles);
}

function withMain(snapshot: StudioWorkspaceSnapshot, mainId: string): StudioWorkspaceSnapshot {
  return {
    ...snapshot,
    focusedTileId: mainId,
    tiles: snapshot.tiles.map((tile) => ({ ...tile, pinned: tile.id === mainId })),
  };
}

/**
 * Swap two views the way the Theater room does: whichever view lands in the
 * main slot becomes the main view. An untouched main-aware preset (Theater,
 * Focus + side) keeps its preset and simply promotes the other view.
 */
function studioSwap(before: StudioWorkspaceSnapshot, sourceId: string, targetId: string): StudioWorkspaceSnapshot {
  const displayed = studioTiles(before);
  const swapped = swapRoomTiles(displayed, sourceId, targetId);
  const mainId = studioMainId(before);
  const promoted = mainId === sourceId ? targetId : mainId === targetId ? sourceId : null;
  if (promoted) {
    const viaPreset = withMain(before, promoted);
    if (sameGeometry(studioTiles(viaPreset), swapped)) return viaPreset;
  }
  const frozen = withStudioGeometry(before, swapped);
  return promoted ? withMain(frozen, promoted) : frozen;
}

function studioRectStyle(rect: NormalizedRect, density: number): React.CSSProperties {
  const position = normalizedRectToGridPosition(rect, density, density);
  return {
    gridColumn: `${position.col} / span ${position.colSpan}`,
    gridRow: `${position.row} / span ${position.rowSpan}`,
    minHeight: 0,
  };
}

function percentStyle(rect: NormalizedRect): React.CSSProperties {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
  };
}

function studioSnapshotEqual(left: StudioWorkspaceSnapshot, right: StudioWorkspaceSnapshot) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function useViewportSize() {
  const [size, setSize] = useState({ width: 1440, height: 900 });
  useEffect(() => {
    const measure = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return size;
}

export function RoomStudio({
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
  const viewport = useViewportSize();
  const initialRef = useRef<StudioWorkspaceSnapshot | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const actionRef = useRef<TheaterStudioAction>(null);
  const pendingPointerRef = useRef<{ x: number; y: number } | null>(null);
  const animationRef = useRef<number | null>(null);
  const [draft, setDraft] = useState<StudioWorkspaceSnapshot>(() => cloneStudioSnapshot(player.workspaceSnapshot("Room Studio")));
  const draftRef = useRef(draft);
  const [selected, setSelected] = useState<string | "chat">(() => studioMainId(draft) ?? "chat");
  const [tab, setTab] = useState<StudioTab>("layout");
  const [presetTrayOpen, setPresetTrayOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [history, setHistory] = useState<StudioWorkspaceSnapshot[]>([]);
  const [future, setFuture] = useState<StudioWorkspaceSnapshot[]>([]);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [ghost, setGhost] = useState<{ tileId: string; rect: NormalizedRect } | null>(null);
  const [swapTarget, setSwapTarget] = useState<string | null>(null);
  const [chatDrop, setChatDropState] = useState<{ dock: ChatDockPlacement; rect: NormalizedRect } | null>(null);
  const chatDropRef = useRef<{ dock: ChatDockPlacement; rect: NormalizedRect } | null>(null);
  const setChatDrop = useCallback((drop: { dock: ChatDockPlacement; rect: NormalizedRect } | null) => {
    chatDropRef.current = drop;
    setChatDropState(drop);
  }, []);
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
    if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
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

  const clearDragPreview = useCallback(() => {
    setGhost(null);
    setSwapTarget(null);
    setChatDrop(null);
  }, [setChatDrop]);

  // Pointer capture deliberately keeps movement local to the lightweight
  // Studio preview. Escape must work even while the captured move/resize
  // handle owns focus instead of the board itself.
  const cancelActiveAction = useCallback(() => {
    const action = actionRef.current;
    if (!action) return false;
    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    pendingPointerRef.current = null;
    actionRef.current = null;
    replaceDraft(action.before, false);
    clearDragPreview();
    setBlocked(false);
    return true;
  }, [clearDragPreview, replaceDraft]);

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

  const setDraftAndCommit = useCallback((next: StudioWorkspaceSnapshot) => {
    const before = cloneStudioSnapshot(draftRef.current);
    commitDraft(next, before);
  }, [commitDraft]);

  const applyPreset = useCallback((preset: WorkspacePreset) => {
    const before = cloneStudioSnapshot(draftRef.current);
    const density = studioDensity(before);
    const rects = presetNormalizedRects(preset as Parameters<typeof presetNormalizedRects>[0], before.tiles.length, density);
    const next = applyStudioRects({ ...before, preset, columns: density, snapDensity: density }, before.tiles.map((tile, index) => ({ id: tile.id, rect: rects[index] ?? rects.at(-1)! })));
    commitDraft(next, before);
    setSelected(studioMainId(next) ?? "chat");
  }, [commitDraft]);

  const frame = theaterRoomFrame(viewport, draft.chatDockSize, draft.chatDock);

  const beginAction = (
    event: React.PointerEvent<HTMLElement>,
    kind: NonNullable<TheaterStudioAction>["kind"],
    options: { tile?: RoomTileWithRect; edges?: RoomTileEdge[] } = {},
  ) => {
    const boardElement = boardRef.current;
    const frameElement = frameRef.current;
    if (!boardElement || !frameElement || event.button !== 0) return false;
    event.preventDefault();
    event.stopPropagation();
    const before = cloneStudioSnapshot(draftRef.current);
    const frameBox = frameElement.getBoundingClientRect();
    actionRef.current = {
      kind,
      pointerId: event.pointerId,
      tileId: options.tile?.id,
      edges: options.edges,
      startX: event.clientX,
      startY: event.clientY,
      board: boardElement.getBoundingClientRect(),
      frame: frameBox,
      pxScale: frame.container / Math.max(1, frameBox.width),
      before,
      startRect: options.tile
        ? studioTileRect(options.tile, before)
        : before.chatFloatingRect ?? DEFAULT_CHAT_FLOATING_RECT,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setBlocked(false);
    return true;
  };

  const beginTileAction = (event: React.PointerEvent<HTMLElement>, tile: RoomTileWithRect, kind: "move" | "edge", edges?: RoomTileEdge[]) => {
    if (!beginAction(event, kind, { tile, edges })) return;
    setSelected(tile.id);
    setTab("layout");
  };

  const beginChatAction = (event: React.PointerEvent<HTMLElement>, kind: "chat" | "chat-resize") => {
    if (!beginAction(event, kind)) return;
    setSelected("chat");
    setTab("chat");
  };

  const updatePointerDraft = useCallback((clientX: number, clientY: number) => {
    const action = actionRef.current;
    if (!action) return;
    const dxPx = clientX - action.startX;
    const dyPx = clientY - action.startY;
    // A press without travel is a selection click, not an edit.
    if (!action.moved && Math.hypot(dxPx, dyPx) < 4) return;
    action.moved = true;
    const { before } = action;
    const density = studioDensity(before);

    if (action.kind === "chat") {
      const px = (clientX - action.frame.left) / Math.max(1, action.frame.width);
      const py = (clientY - action.frame.top) / Math.max(1, action.frame.height);
      const dock: ChatDockPlacement = px < 0.16 ? "left" : px > 0.84 ? "right" : py > 0.78 ? "bottom" : "floating";
      const start = action.startRect;
      const rect = normalizeRoomRect({ ...start, x: px - start.width / 2, y: py - 0.05 }, start, { minWidth: 0.15, minHeight: 0.18 });
      setChatDrop({ dock, rect });
      return;
    }

    if (action.kind === "chat-resize") {
      const dock = before.chatDock;
      if (dock === "left" || dock === "right") {
        const side = Math.max(280, Math.min(520, Math.round(before.chatDockSize.side + dxPx * action.pxScale * (dock === "right" ? -1 : 1))));
        replaceDraft({ ...before, chatDockSize: { ...before.chatDockSize, side } }, true);
      } else if (dock === "bottom") {
        const bottom = Math.max(220, Math.min(560, Math.round(before.chatDockSize.bottom - dyPx * action.pxScale)));
        replaceDraft({ ...before, chatDockSize: { ...before.chatDockSize, bottom } }, true);
      } else {
        const start = action.startRect;
        replaceDraft({
          ...before,
          chatFloatingRect: normalizeRoomRect({
            ...start,
            width: start.width + dxPx / Math.max(1, action.frame.width),
            height: start.height + dyPx / Math.max(1, action.frame.height),
          }, start, { minWidth: 0.15, minHeight: 0.18 }),
        }, true);
      }
      return;
    }

    if (!action.tileId) return;
    const dx = dxPx / Math.max(1, action.board.width);
    const dy = dyPx / Math.max(1, action.board.height);
    const displayed = studioTiles(before);
    const start = action.startRect;

    if (action.kind === "edge") {
      let result: RoomLayoutTile[] = displayed;
      let rejected = false;
      for (const edge of action.edges ?? []) {
        const position = edge === "right" ? start.x + start.width + dx
          : edge === "left" ? start.x + dx
            : edge === "bottom" ? start.y + start.height + dy
              : start.y + dy;
        const resized = resizeRoomTileEdge(result, action.tileId, edge, position, density);
        if (resized) result = resized;
        else rejected = true;
      }
      setBlocked(rejected && sameGeometry(result, displayed));
      replaceDraft(withStudioGeometry(before, result), true);
      return;
    }

    // Move: dropping onto another view swaps the two; dropping into open
    // space moves the view there and repacks anything it overlaps.
    const requested = { ...start, x: start.x + dx, y: start.y + dy };
    setGhost({ tileId: action.tileId, rect: normalizeRoomRect(requested, start) });
    const px = (clientX - action.board.left) / Math.max(1, action.board.width);
    const py = (clientY - action.board.top) / Math.max(1, action.board.height);
    const target = displayed.find((tile) => tile.id !== action.tileId
      && px >= tile.rect.x && px <= tile.rect.x + tile.rect.width
      && py >= tile.rect.y && py <= tile.rect.y + tile.rect.height);
    if (target) {
      setSwapTarget(target.id);
      setBlocked(false);
      replaceDraft(studioSwap(before, action.tileId, target.id), true);
      return;
    }
    setSwapTarget(null);
    const solution = moveAndResolveRoomLayout(displayed, action.tileId, requested, {
      snapDensity: density,
      minWidth: 1 / density,
      minHeight: 1 / density,
    });
    // Never render the solver's partial output (which omits rejected ids)
    // as though it were a valid room: show the room as it was instead.
    if (!solution.valid) {
      setBlocked(true);
      replaceDraft(before, true);
      return;
    }
    setBlocked(false);
    replaceDraft(withStudioGeometry(before, solution.tiles), true);
  }, [replaceDraft, setChatDrop]);

  const onFramePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!actionRef.current || event.pointerId !== actionRef.current.pointerId) return;
    pendingPointerRef.current = { x: event.clientX, y: event.clientY };
    if (animationRef.current !== null) return;
    animationRef.current = window.requestAnimationFrame(() => {
      animationRef.current = null;
      const pending = pendingPointerRef.current;
      if (pending) updatePointerDraft(pending.x, pending.y);
    });
  };

  const finishAction = (event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const action = actionRef.current;
    if (!action || event.pointerId !== action.pointerId) return;
    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (cancelled) {
      cancelActiveAction();
      return;
    }
    updatePointerDraft(event.clientX, event.clientY);
    pendingPointerRef.current = null;
    actionRef.current = null;
    if (action.kind === "chat") {
      const drop = chatDropRef.current;
      setChatDrop(null);
      if (drop && action.moved) {
        commitDraft({
          ...action.before,
          chatDock: drop.dock,
          ...(drop.dock === "floating" ? { chatFloatingRect: drop.rect } : {}),
        }, action.before);
      }
    } else if (!studioSnapshotEqual(action.before, draftRef.current)) {
      commitDraft(draftRef.current, action.before);
    } else {
      replaceDraft(action.before, false);
    }
    setGhost(null);
    setSwapTarget(null);
    setBlocked(false);
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

  const saveLayout = () => {
    commitDraft(draftRef.current);
    onSave();
    if (canSaveLayouts) setDirty(false);
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
  const mainId = studioMainId(draft);
  const displayedTiles = studioTiles(draft);
  const displayedRect = (tileId: string) => displayedTiles.find((entry) => entry.id === tileId)?.rect ?? null;
  const twitchStacks = draft.tiles.length > 1 && shouldStackTwitchRoom(
    frame.stage,
    draft.tiles.filter((tile) => tile.item.platform === "twitch").flatMap((tile) => displayedRect(tile.id) ?? []),
  );
  const floatingRect = draft.chatFloatingRect ?? DEFAULT_CHAT_FLOATING_RECT;

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
        { ...(current.chatFloatingRect ?? DEFAULT_CHAT_FLOATING_RECT), ...patch },
        DEFAULT_CHAT_FLOATING_RECT,
        { minWidth: 0.15, minHeight: 0.18 },
      ),
    }));
  };

  /** Arrow-key moves: place the view and repack anything it overlaps. */
  const moveTile = (tileId: string, patch: Pick<NormalizedRect, "x" | "y">) => {
    const before = cloneStudioSnapshot(draftRef.current);
    const tile = before.tiles.find((entry) => entry.id === tileId);
    if (!tile) return;
    const solution = moveAndResolveRoomLayout(studioTiles(before), tileId, { ...studioTileRect(tile, before), ...patch }, {
      snapDensity: studioDensity(before), minWidth: 1 / studioDensity(before), minHeight: 1 / studioDensity(before),
    });
    if (!solution.valid) {
      setBlocked(true);
      return;
    }
    setDraftAndCommit(withStudioGeometry(before, solution.tiles));
  };

  /**
   * Resize by one snap cell along a shared seam, so neighbours give up or
   * take the space instead of leaving a gap. A view on the board's right
   * edge resizes from its left seam.
   */
  const nudgeTileSize = (tileId: string, axis: "width" | "height", delta: 1 | -1) => {
    const before = cloneStudioSnapshot(draftRef.current);
    const displayed = studioTiles(before);
    const rect = displayed.find((entry) => entry.id === tileId)?.rect;
    if (!rect) return;
    const step = delta / studioDensity(before);
    const atTrailingEdge = axis === "width" ? rect.x + rect.width > 0.9999 : rect.y + rect.height > 0.9999;
    const atLeadingEdge = axis === "width" ? rect.x < 0.0001 : rect.y < 0.0001;
    const leading = atTrailingEdge && !atLeadingEdge;
    const edge: RoomTileEdge = axis === "width" ? (leading ? "left" : "right") : (leading ? "top" : "bottom");
    const position = axis === "width"
      ? (leading ? rect.x - step : rect.x + rect.width + step)
      : (leading ? rect.y - step : rect.y + rect.height + step);
    const resized = resizeRoomTileEdge(displayed, tileId, edge, position, studioDensity(before));
    if (!resized || sameGeometry(resized, displayed)) {
      setBlocked(true);
      return;
    }
    setDraftAndCommit(withStudioGeometry(before, resized));
  };

  const makeMain = (tileId: string) => setDraftAndCommit(withMain(draftRef.current, tileId));

  const removeTile = (tileId: string) => {
    const before = cloneStudioSnapshot(draftRef.current);
    const remaining = before.tiles.filter((tile) => tile.id !== tileId);
    const next = { ...before, tiles: remaining, focusedTileId: remaining.some((tile) => tile.id === before.focusedTileId) ? before.focusedTileId : remaining[0]?.id ?? null };
    setSelected(studioMainId(next) ?? "chat");
    setDraftAndCommit(next);
  };

  // Undo/redo shortcuts work anywhere in the Studio, including after the
  // clicked Undo/Redo button disables itself and focus drops to the body.
  const historyKeysRef = useRef({ undo, redo });
  historyKeysRef.current = { undo, redo };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || closeConfirm) return;
      const target = event.target as HTMLElement | null;
      const typing = (target instanceof HTMLInputElement && target.type !== "range") || target instanceof HTMLTextAreaElement || Boolean(target?.isContentEditable);
      if (typing) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) historyKeysRef.current.redo();
        else historyKeysRef.current.undo();
      } else if (key === "y") {
        event.preventDefault();
        historyKeysRef.current.redo();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeConfirm]);

  const handleBoardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && actionRef.current) {
      event.preventDefault();
      cancelActiveAction();
      return;
    }
    if (!activeTile || event.target !== event.currentTarget) return;
    if (event.key === "Enter") {
      event.preventDefault();
      makeMain(activeTile.id);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeTile(activeTile.id);
      return;
    }
    const direction: [number, number] | null = event.key === "ArrowLeft" ? [-1, 0] : event.key === "ArrowRight" ? [1, 0] : event.key === "ArrowUp" ? [0, -1] : event.key === "ArrowDown" ? [0, 1] : null;
    if (!direction) return;
    event.preventDefault();
    if (event.shiftKey) {
      if (direction[0]) nudgeTileSize(activeTile.id, "width", direction[0] as 1 | -1);
      else nudgeTileSize(activeTile.id, "height", direction[1] as 1 | -1);
      return;
    }
    const rect = studioTileRect(activeTile, draftRef.current);
    moveTile(activeTile.id, { x: rect.x + direction[0] / density, y: rect.y + direction[1] / density });
  };

  // The preview is laid out like the real desktop room: a 16:9 stage, a
  // side column (chat, or the room panel when chat is elsewhere) and an
  // optional chat strip below, all scaled from this window's real sizes.
  const chatInColumn = frame.sideColumn && (draft.chatDock === "left" || draft.chatDock === "right");
  const chatBelow = draft.chatDock === "bottom" || (!frame.sideColumn && (draft.chatDock === "left" || draft.chatDock === "right"));
  const stageColumn = frame.sideColumn && draft.chatDock === "left" ? 2 : 1;
  const sideColumnIndex = draft.chatDock === "left" ? 1 : 2;
  const frameHeight = frame.stageHeight + (chatBelow ? frame.gap + frame.bottom : 0);
  const frameAspect = frame.container / Math.max(1, frameHeight);
  const chatLogins = draft.chatChannels.slice(0, 4);

  const chatResizeHandle = (placement: ChatDockPlacement) => (
    <button
      type="button"
      onPointerDown={(event) => beginChatAction(event, "chat-resize")}
      className={`${placement === "right" ? "inset-y-6 left-0 w-2.5 cursor-ew-resize" : placement === "left" ? "inset-y-6 right-0 w-2.5 cursor-ew-resize" : placement === "bottom" ? "inset-x-10 top-0 h-2.5 cursor-ns-resize" : "bottom-1 right-1 size-6 cursor-nwse-resize rounded-md bg-room-glass/75 ring-1 ring-room-ink/15"} absolute z-20 touch-none transition hover:bg-room-ink/25`}
      aria-label={placement === "floating" ? "Resize floating chat" : placement === "bottom" ? "Resize chat height" : "Resize chat width"}
    />
  );

  const chatCard = (placement: ChatDockPlacement, style?: React.CSSProperties) => (
    <div
      style={style}
      className={`${placement === "floating" ? "absolute z-30 shadow-2xl" : "relative h-full"} min-h-0 overflow-hidden rounded-xl border bg-room-raised/95 p-2.5 text-left transition ${selected === "chat" ? "border-room-ink/75 ring-2 ring-room-ink/35" : "border-room-ink/20 hover:border-room-ink/55"} ${chatDrop ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        onPointerDown={(event) => beginChatAction(event, "chat")}
        onClick={() => { setSelected("chat"); setTab("chat"); }}
        className="absolute inset-0 z-10 cursor-grab touch-none active:cursor-grabbing"
        aria-label={`Chat, docked ${placement}. Drag to the left, right, bottom or middle of the room to move it.`}
      />
      <span className="relative z-[2] flex items-center gap-1.5 text-room-secondary">
        <MessageSquare className="size-3.5" aria-hidden />
        <span className="text-[10px] font-semibold">Chat · {placement}</span>
      </span>
      <span className="relative z-[2] mt-2 block h-px bg-room-ink/10" />
      <span className="relative z-[2] mt-2 block space-y-1.5">
        {chatLogins.length ? chatLogins.map((login) => (
          <span key={login} className="flex items-center gap-1.5 text-[9px] text-room-muted"><span className="size-1.5 shrink-0 rounded-full bg-emerald-400/80" /><span className="truncate">{login}</span></span>
        )) : <span className="block text-[9px] text-room-muted">Follows the main view</span>}
        <span className="block h-1.5 w-3/4 rounded-full bg-room-ink/14" />
        <span className="block h-1.5 w-[58%] rounded-full bg-room-ink/10" />
      </span>
      <span className="relative z-[2] mt-2 hidden text-[8px] leading-3 text-room-faint sm:block">Drag to move · drag the edge to resize</span>
      {chatResizeHandle(placement)}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[90] bg-room-base/96 text-room-ink backdrop-blur-sm" role="presentation">
      <section id="multiview-setup-modal" role="dialog" aria-modal="true" aria-label="Room Studio" className="multiview-studio text-room-ink flex h-[100dvh] w-full flex-col overflow-hidden bg-room-base">
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-room-ink/10 px-3 sm:min-h-16 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <button type="button" onClick={requestClose} className="hidden min-h-10 rounded-xl px-3 text-xs font-semibold text-room-secondary ring-1 ring-room-ink/10 transition hover:bg-room-ink/8 hover:text-room-ink sm:inline-flex sm:items-center">Back to room</button>
            <div className="min-w-0"><p className="text-sm font-semibold tracking-tight">Room Studio</p><p className="hidden truncate text-xs text-room-muted sm:block">Arrange a Theater room without interrupting its streams.</p></div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" disabled={!history.length} onClick={undo} title="Undo (Ctrl+Z)" className="min-h-10 rounded-lg px-2.5 text-xs font-semibold text-room-secondary ring-1 ring-room-ink/10 transition hover:bg-room-ink/8 disabled:cursor-not-allowed disabled:opacity-30">Undo</button>
            <button type="button" disabled={!future.length} onClick={redo} title="Redo (Ctrl+Shift+Z)" className="hidden min-h-10 rounded-lg px-2.5 text-xs font-semibold text-room-secondary ring-1 ring-room-ink/10 transition hover:bg-room-ink/8 disabled:cursor-not-allowed disabled:opacity-30 sm:inline-flex sm:items-center">Redo</button>
            <button type="button" onClick={onShare} className="hidden min-h-10 rounded-lg px-3 text-xs font-semibold text-room-secondary ring-1 ring-room-ink/10 transition hover:bg-room-ink/8 sm:inline-flex sm:items-center">Share</button>
            <button type="button" onClick={saveLayout} className="min-h-10 rounded-lg bg-room-ink px-3 text-xs font-semibold text-room-inverse shadow-xs-skeuomorphic transition hover:bg-room-ink/90">Save layout</button>
            <button ref={closeButtonRef} type="button" onClick={requestClose} className="grid size-10 place-items-center rounded-lg text-room-muted transition hover:bg-room-ink/8 hover:text-room-ink" aria-label="Close Room Studio"><X className="size-4" /></button>
          </div>
        </header>

        <div className={`flex min-h-0 flex-1 flex-col lg:grid lg:grid-rows-[minmax(0,1fr)] ${presetTrayOpen ? (inspectorOpen ? "lg:grid-cols-[13rem_minmax(0,1fr)_20rem]" : "lg:grid-cols-[13rem_minmax(0,1fr)_3.25rem]") : (inspectorOpen ? "lg:grid-cols-[3.25rem_minmax(0,1fr)_20rem]" : "lg:grid-cols-[3.25rem_minmax(0,1fr)_3.25rem]")}`}>
          <aside className={`order-2 flex shrink-0 gap-2 overflow-x-auto border-t border-room-ink/8 bg-room-inset p-2.5 [scrollbar-width:none] transition-[padding] lg:order-none lg:block lg:overflow-y-auto lg:border-r lg:border-t-0 ${presetTrayOpen ? "lg:p-3" : "lg:p-1.5"}`}>
            <div className="hidden lg:block">
              <div className={`flex min-h-10 items-center gap-2 ${presetTrayOpen ? "justify-between" : "justify-center"}`}>
                <p className={presetTrayOpen ? "text-xs font-bold uppercase tracking-[.14em] text-room-faint" : "sr-only"}>Room styles</p>
                <button type="button" aria-expanded={presetTrayOpen} aria-label={presetTrayOpen ? "Collapse room styles" : "Open room styles"} title="Room styles" onClick={() => setPresetTrayOpen((value) => !value)} className="grid size-9 place-items-center rounded-lg text-room-muted transition hover:bg-room-ink/8 hover:text-room-ink">
                  {presetTrayOpen ? "Hide" : <LayoutGrid className="size-3.5" aria-hidden />}
                </button>
              </div>
              {presetTrayOpen ? <>
                <p className="mt-1 text-xs leading-4 text-room-faint">Start in Theater view, then make it yours.</p>
                <div className="mt-3 flex max-h-[27rem] flex-col gap-2 overflow-y-auto">
                  {WORKSPACE_PRESETS.filter((preset) => preset.id !== "freeform").map((preset) => <button key={preset.id} type="button" onClick={() => applyPreset(preset.id)} aria-pressed={draft.preset === preset.id} className={`min-h-11 shrink-0 rounded-xl px-3 text-left text-xs font-semibold ring-1 ring-inset transition ${draft.preset === preset.id ? "bg-room-ink text-room-inverse ring-room-ink" : "bg-room-ink/[.035] text-room-secondary ring-room-ink/10 hover:bg-room-ink/10 hover:text-room-ink"}`}><span className="block">{preset.label}</span><span className="mt-0.5 block text-[9px] font-normal opacity-60">{preset.description}</span></button>)}
                </div>
                <div className="mt-3 space-y-2 border-t border-room-ink/8 pt-3"><button type="button" onClick={onAdd} className="min-h-10 w-full rounded-xl bg-room-ink/6 px-3 text-left text-xs font-semibold text-room-secondary ring-1 ring-room-ink/10 hover:bg-room-ink/10">Add player</button><button type="button" disabled={!liveCount} onClick={onFill} className="min-h-10 w-full rounded-xl bg-room-ink/6 px-3 text-left text-xs font-semibold text-room-secondary ring-1 ring-room-ink/10 hover:bg-room-ink/10 disabled:opacity-35">Watch live channels</button></div>
              </> : null}
            </div>
            <div className="flex gap-2 lg:hidden">
              {WORKSPACE_PRESETS.filter((preset) => preset.id !== "freeform").map((preset) => <button key={preset.id} type="button" onClick={() => applyPreset(preset.id)} aria-pressed={draft.preset === preset.id} className={`min-h-11 shrink-0 rounded-xl px-3 text-left text-xs font-semibold ring-1 ring-inset transition ${draft.preset === preset.id ? "bg-room-ink text-room-inverse ring-room-ink" : "bg-room-ink/[.035] text-room-secondary ring-room-ink/10 hover:bg-room-ink/10 hover:text-room-ink"}`}><span className="block">{preset.label}</span></button>)}
            </div>
          </aside>

          <div className="relative order-1 min-h-0 min-w-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,.06),transparent_42%)] p-3 sm:p-5 lg:order-none">
            <div className="mx-auto flex min-h-full max-w-[1180px] flex-col justify-center">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-room-secondary">Live layout canvas</p>
                  <p className="mt-1 text-xs text-room-muted">Drag a view onto another to swap them, drag its edges to resize, and drag chat to dock it. Streams keep playing; each change applies on release.</p>
                </div>
                <span role="status" className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ring-1 ${blocked ? "bg-amber-300/10 text-amber-200 ring-amber-200/20" : "bg-emerald-400/10 text-emerald-300 ring-emerald-300/20"}`}>{blocked ? "No room there" : swapTarget ? "Release to swap" : "Live on release"}</span>
              </div>
              {twitchStacks ? <p className="mb-3 rounded-xl bg-amber-300/8 px-3 py-2 text-[10px] leading-4 text-amber-100/80 ring-1 ring-amber-200/15">Twitch players need at least 400 × 300 px. At this window size the room stacks these views in one column — give Twitch views more space or use fewer views.</p> : null}
              <div
                ref={frameRef}
                onPointerMove={onFramePointerMove}
                onPointerUp={(event) => finishAction(event)}
                onPointerCancel={(event) => finishAction(event, true)}
                className="relative mx-auto grid w-full items-stretch gap-2"
                style={{
                  width: `min(100%, calc((100dvh - 15rem) * ${frameAspect.toFixed(4)}))`,
                  gridTemplateColumns: frame.sideColumn
                    ? (draft.chatDock === "left" ? `${frame.side}fr ${frame.stage}fr` : `${frame.stage}fr ${frame.side}fr`)
                    : "minmax(0, 1fr)",
                }}
              >
                <div
                  role="application"
                  tabIndex={0}
                  aria-label="Room layout canvas. Arrow keys move the selected view, Shift plus arrows resize it, Enter makes it main, and Delete removes it."
                  onKeyDown={handleBoardKeyDown}
                  style={{ gridColumn: stageColumn, gridRow: 1 }}
                  className="multiview-studio__canvas relative aspect-video min-h-0 min-w-0 rounded-[1.1rem] border border-room-ink/12 bg-room-canvas p-2 shadow-[0_32px_120px_rgba(0,0,0,.55)] outline-none focus-visible:ring-2 focus-visible:ring-room-ink/70 sm:p-2.5"
                >
                  <div
                    ref={boardRef}
                    className="relative grid h-full w-full gap-1.5 sm:gap-2"
                    style={{ gridTemplateColumns: `repeat(${density}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${density}, minmax(0, 1fr))` }}
                  >
                    {draft.tiles.map((tile) => {
                      const selectedTile = selected === tile.id;
                      const rect = displayedRect(tile.id) ?? roomTileRect(tile, density, density);
                      const shape = contentShape(tile.item);
                      const dragging = ghost?.tileId === tile.id;
                      return <article
                        data-room-media
                        key={tile.id}
                        role="button"
                        tabIndex={-1}
                        onPointerDown={(event) => beginTileAction(event, tile, "move")}
                        onClick={() => { setSelected(tile.id); setTab("layout"); boardRef.current?.parentElement?.focus(); }}
                        style={studioRectStyle(rect, density)}
                        className={`group relative min-h-0 min-w-0 cursor-grab touch-none select-none overflow-hidden rounded-lg border bg-room-raised text-left text-room-ink transition-[border-color,box-shadow,opacity] active:cursor-grabbing ${selectedTile ? "border-room-ink ring-2 ring-room-ink/50" : "border-room-ink/12 hover:border-room-ink/35"} ${swapTarget === tile.id ? "ring-2 ring-emerald-300/70" : ""} ${dragging ? "opacity-60" : ""}`}
                        aria-label={`${tile.item.memberLabel}: ${readableTitle(tile.item.title)}. Drag to move or swap, drag an edge to resize.`}
                      >
                        {tile.item.poster ? <img src={tile.item.poster} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-90" /> : null}
                        <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/75 via-black/5 to-transparent" />
                        <span className="pointer-events-none relative z-[2] block p-2">
                          <span className="flex items-center gap-1.5"><span className="truncate text-xs font-semibold">{tile.item.memberLabel}</span>{tile.item.kind === "live" ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/85 px-1 py-0.5 text-[7px] font-bold uppercase tracking-wide text-white"><span className="size-1 rounded-full bg-white" />Live</span> : null}</span>
                          <span className="mt-0.5 block line-clamp-1 text-[9px] text-room-secondary">{readableTitle(tile.item.title)}</span>
                          <span className="mt-1 flex flex-wrap gap-1 text-[8px] text-room-secondary"><span className="rounded bg-black/45 px-1 py-0.5">{shape === "portrait" ? "9:16" : shape === "square" ? "1:1" : "16:9"}</span><span className="rounded bg-black/45 px-1 py-0.5">{tile.muted ? "Muted" : "Audio on"}</span>{tile.id === mainId ? <span className="rounded bg-white/85 px-1 py-0.5 font-semibold text-black">Main</span> : null}</span>
                        </span>
                        {swapTarget === tile.id ? <span className="pointer-events-none absolute inset-0 z-[3] grid place-items-center bg-emerald-400/10 text-[10px] font-semibold text-emerald-100">Swap</span> : null}
                        {EDGE_HANDLES.map((handle) => <span key={handle.edge} aria-hidden onPointerDown={(event) => beginTileAction(event, tile, "edge", [handle.edge])} className={`absolute z-20 touch-none rounded-full opacity-0 transition hover:bg-room-ink/50 group-hover:opacity-100 ${selectedTile ? "opacity-60" : ""} ${handle.className}`} />)}
                        <button type="button" onPointerDown={(event) => beginTileAction(event, tile, "edge", ["right", "bottom"])} className="absolute bottom-1 right-1 z-30 grid size-6 cursor-nwse-resize touch-none place-items-center rounded-md bg-black/55 text-[10px] text-white/80 ring-1 ring-white/15" aria-label={`Resize ${tile.item.memberLabel}`}>↘</button>
                      </article>;
                    })}
                    {ghost ? <span aria-hidden style={percentStyle(ghost.rect)} className="pointer-events-none absolute z-40 rounded-lg border-2 border-dashed border-room-ink/70 bg-room-ink/5" /> : null}
                  </div>
                </div>

                {frame.sideColumn ? (
                  <div style={{ gridColumn: sideColumnIndex, gridRow: 1 }} className="min-h-0 min-w-0">
                    {chatInColumn ? chatCard(draft.chatDock as ChatDockPlacement) : (
                      <div className="flex h-full flex-col gap-2 rounded-xl border border-room-ink/10 bg-room-ink/[.025] p-2.5 text-room-faint">
                        <span className="flex items-center gap-1.5 text-[10px] font-semibold"><PanelRight className="size-3.5" aria-hidden />Room panel</span>
                        <span className="text-[9px] leading-3">Details and Up next. Chat is {draft.chatDock === "closed" ? "off" : draft.chatDock === "floating" ? "floating over the room" : "below the room"}.</span>
                      </div>
                    )}
                  </div>
                ) : null}

                {chatBelow ? (
                  <div style={{ gridColumn: "1 / -1", gridRow: 2, aspectRatio: `${frame.container} / ${frame.bottom}` }} className="min-h-0">
                    {chatCard(draft.chatDock === "bottom" ? "bottom" : draft.chatDock as ChatDockPlacement)}
                  </div>
                ) : null}

                {draft.chatDock === "floating" ? chatCard("floating", percentStyle(floatingRect)) : null}

                {chatDrop ? (
                  <div aria-hidden className="pointer-events-none absolute inset-0 z-40">
                    {(["left", "right", "bottom"] as const).map((zone) => (
                      <span
                        key={zone}
                        className={`absolute grid place-items-center rounded-xl border-2 border-dashed text-[10px] font-semibold capitalize transition ${zone === "left" ? "inset-y-0 left-0 w-[16%]" : zone === "right" ? "inset-y-0 right-0 w-[16%]" : "inset-x-[16%] bottom-0 h-[22%]"} ${chatDrop.dock === zone ? "border-emerald-300/80 bg-emerald-400/15 text-emerald-100" : "border-room-ink/20 bg-room-ink/[.03] text-room-faint"}`}
                      >
                        {zone}
                      </span>
                    ))}
                    {chatDrop.dock === "floating" ? <span style={percentStyle(chatDrop.rect)} className="absolute grid place-items-center rounded-xl border-2 border-dashed border-emerald-300/80 bg-emerald-400/15 text-[10px] font-semibold text-emerald-100">Floating</span> : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <aside className={`order-3 min-h-0 shrink-0 overflow-y-auto border-t border-room-ink/8 bg-room-panel transition-[max-height] lg:border-l lg:border-t-0 ${inspectorOpen ? "max-h-[42dvh] lg:max-h-none" : "max-h-12 lg:max-h-none"}`}>
            <div className={`flex min-h-12 items-center gap-2 border-b border-room-ink/8 px-3 ${inspectorOpen ? "justify-between" : "justify-center"}`}><p className={inspectorOpen ? "text-xs font-semibold text-room-secondary" : "sr-only"}>Inspector</p><button type="button" aria-expanded={inspectorOpen} onClick={() => setInspectorOpen((value) => !value)} className="rounded-lg px-2 py-1 text-[9px] font-semibold text-room-muted hover:bg-room-ink/8 hover:text-room-ink">{inspectorOpen ? "Collapse" : "Open"}</button></div>
            {inspectorOpen ? <div className="p-3"><div className="grid grid-cols-5 rounded-xl bg-room-ink/[.035] p-1 ring-1 ring-room-ink/8">{(["layout", "chat", "playback", "audio", "saved"] as StudioTab[]).map((entry) => <button key={entry} type="button" onClick={() => setTab(entry)} aria-pressed={tab === entry} className={`min-h-9 rounded-lg px-1 text-[9px] font-semibold capitalize transition ${tab === entry ? "bg-room-ink text-room-inverse" : "text-room-muted hover:text-room-ink"}`}>{entry === "playback" ? "Play" : entry}</button>)}</div>
              {tab === "layout" ? <div className="mt-4 space-y-3">
                <div><p className="text-xs font-semibold">{activeTile ? `${activeTile.item.memberLabel}${activeTile.id === mainId ? " · main view" : ""}` : "Theater layout"}</p><p className="mt-1 text-xs leading-4 text-room-muted">{activeTile ? "Drag it onto another view to swap, or drag an edge to resize. Neighbours share the space, so the room stays full." : "Select a view to move, resize, make main, or remove it."}</p></div>
                <SettingRange label={`Snap density · ${density}`} min={4} max={24} value={density} onBegin={beginInspectorEdit} onChange={(value) => updateDraft((current) => ({ ...current, snapDensity: value, columns: value }))} onCommit={commitInspectorEdit} />
                {activeTile ? <>
                  <button type="button" disabled={activeTile.id === mainId} onClick={() => makeMain(activeTile.id)} className="min-h-10 w-full rounded-xl bg-room-ink px-3 text-left text-xs font-semibold text-room-inverse disabled:cursor-default disabled:opacity-40">{activeTile.id === mainId ? "This is the main view" : "Make main"}</button>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => nudgeTileSize(activeTile.id, "width", -1)} className="min-h-10 rounded-xl text-xs font-semibold text-room-secondary ring-1 ring-room-ink/10 hover:bg-room-ink/8">Narrower</button>
                    <button type="button" onClick={() => nudgeTileSize(activeTile.id, "width", 1)} className="min-h-10 rounded-xl text-xs font-semibold text-room-secondary ring-1 ring-room-ink/10 hover:bg-room-ink/8">Wider</button>
                    <button type="button" onClick={() => nudgeTileSize(activeTile.id, "height", -1)} className="min-h-10 rounded-xl text-xs font-semibold text-room-secondary ring-1 ring-room-ink/10 hover:bg-room-ink/8">Shorter</button>
                    <button type="button" onClick={() => nudgeTileSize(activeTile.id, "height", 1)} className="min-h-10 rounded-xl text-xs font-semibold text-room-secondary ring-1 ring-room-ink/10 hover:bg-room-ink/8">Taller</button>
                  </div>
                  <button type="button" onClick={() => removeTile(activeTile.id)} className="min-h-10 w-full rounded-xl bg-red-500/10 px-3 text-left text-xs font-semibold text-room-danger ring-1 ring-red-400/20 hover:bg-red-500/15">Remove player</button>
                </> : null}
              </div> : null}
              {tab === "chat" ? (
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-xs font-semibold">Chat dock</p>
                    <p className="mt-1 text-xs leading-4 text-room-muted">Place one persistent dock beside, below, or over the room.</p>
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
                              chatFloatingRect: current.chatFloatingRect ?? DEFAULT_CHAT_FLOATING_RECT,
                            } : {}),
                          });
                        }}
                        aria-pressed={draft.chatDock === dock}
                        className={`min-h-10 rounded-lg text-xs font-semibold capitalize ring-1 transition ${draft.chatDock === dock ? "bg-room-ink text-room-inverse ring-room-ink" : "bg-room-ink/[.035] text-room-muted ring-room-ink/10 hover:bg-room-ink/10"}`}
                      >
                        {dock}
                      </button>
                    ))}
                  </div>
                  <p className="rounded-xl bg-room-ink/[.035] p-3 text-[10px] leading-5 text-room-muted">Chat follows the main stage automatically, including changes from your phone. Use Chat settings for channels, text size, and filters.</p>
                  <div onPointerDown={beginDockEdit} onFocusCapture={beginDockEdit} onKeyDownCapture={(event) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) beginDockEdit(); }} className="space-y-2">
                    {draft.chatDock === "floating" ? (
                      <>
                        <SettingRange
                          label={`Floating width · ${Math.round(floatingRect.width * 100)}%`}
                          min={0.15}
                          max={0.5}
                          step={0.01}
                          value={floatingRect.width}
                          onChange={(value) => updateFloatingDockRect({ width: value })}
                          onCommit={commitDockEdit}
                        />
                        <SettingRange
                          label={`Floating height · ${Math.round(floatingRect.height * 100)}%`}
                          min={0.18}
                          max={0.82}
                          step={0.01}
                          value={floatingRect.height}
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
                <button type="button" onClick={() => setDraftAndCommit({ ...draftRef.current, tiles: draftRef.current.tiles.map((tile) => ({ ...tile, muted: true })) })} className="min-h-10 w-full rounded-xl bg-room-ink/6 px-3 text-left text-xs font-semibold text-room-secondary ring-1 ring-room-ink/10 hover:bg-room-ink/10">Mute every tile</button>
                {draft.tiles.map((tile) => <div key={tile.id} className="rounded-xl bg-room-ink/[.035] p-2 ring-1 ring-room-ink/8"><div className="flex items-center gap-2"><button type="button" onClick={() => { const current = draftRef.current; setDraftAndCommit({ ...current, focusedTileId: tile.id, tiles: current.tiles.map((entry) => ({ ...entry, muted: current.mixAudio ? entry.id === tile.id ? false : entry.muted : entry.id !== tile.id })) }); }} className="grid size-7 place-items-center rounded-lg bg-room-ink/8 text-room-secondary hover:bg-room-ink hover:text-room-inverse" aria-label={`Make ${tile.item.memberLabel} the audio lead`}><Volume2 className="size-3.5" /></button><span className="min-w-0 flex-1 truncate text-xs font-semibold text-room-secondary">{tile.item.memberLabel}</span></div><input type="range" min="0" max="1" step="0.05" value={tile.muted ? 0 : tile.volume} onPointerDown={beginInspectorEdit} onFocus={beginInspectorEdit} onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) beginInspectorEdit(); }} onKeyUp={commitInspectorEdit} onChange={(event) => { const value = Number(event.target.value); updateDraft((current) => ({ ...current, tiles: current.tiles.map((entry) => entry.id === tile.id ? { ...entry, volume: value, muted: value === 0 } : entry) })); }} onPointerUp={commitInspectorEdit} onBlur={commitInspectorEdit} className="mt-2 h-7 w-full cursor-pointer accent-room-ink" aria-label={`${tile.item.memberLabel} volume`} /><SettingRange label={`Sync delay · ${tile.delaySeconds}s`} min={0} max={30} value={tile.delaySeconds} onBegin={beginInspectorEdit} onChange={(value) => updateDraft((current) => ({ ...current, tiles: current.tiles.map((entry) => entry.id === tile.id ? { ...entry, delaySeconds: value } : entry) }))} onCommit={commitInspectorEdit} /></div>)}
              </div> : null}
              {tab === "saved" ? <div className="mt-4 space-y-3"><p className="text-xs font-semibold">Saved layouts</p><label className="grid gap-1 text-xs text-room-muted">Layout name<input value={layoutName} onChange={(event) => onLayoutName(event.target.value)} placeholder="My Theater room" className="min-h-10 rounded-xl bg-room-ink/5 px-3 text-xs text-room-ink ring-1 ring-room-ink/10 outline-none focus:ring-room-ink/25" /></label><button type="button" onClick={saveLayout} className="min-h-10 w-full rounded-xl bg-room-ink px-3 text-xs font-semibold text-room-inverse">Save this layout</button>{canSaveLayouts ? <div className="space-y-1">{player.savedLayouts.map((layout) => <div key={layout.name} className="flex items-center gap-2 rounded-xl bg-room-ink/[.035] p-2 ring-1 ring-room-ink/8"><button type="button" onClick={() => { player.loadLayout(layout.name); setDirty(false); }} className="min-h-8 min-w-0 flex-1 truncate text-left text-xs font-semibold text-room-secondary">{layout.name}</button><button type="button" onClick={() => void player.deleteLayout(layout.name)} className="text-[9px] text-room-muted hover:text-room-danger">Delete</button></div>)}</div> : <a href={savedLayoutsHref} className="block rounded-xl bg-room-ink/[.035] p-3 text-xs leading-4 text-room-muted ring-1 ring-room-ink/8">{savedLayoutsPlan} unlocks synced saved rooms.</a>}</div> : null}
            </div> : null}
          </aside>
        </div>
      </section>
      {closeConfirm ? <div className="fixed inset-0 z-[100] grid place-items-center bg-room-glass/65 p-4" onMouseDown={(event) => { if (event.currentTarget === event.target) setCloseConfirm(false); }}><section role="dialog" aria-modal="true" aria-label="Keep Room Studio changes" className="w-full max-w-sm rounded-2xl border border-room-ink/14 bg-room-raised p-4 shadow-2xl"><p className="text-sm font-semibold">Keep your room changes?</p><p className="mt-1 text-[11px] leading-5 text-room-muted">Changes are live while you edit. Save this room to reuse it, discard to restore the room you opened, or keep editing.</p><div className="mt-4 grid grid-cols-3 gap-2"><button type="button" onClick={() => { saveLayout(); onClose(); }} className="min-h-10 rounded-xl bg-room-ink px-2 text-xs font-semibold text-room-inverse">Save & close</button><button type="button" onClick={discardChanges} className="min-h-10 rounded-xl px-2 text-xs font-semibold text-room-secondary ring-1 ring-room-ink/12 hover:bg-room-ink/8">Discard changes</button><button type="button" onClick={() => setCloseConfirm(false)} className="min-h-10 rounded-xl px-2 text-xs font-semibold text-room-secondary ring-1 ring-room-ink/12 hover:bg-room-ink/8">Keep editing</button></div></section></div> : null}
    </div>
  );
}

function SettingSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div className="grid gap-1">
      <p className="text-xs text-room-muted">{label}</p>
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
  return <label className="grid gap-1 rounded-xl bg-room-ink/[0.035] px-3 py-2 text-xs text-room-muted">{label}<input type="range" min={min} max={max} step={step} value={value} onPointerDown={onBegin} onFocus={onBegin} onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) onBegin?.(); }} onKeyUp={onCommit} onChange={(event) => onChange(Number(event.target.value))} onPointerUp={onCommit} onBlur={onCommit} className="h-11 cursor-pointer accent-room-ink md:h-8" /></label>;
}

function SettingToggle({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" onClick={() => onChange(!value)} aria-pressed={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-room-ink/[0.035] px-3 text-left shadow-xs-skeuomorphic ring-1 ring-inset ring-room-ink/8 outline-focus-ring transition duration-100 ease-linear hover:bg-room-ink/[0.065] hover:ring-room-ink/15 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.99]"><span className={`relative h-5 w-9 shrink-0 rounded-full transition ${value ? "bg-room-ink" : "bg-room-ink/12"}`}><span className={`absolute top-0.5 size-4 rounded-full transition ${value ? "left-[18px] bg-room-inverse" : "left-0.5 bg-room-ink/55"}`} /></span><span className="min-w-0"><span className="block text-[11px] font-semibold text-room-secondary">{label}</span><span className="block truncate text-[9px] text-room-faint">{description}</span></span></button>;
}
