"use client";
/* eslint-disable @next/next/no-img-element -- Studio previews use lightweight posters from runtime provider URLs. */
import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutGrid, MessageSquare, Volume2, X } from "lucide-react";

import { usePlayer } from "@/components/providers/PlayerProvider";

import { contentShape } from "@/lib/watch/playable";

import { readableTitle } from "@/lib/watch/presentation";

import { AUTOPLAY_MODES, WORKSPACE_PRESETS, type WorkspaceTile, type WorkspaceSnapshot, type WorkspacePreset } from "@/lib/watch/workspace";

import { WatchSelect } from "@/components/watch/WatchSelect";

import { gridTileToNormalizedRect, LEGACY_FLOATING_REFERENCE_VIEWPORT, enforceRoomRectAspect, moveAndResolveRoomLayout, normalizeRoomRect, normalizedRectToGridPosition, presetNormalizedRects, resolvePresetRoomLayout, roomLayoutMatchesPreset, type NormalizedRect, type RoomLayoutTile } from "@/lib/watch/room-layout";

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
        const dock = action.before.chatDock;
        if (dock === "left" || dock === "right") {
          const side = Math.max(280, Math.min(520, Math.round(action.before.chatDockSize.side + dx * LEGACY_FLOATING_REFERENCE_VIEWPORT.width * (dock === "right" ? -1 : 1))));
          replaceDraft({ ...action.before, chatDockSize: { ...action.before.chatDockSize, side } }, true);
        } else if (dock === "bottom") {
          const bottom = Math.max(220, Math.min(560, Math.round(action.before.chatDockSize.bottom - dy * LEGACY_FLOATING_REFERENCE_VIEWPORT.height)));
          replaceDraft({ ...action.before, chatDockSize: { ...action.before.chatDockSize, bottom } }, true);
        } else replaceDraft({ ...action.before, chatFloatingRect: rect }, true);
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
    let requested = action.kind === "move"
      ? { ...action.startRect, x: action.startRect.x + mediaDx, y: action.startRect.y + mediaDy }
      : { ...action.startRect, width: action.startRect.width + mediaDx, height: action.startRect.height + mediaDy };
    if (action.kind === "resize") {
      const tile = action.before.tiles.find((entry) => entry.id === action.tileId);
      if (tile) {
        const shape = contentShape(tile.item);
        const mediaAspect = shape === "portrait" ? 9 / 16 : shape === "square" ? 1 : 16 / 9;
        requested = enforceRoomRectAspect(
          requested,
          mediaAspect,
          density,
          Math.abs(mediaDx * action.board.width) >= Math.abs(mediaDy * action.board.height) ? "width" : "height",
        );
      }
    }
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
    } else {
      updatePointerDraft(event.clientX, event.clientY);
      if (!studioSnapshotEqual(action.before, draftRef.current)) commitDraft(draftRef.current, action.before);
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
    const tile = before.tiles.find((entry) => entry.id === tileId);
    const currentRect = tile ? studioTileRect(tile, before) : null;
    let requested: Partial<NormalizedRect> | NormalizedRect = currentRect ? { ...currentRect, ...patch } : patch;
    if (tile && currentRect && (patch.width !== undefined || patch.height !== undefined)) {
      const shape = contentShape(tile.item);
      const mediaAspect = shape === "portrait" ? 9 / 16 : shape === "square" ? 1 : 16 / 9;
      requested = enforceRoomRectAspect(
        requested as NormalizedRect,
        mediaAspect,
        studioDensity(before),
        patch.height !== undefined && patch.width === undefined ? "height" : "width",
      );
    }
    const solution = moveAndResolveRoomLayout(studioTiles(before), tileId, requested, {
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
            <button type="button" onClick={requestClose} className="hidden min-h-10 rounded-xl px-3 text-xs font-semibold text-white/65 ring-1 ring-white/10 transition hover:bg-white/8 hover:text-white sm:inline-flex">Back to room</button>
            <div className="min-w-0"><p className="text-sm font-semibold tracking-tight">Room Studio</p><p className="hidden truncate text-xs text-white/40 sm:block">Arrange a Theater room without interrupting its streams.</p></div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" disabled={!history.length} onClick={undo} className="min-h-10 rounded-lg px-2.5 text-xs font-semibold text-white/65 ring-1 ring-white/10 transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-30">Undo</button>
            <button type="button" disabled={!future.length} onClick={redo} className="hidden min-h-10 rounded-lg px-2.5 text-xs font-semibold text-white/65 ring-1 ring-white/10 transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-30 sm:inline-flex">Redo</button>
            <button type="button" onClick={onShare} className="hidden min-h-10 rounded-lg px-3 text-xs font-semibold text-white/65 ring-1 ring-white/10 transition hover:bg-white/8 sm:inline-flex">Share</button>
            <button type="button" onClick={() => { commitDraft(draftRef.current); onSave(); setDirty(false); }} className="min-h-10 rounded-lg bg-white px-3 text-xs font-semibold text-black shadow-xs-skeuomorphic transition hover:bg-white/90">Save layout</button>
            <button ref={closeButtonRef} type="button" onClick={requestClose} className="grid size-10 place-items-center rounded-lg text-white/55 transition hover:bg-white/8 hover:text-white" aria-label="Close Room Studio"><X className="size-4" /></button>
          </div>
        </header>

        <div className={`flex min-h-0 flex-1 flex-col lg:grid lg:grid-rows-[minmax(0,1fr)] ${presetTrayOpen ? (inspectorOpen ? "lg:grid-cols-[13rem_minmax(0,1fr)_20rem]" : "lg:grid-cols-[13rem_minmax(0,1fr)_3.25rem]") : (inspectorOpen ? "lg:grid-cols-[3.25rem_minmax(0,1fr)_20rem]" : "lg:grid-cols-[3.25rem_minmax(0,1fr)_3.25rem]")}`}>
          <aside className={`order-2 flex shrink-0 gap-2 overflow-x-auto border-t border-white/8 bg-[#0c0c0f] p-2.5 [scrollbar-width:none] transition-[padding] lg:order-none lg:block lg:overflow-y-auto lg:border-r lg:border-t-0 ${presetTrayOpen ? "lg:p-3" : "lg:p-1.5"}`}>
            <div className="hidden lg:block">
              <div className={`flex min-h-10 items-center gap-2 ${presetTrayOpen ? "justify-between" : "justify-center"}`}>
                <p className={presetTrayOpen ? "text-xs font-bold uppercase tracking-[.14em] text-white/38" : "sr-only"}>Room styles</p>
                <button type="button" aria-expanded={presetTrayOpen} aria-label={presetTrayOpen ? "Collapse room styles" : "Open room styles"} onClick={() => setPresetTrayOpen((value) => !value)} className="grid size-9 place-items-center rounded-lg text-white/45 transition hover:bg-white/8 hover:text-white">
                  {presetTrayOpen ? "Hide" : <LayoutGrid className="size-3.5" aria-hidden />}
                </button>
              </div>
              {presetTrayOpen ? <>
                <p className="mt-1 text-xs leading-4 text-white/35">Start in Theater view, then make it yours.</p>
                <div className="mt-3 flex max-h-[27rem] flex-col gap-2 overflow-y-auto">
                  {WORKSPACE_PRESETS.filter((preset) => preset.id !== "freeform").map((preset) => <button key={preset.id} type="button" onClick={() => applyPreset(preset.id)} aria-pressed={draft.preset === preset.id} className={`min-h-11 shrink-0 rounded-xl px-3 text-left text-xs font-semibold ring-1 ring-inset transition ${draft.preset === preset.id ? "bg-white text-black ring-white" : "bg-white/[.035] text-white/65 ring-white/10 hover:bg-white/10 hover:text-white"}`}><span className="block">{preset.label}</span><span className="mt-0.5 block text-[9px] font-normal opacity-60">{preset.description}</span></button>)}
                </div>
                <div className="mt-3 space-y-2 border-t border-white/8 pt-3"><button type="button" onClick={onAdd} className="min-h-10 w-full rounded-xl bg-white/6 px-3 text-left text-xs font-semibold text-white/70 ring-1 ring-white/10 hover:bg-white/10">Add player</button><button type="button" disabled={!liveCount} onClick={onFill} className="min-h-10 w-full rounded-xl bg-white/6 px-3 text-left text-xs font-semibold text-white/70 ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-35">Watch live channels</button></div>
              </> : null}
            </div>
            <div className="flex gap-2 lg:hidden">
              {WORKSPACE_PRESETS.filter((preset) => preset.id !== "freeform").map((preset) => <button key={preset.id} type="button" onClick={() => applyPreset(preset.id)} aria-pressed={draft.preset === preset.id} className={`min-h-11 shrink-0 rounded-xl px-3 text-left text-xs font-semibold ring-1 ring-inset transition ${draft.preset === preset.id ? "bg-white text-black ring-white" : "bg-white/[.035] text-white/65 ring-white/10 hover:bg-white/10 hover:text-white"}`}><span className="block">{preset.label}</span></button>)}
            </div>
          </aside>

          <div className="relative order-1 min-h-0 min-w-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,.06),transparent_42%)] p-3 sm:p-5 lg:order-none">
            <div className="mx-auto flex min-h-full max-w-[1180px] flex-col justify-center">
              <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-white/85">Live layout canvas</p><p className="mt-1 text-xs text-white/42">Streams keep playing behind this lightweight preview. Release to apply.</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-semibold ring-1 ${blocked ? "bg-amber-300/10 text-amber-200 ring-amber-200/20" : "bg-emerald-400/10 text-emerald-300 ring-emerald-300/20"}`}>{blocked ? "Placement blocked" : "Live on release"}</span></div>
              <div
                ref={boardRef}
                role="application"
                tabIndex={0}
                aria-label="Room layout canvas. Arrow keys move the selected tile, Shift plus arrows resize it, Enter makes it main, and Delete removes it."
                onKeyDown={handleStudioKeyDown}
                onPointerMove={onBoardPointerMove}
                onPointerUp={(event) => finishAction(event)}
                onPointerCancel={(event) => finishAction(event, true)}
                className="relative grid aspect-video min-h-0 max-h-[calc(100dvh-11rem)] w-full grid-cols-12 grid-rows-12 gap-1.5 overflow-hidden rounded-[1.4rem] border border-white/12 bg-[#09090c] p-2.5 shadow-[0_32px_120px_rgba(0,0,0,.55)] outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:gap-2 sm:p-3"
              >
                {draft.tiles.map((tile) => {
                  const selectedTile = selected === tile.id;
                  return <article key={tile.id} role="button" tabIndex={-1} onClick={() => { setSelected(tile.id); setTab("layout"); boardRef.current?.focus(); }} style={studioPreviewTileStyle(tile, draft)} className={`group relative min-h-0 overflow-hidden rounded-xl border bg-[#15151a] text-left transition ${selectedTile ? "border-white ring-2 ring-white/50" : "border-white/12 hover:border-white/35"}`} aria-label={`${tile.item.title}. Drag the top edge to move and the corner to resize.`}>
                    {tile.item.poster ? <img src={tile.item.poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" /> : null}<span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/20" />
                    <button type="button" onPointerDown={(event) => beginTileAction(event, tile, "move")} className="absolute inset-x-0 top-0 z-10 h-9 cursor-grab touch-none active:cursor-grabbing" aria-label={`Move ${tile.item.title}`} />
                    <span className="relative z-[2] block p-2"><span className="flex items-center gap-1.5"><span className="truncate text-xs font-semibold">{tile.item.memberLabel}</span>{tile.item.kind === "live" ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/85 px-1 py-0.5 text-[7px] font-bold uppercase tracking-wide text-white"><span className="size-1 rounded-full bg-white" />Live</span> : null}</span><span className="mt-0.5 block line-clamp-2 text-[9px] text-white/58">{readableTitle(tile.item.title)}</span><span className="mt-1 flex flex-wrap gap-1 text-[8px] text-white/64"><span className="rounded bg-black/42 px-1 py-0.5">{contentShape(tile.item) === "portrait" ? "9:16" : contentShape(tile.item) === "square" ? "1:1" : "16:9"}</span><span className="rounded bg-black/42 px-1 py-0.5">{tile.muted ? "Muted" : "Audio on"}</span>{tile.id === draft.focusedTileId ? <span className="rounded bg-white/16 px-1 py-0.5 font-semibold text-white/90">Main</span> : null}</span></span>
                    <button type="button" onPointerDown={(event) => beginTileAction(event, tile, "resize")} className="absolute bottom-1 right-1 z-20 grid size-7 cursor-nwse-resize place-items-center rounded-md bg-black/75 text-xs text-white/80 ring-1 ring-white/15" aria-label={`Resize ${tile.item.title}`}>↘</button>
                  </article>;
                })}
                {draft.chatDock !== "closed" ? <div style={dockStyle} className={`absolute z-30 min-h-0 overflow-hidden rounded-xl border border-dashed bg-[#121216]/95 p-2 text-left shadow-xl transition ${selected === "chat" ? "border-white/75 ring-2 ring-white/35" : "border-white/28 hover:border-white/60"}`}><button type="button" onPointerDown={beginChatAction} onClick={() => { setSelected("chat"); setTab("chat"); }} className="absolute inset-0 z-10 cursor-grab touch-none active:cursor-grabbing" aria-label={`Move chat dock to another edge. Current position: ${draft.chatDock}`} /><span className="relative z-[2] flex items-center gap-1.5 text-white/80"><MessageSquare className="size-3.5" /><span className="text-[9px] font-semibold">Chat dock · {draft.chatDock}</span></span><span className="relative z-[2] mt-2 block h-px bg-white/10" /><span className="relative z-[2] mt-2 block space-y-1.5"><span className="block h-1.5 w-3/4 rounded-full bg-white/22" /><span className="block h-1.5 w-[58%] rounded-full bg-white/12" /><span className="block h-1.5 w-[82%] rounded-full bg-white/16" /></span><span className="relative z-[2] mt-2 hidden text-[8px] text-white/42 sm:block">Drag to dock; resize from Inspector.</span>{<button type="button" onPointerDown={beginChatResizeAction} className={`${draft.chatDock === "right" ? "bottom-1 left-1 cursor-ew-resize" : draft.chatDock === "left" ? "bottom-1 right-1 cursor-ew-resize" : draft.chatDock === "bottom" ? "top-1 right-1 cursor-ns-resize" : "bottom-1 right-1 cursor-nwse-resize"} absolute z-20 grid size-7 touch-none place-items-center rounded-md bg-black/75 text-xs text-white/80 ring-1 ring-white/15`} aria-label="Resize chat dock">↘</button>}</div> : null}
              </div>
            </div>
          </div>

          <aside className={`order-3 min-h-0 shrink-0 overflow-y-auto border-t border-white/8 bg-[#101014] transition-[max-height] lg:border-l lg:border-t-0 ${inspectorOpen ? "max-h-[42dvh] lg:max-h-none" : "max-h-12 lg:max-h-none"}`}>
            <div className={`flex min-h-12 items-center gap-2 border-b border-white/8 px-3 ${inspectorOpen ? "justify-between" : "justify-center"}`}><p className={inspectorOpen ? "text-xs font-semibold text-white/72" : "sr-only"}>Inspector</p><button type="button" aria-expanded={inspectorOpen} onClick={() => setInspectorOpen((value) => !value)} className="rounded-lg px-2 py-1 text-[9px] font-semibold text-white/45 hover:bg-white/8 hover:text-white">{inspectorOpen ? "Collapse" : "Open"}</button></div>
            {inspectorOpen ? <div className="p-3"><div className="grid grid-cols-5 rounded-xl bg-white/[.035] p-1 ring-1 ring-white/8">{(["layout", "chat", "playback", "audio", "saved"] as StudioTab[]).map((entry) => <button key={entry} type="button" onClick={() => setTab(entry)} aria-pressed={tab === entry} className={`min-h-9 rounded-lg px-1 text-[9px] font-semibold capitalize transition ${tab === entry ? "bg-white text-black" : "text-white/42 hover:text-white"}`}>{entry === "playback" ? "Play" : entry}</button>)}</div>
              {tab === "layout" ? <div className="mt-4 space-y-3"><div><p className="text-xs font-semibold">{activeTile ? activeTile.item.memberLabel : "Theater layout"}</p><p className="mt-1 text-xs leading-4 text-white/42">Select a view to move, resize, make main, or remove it.</p></div><SettingRange label={`Snap density · ${density}`} min={4} max={24} value={density} onBegin={beginInspectorEdit} onChange={(value) => updateDraft((current) => ({ ...current, snapDensity: value, columns: value }))} onCommit={commitInspectorEdit} />{activeTile ? <><button type="button" onClick={() => setDraftAndCommit({ ...draftRef.current, focusedTileId: activeTile.id, tiles: draftRef.current.tiles.map((tile) => ({ ...tile, pinned: tile.id === activeTile.id })) })} className="min-h-10 w-full rounded-xl bg-white px-3 text-left text-xs font-semibold text-black">Make main</button><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setTileRect(activeTile.id, { width: studioTileRect(activeTile, draftRef.current).width - 1 / density })} className="min-h-10 rounded-xl text-xs font-semibold text-white/65 ring-1 ring-white/10 hover:bg-white/8">Narrower</button><button type="button" onClick={() => setTileRect(activeTile.id, { width: studioTileRect(activeTile, draftRef.current).width + 1 / density })} className="min-h-10 rounded-xl text-xs font-semibold text-white/65 ring-1 ring-white/10 hover:bg-white/8">Wider</button></div><button type="button" onClick={() => { const before = cloneStudioSnapshot(draftRef.current); const next = { ...before, tiles: before.tiles.filter((tile) => tile.id !== activeTile.id), focusedTileId: before.tiles.find((tile) => tile.id !== activeTile.id)?.id ?? null }; setSelected(next.focusedTileId ?? "chat"); setDraftAndCommit(next); }} className="min-h-10 w-full rounded-xl bg-red-500/10 px-3 text-left text-xs font-semibold text-red-100 ring-1 ring-red-400/20 hover:bg-red-500/15">Remove player</button></> : null}</div> : null}
              {tab === "chat" ? (
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-xs font-semibold">Chat dock</p>
                    <p className="mt-1 text-xs leading-4 text-white/42">Place one persistent dock beside, below, or over the room.</p>
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
                        className={`min-h-10 rounded-lg text-xs font-semibold capitalize ring-1 transition ${draft.chatDock === dock ? "bg-white text-black ring-white" : "bg-white/[.035] text-white/60 ring-white/10 hover:bg-white/10"}`}
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
                  <div onPointerDown={beginDockEdit} onFocusCapture={beginDockEdit} onKeyDownCapture={(event) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) beginDockEdit(); }} className="space-y-2">
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
                <button type="button" onClick={() => setDraftAndCommit({ ...draftRef.current, tiles: draftRef.current.tiles.map((tile) => ({ ...tile, muted: true })) })} className="min-h-10 w-full rounded-xl bg-white/6 px-3 text-left text-xs font-semibold text-white/70 ring-1 ring-white/10 hover:bg-white/10">Mute every tile</button>
                {draft.tiles.map((tile) => <div key={tile.id} className="rounded-xl bg-white/[.035] p-2 ring-1 ring-white/8"><div className="flex items-center gap-2"><button type="button" onClick={() => { const current = draftRef.current; setDraftAndCommit({ ...current, focusedTileId: tile.id, tiles: current.tiles.map((entry) => ({ ...entry, muted: current.mixAudio ? entry.id === tile.id ? false : entry.muted : entry.id !== tile.id })) }); }} className="grid size-7 place-items-center rounded-lg bg-white/8 text-white/70 hover:bg-white hover:text-black" aria-label={`Make ${tile.item.memberLabel} the audio lead`}><Volume2 className="size-3.5" /></button><span className="min-w-0 flex-1 truncate text-xs font-semibold text-white/72">{tile.item.memberLabel}</span></div><input type="range" min="0" max="1" step="0.05" value={tile.muted ? 0 : tile.volume} onPointerDown={beginInspectorEdit} onFocus={beginInspectorEdit} onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) beginInspectorEdit(); }} onKeyUp={commitInspectorEdit} onChange={(event) => { const value = Number(event.target.value); updateDraft((current) => ({ ...current, tiles: current.tiles.map((entry) => entry.id === tile.id ? { ...entry, volume: value, muted: value === 0 } : entry) })); }} onPointerUp={commitInspectorEdit} onBlur={commitInspectorEdit} className="mt-2 h-7 w-full cursor-pointer accent-white" aria-label={`${tile.item.memberLabel} volume`} /><SettingRange label={`Sync delay · ${tile.delaySeconds}s`} min={0} max={30} value={tile.delaySeconds} onBegin={beginInspectorEdit} onChange={(value) => updateDraft((current) => ({ ...current, tiles: current.tiles.map((entry) => entry.id === tile.id ? { ...entry, delaySeconds: value } : entry) }))} onCommit={commitInspectorEdit} /></div>)}
              </div> : null}
              {tab === "saved" ? <div className="mt-4 space-y-3"><p className="text-xs font-semibold">Saved layouts</p><label className="grid gap-1 text-xs text-white/45">Layout name<input value={layoutName} onChange={(event) => onLayoutName(event.target.value)} placeholder="My Theater room" className="min-h-10 rounded-xl bg-white/5 px-3 text-xs text-white ring-1 ring-white/10 outline-none focus:ring-white/25" /></label><button type="button" onClick={() => { commitDraft(draftRef.current); onSave(); setDirty(false); }} className="min-h-10 w-full rounded-xl bg-white px-3 text-xs font-semibold text-black">Save this layout</button>{canSaveLayouts ? <div className="space-y-1">{player.savedLayouts.map((layout) => <div key={layout.name} className="flex items-center gap-2 rounded-xl bg-white/[.035] p-2 ring-1 ring-white/8"><button type="button" onClick={() => { player.loadLayout(layout.name); setDirty(false); }} className="min-h-8 min-w-0 flex-1 truncate text-left text-xs font-semibold text-white/72">{layout.name}</button><button type="button" onClick={() => void player.deleteLayout(layout.name)} className="text-[9px] text-white/40 hover:text-red-200">Delete</button></div>)}</div> : <a href={savedLayoutsHref} className="block rounded-xl bg-white/[.035] p-3 text-xs leading-4 text-white/50 ring-1 ring-white/8">{savedLayoutsPlan} unlocks synced saved rooms.</a>}</div> : null}
            </div> : null}
          </aside>
        </div>
      </section>
      {closeConfirm ? <div className="fixed inset-0 z-[100] grid place-items-center bg-black/65 p-4" onMouseDown={(event) => { if (event.currentTarget === event.target) setCloseConfirm(false); }}><section role="dialog" aria-modal="true" aria-label="Keep Room Studio changes" className="w-full max-w-sm rounded-2xl border border-white/14 bg-[#141419] p-4 shadow-2xl"><p className="text-sm font-semibold">Keep your room changes?</p><p className="mt-1 text-[11px] leading-5 text-white/48">Changes are live while you edit. Save this room to reuse it, discard to restore the room you opened, or keep editing.</p><div className="mt-4 grid grid-cols-3 gap-2"><button type="button" onClick={() => { commitDraft(draftRef.current); onSave(); setDirty(false); onClose(); }} className="min-h-10 rounded-xl bg-white px-2 text-xs font-semibold text-black">Save & close</button><button type="button" onClick={discardChanges} className="min-h-10 rounded-xl px-2 text-xs font-semibold text-white/65 ring-1 ring-white/12 hover:bg-white/8">Discard changes</button><button type="button" onClick={() => setCloseConfirm(false)} className="min-h-10 rounded-xl px-2 text-xs font-semibold text-white/65 ring-1 ring-white/12 hover:bg-white/8">Keep editing</button></div></section></div> : null}
    </div>
  );
}

function SettingSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div className="grid gap-1">
      <p className="text-xs text-white/45">{label}</p>
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
  return <label className="grid gap-1 rounded-xl bg-white/[0.035] px-3 py-2 text-xs text-white/45">{label}<input type="range" min={min} max={max} step={step} value={value} onPointerDown={onBegin} onFocus={onBegin} onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) onBegin?.(); }} onKeyUp={onCommit} onChange={(event) => onChange(Number(event.target.value))} onPointerUp={onCommit} onBlur={onCommit} className="h-11 cursor-pointer accent-white md:h-8" /></label>;
}

function SettingToggle({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" onClick={() => onChange(!value)} aria-pressed={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-white/[0.035] px-3 text-left shadow-xs-skeuomorphic ring-1 ring-inset ring-white/8 outline-focus-ring transition duration-100 ease-linear hover:bg-white/[0.065] hover:ring-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.99]"><span className={`relative h-5 w-9 shrink-0 rounded-full transition ${value ? "bg-white" : "bg-white/12"}`}><span className={`absolute top-0.5 size-4 rounded-full transition ${value ? "left-[18px] bg-black" : "left-0.5 bg-white/55"}`} /></span><span className="min-w-0"><span className="block text-[11px] font-semibold text-white/75">{label}</span><span className="block truncate text-[9px] text-white/35">{description}</span></span></button>;
}
