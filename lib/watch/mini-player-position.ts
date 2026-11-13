/**
 * Pure geometry for the draggable mini player.
 *
 * The mini player keeps its CSS anchor (bottom-left, lifted above the phone
 * bottom nav by CSS) and is moved with `transform` only. A viewer's placement
 * is stored as ratios of the travel range rather than pixels, so a player
 * parked in the top-right corner stays in the top-right corner after a
 * rotation, a window resize, or a size change between video shapes.
 */

export const MINI_PLAYER_POSITION_KEY = "core-mini-player-position:v1";
/** Same gap as the default `bottom-3 left-3` dock. */
export const MINI_PLAYER_EDGE_GAP = 12;
/** Release within this distance of an edge and the player settles onto it. */
export const MINI_PLAYER_SNAP_DISTANCE = 32;
/** One arrow-key press on the move handle. */
export const MINI_PLAYER_NUDGE = 24;
/** Movement before a press becomes a drag (mouse / touch and pen). */
export const MINI_PLAYER_DRAG_THRESHOLD = { mouse: 4, touch: 8 } as const;

/** 0 = left / top of the travel range, 1 = right / bottom. */
export type MiniPlayerPlacement = { x: number; y: number };
export type MiniPlayerPoint = { left: number; top: number };
export type MiniPlayerSize = { width: number; height: number };
/** Space reserved by the header, bottom nav and device safe areas. */
export type MiniPlayerInsets = { top: number; right: number; bottom: number; left: number };
export type MiniPlayerBounds = { minLeft: number; maxLeft: number; minTop: number; maxTop: number };

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function miniPlayerBounds(
  viewport: MiniPlayerSize,
  size: MiniPlayerSize,
  insets: MiniPlayerInsets,
  gap = MINI_PLAYER_EDGE_GAP,
): MiniPlayerBounds {
  const minLeft = insets.left + gap;
  const minTop = insets.top + gap;
  const maxLeft = viewport.width - insets.right - gap - size.width;
  const maxTop = viewport.height - insets.bottom - gap - size.height;
  return {
    // A player wider than the room stays left-aligned; one taller than the
    // room stays bottom-aligned, matching the default dock.
    minLeft,
    maxLeft: Math.max(minLeft, maxLeft),
    minTop: Math.min(minTop, maxTop),
    maxTop,
  };
}

export function clampMiniPlayerPoint(point: MiniPlayerPoint, bounds: MiniPlayerBounds): MiniPlayerPoint {
  return {
    left: Math.min(bounds.maxLeft, Math.max(bounds.minLeft, point.left)),
    top: Math.min(bounds.maxTop, Math.max(bounds.minTop, point.top)),
  };
}

/** Magnetic edges: a drop near an edge settles onto it; anywhere else stays put. */
export function snapMiniPlayerPoint(
  point: MiniPlayerPoint,
  bounds: MiniPlayerBounds,
  distance = MINI_PLAYER_SNAP_DISTANCE,
): MiniPlayerPoint {
  const clamped = clampMiniPlayerPoint(point, bounds);
  let { left, top } = clamped;
  if (left - bounds.minLeft <= distance) left = bounds.minLeft;
  else if (bounds.maxLeft - left <= distance) left = bounds.maxLeft;
  if (top - bounds.minTop <= distance) top = bounds.minTop;
  else if (bounds.maxTop - top <= distance) top = bounds.maxTop;
  return { left, top };
}

export function miniPlayerPlacementFromPoint(point: MiniPlayerPoint, bounds: MiniPlayerBounds): MiniPlayerPlacement {
  const clamped = clampMiniPlayerPoint(point, bounds);
  const xRange = bounds.maxLeft - bounds.minLeft;
  const yRange = bounds.maxTop - bounds.minTop;
  return {
    x: xRange > 0 ? clamp01((clamped.left - bounds.minLeft) / xRange) : 0,
    y: yRange > 0 ? clamp01((clamped.top - bounds.minTop) / yRange) : 1,
  };
}

export function miniPlayerPointFromPlacement(placement: MiniPlayerPlacement, bounds: MiniPlayerBounds): MiniPlayerPoint {
  return {
    left: bounds.minLeft + clamp01(placement.x) * (bounds.maxLeft - bounds.minLeft),
    top: bounds.minTop + clamp01(placement.y) * (bounds.maxTop - bounds.minTop),
  };
}

/** Arrow keys nudge; Shift+arrow jumps to that edge. Returns null for other keys. */
export function nudgeMiniPlayerPoint(
  point: MiniPlayerPoint,
  key: string,
  toEdge: boolean,
  bounds: MiniPlayerBounds,
  step = MINI_PLAYER_NUDGE,
): MiniPlayerPoint | null {
  const next = { ...point };
  if (key === "ArrowLeft") next.left = toEdge ? bounds.minLeft : point.left - step;
  else if (key === "ArrowRight") next.left = toEdge ? bounds.maxLeft : point.left + step;
  else if (key === "ArrowUp") next.top = toEdge ? bounds.minTop : point.top - step;
  else if (key === "ArrowDown") next.top = toEdge ? bounds.maxTop : point.top + step;
  else return null;
  return clampMiniPlayerPoint(next, bounds);
}

/** Which half of the screen the player sits in, so popovers open inward. */
export function miniPlayerSide(placement: MiniPlayerPlacement | null): { vertical: "top" | "bottom"; horizontal: "left" | "right" } {
  return {
    vertical: placement && placement.y < 0.5 ? "top" : "bottom",
    horizontal: placement && placement.x > 0.5 ? "right" : "left",
  };
}

export function parseMiniPlayerPlacement(raw: string | null | undefined): MiniPlayerPlacement | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; x?: unknown; y?: unknown } | null;
    if (!parsed || parsed.v !== 1 || !finite(parsed.x) || !finite(parsed.y)) return null;
    return { x: clamp01(parsed.x), y: clamp01(parsed.y) };
  } catch {
    return null;
  }
}

export function serializeMiniPlayerPlacement(placement: MiniPlayerPlacement): string {
  const round = (value: number) => Math.round(clamp01(value) * 10_000) / 10_000;
  return JSON.stringify({ v: 1, x: round(placement.x), y: round(placement.y) });
}
