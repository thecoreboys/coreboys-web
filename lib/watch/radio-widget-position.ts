/**
 * Geometry for the desktop DJ Cora / channel dial widget.
 *
 * The widget always rests on a screen edge or in a corner. Its placement is
 * stored as ratios of the travel range (0 = left/top, 1 = right/bottom) with
 * at least one axis pinned to 0 or 1, so a corner stays a corner and an edge
 * stays an edge across window resizes.
 */

export type RadioWidgetAnchor = { x: number; y: number };
export type RadioWidgetBounds = { minX: number; maxX: number; minY: number; maxY: number };
export type RadioWidgetRect = { left: number; top: number; right: number; bottom: number };

/** Bottom-right, clear of the bottom-left App Store badge and help launcher. */
export const DEFAULT_RADIO_WIDGET_ANCHOR: RadioWidgetAnchor = { x: 1, y: 1 };
/** Releasing within this distance of a corner lands in the corner. */
export const RADIO_WIDGET_CORNER_SNAP = 120;

const unit = (value: number) => Math.min(1, Math.max(0, value));
const ratio = (value: number, min: number, max: number) => max > min ? unit((value - min) / (max - min)) : 1;
const pinned = (value: number) => value === 0 || value === 1;

export function anchorToPosition(anchor: RadioWidgetAnchor, bounds: RadioWidgetBounds) {
  return {
    x: Math.round(bounds.minX + (Math.max(0, bounds.maxX - bounds.minX) * unit(anchor.x))),
    y: Math.round(bounds.minY + (Math.max(0, bounds.maxY - bounds.minY) * unit(anchor.y))),
  };
}

/** Snap a released position to the nearest edge, or to a corner when close to one. */
export function snapRadioWidgetAnchor(
  position: { x: number; y: number },
  bounds: RadioWidgetBounds,
  cornerSnap = RADIO_WIDGET_CORNER_SNAP,
): RadioWidgetAnchor {
  const x = Math.min(bounds.maxX, Math.max(bounds.minX, position.x));
  const y = Math.min(bounds.maxY, Math.max(bounds.minY, position.y));
  const distances = {
    left: x - bounds.minX,
    right: bounds.maxX - x,
    top: y - bounds.minY,
    bottom: bounds.maxY - y,
  };
  const horizontal = Math.min(distances.left, distances.right);
  const vertical = Math.min(distances.top, distances.bottom);
  const toSide = (near: number, far: number) => near <= far ? 0 : 1;
  const sideX = toSide(distances.left, distances.right);
  const sideY = toSide(distances.top, distances.bottom);

  if (horizontal <= vertical) {
    // Pinned to the left or right edge; slide along it unless near a corner.
    return { x: sideX, y: vertical <= cornerSnap ? sideY : ratio(y, bounds.minY, bounds.maxY) };
  }
  return { x: horizontal <= cornerSnap ? sideX : ratio(x, bounds.minX, bounds.maxX), y: sideY };
}

/** Move a widget off floating surfaces, upward from the bottom half and downward from the top half. */
export function clearRadioWidgetObstacles(
  position: { x: number; y: number },
  size: { width: number; height: number },
  anchor: RadioWidgetAnchor,
  obstacles: RadioWidgetRect[],
  bounds: RadioWidgetBounds,
  gap = 12,
) {
  const upward = anchor.y >= 0.5;
  let y = position.y;
  for (let pass = 0; pass <= obstacles.length; pass++) {
    const previous = y;
    for (const obstacle of obstacles) {
      if (position.x + size.width <= obstacle.left || position.x >= obstacle.right) continue;
      if (y + size.height <= obstacle.top - gap || y >= obstacle.bottom + gap) continue;
      y = upward ? Math.min(y, obstacle.top - gap - size.height) : Math.max(y, obstacle.bottom + gap);
    }
    if (y === previous) break;
  }
  // Never chase an obstacle off screen; overlapping beats disappearing.
  return { x: position.x, y: Math.min(bounds.maxY, Math.max(bounds.minY, y)) };
}

export function parseRadioWidgetAnchor(value: unknown): RadioWidgetAnchor | null {
  if (!value || typeof value !== "object") return null;
  const { x, y } = value as Partial<RadioWidgetAnchor>;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  // Only edge and corner placements are valid; anything mid-screen resets.
  return pinned(x) || pinned(y) ? { x, y } : null;
}
