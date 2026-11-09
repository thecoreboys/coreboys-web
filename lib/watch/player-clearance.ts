type Box = { left: number; top: number; right: number; bottom: number };
type Position = { x: number; y: number };

/** Keep floating controls clear of a provider's protected playback surface. */
export function clearPlayerSurface(position: Position, width: number, height: number, player: Box,
  viewport: { width: number; height: number; top?: number }, inset = 16): Position {
  const overlaps = ({ x, y }: Position) => x < player.right && x + width > player.left
    && y < player.bottom && y + height > player.top;
  if (!overlaps(position)) return position;
  const candidates = [
    { x: player.left - width - inset, y: (viewport.top ?? 0) + inset },
    { x: position.x, y: player.bottom + inset },
    { x: position.x, y: player.top - height - inset },
    { x: player.right + inset, y: position.y },
  ].filter((point) => point.x >= inset && point.y >= (viewport.top ?? 0) + inset
    && point.x + width <= viewport.width - inset && point.y + height <= viewport.height - inset
    && !overlaps(point));
  candidates.sort((a, b) => Math.hypot(a.x - position.x, a.y - position.y)
    - Math.hypot(b.x - position.x, b.y - position.y));
  return candidates[0] ?? position;
}
