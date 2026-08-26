/**
 * Shared, viewport-independent geometry for Multiview and Room Studio.
 *
 * Coordinates are normalized to a fixed 16:9 board (0..1 in each direction),
 * rather than depending on the rendered CSS grid. That lets the runtime and
 * editor agree on placement at every viewport without remounting media.
 */

export type RoomLayoutPreset =
  | "theater-first"
  | "solo"
  | "split"
  | "quad"
  | "main-three"
  | "three-two"
  | "portrait-wall"
  | "chat-first"
  | "freeform";

export type NormalizedRect = {
  /** Left edge as a fraction of the board width. */
  x: number;
  /** Top edge as a fraction of the board height. */
  y: number;
  /** Width as a fraction of the board width. */
  width: number;
  /** Height as a fraction of the board height. */
  height: number;
};

export type GridTilePosition = {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
};

export type RoomLayoutTile = {
  id: string;
  rect: NormalizedRect;
};

export type RoomLayoutConstraints = {
  /** Number of discrete snap units on each board axis. */
  snapDensity?: number;
  minWidth?: number;
  minHeight?: number;
  /** The requested tile is placed first and keeps its requested position. */
  anchorId?: string | null;
};

export type RoomLayoutSolution = {
  tiles: RoomLayoutTile[];
  rejectedIds: string[];
  valid: boolean;
};

export const ROOM_LAYOUT_ASPECT_RATIO = 16 / 9;
export const DEFAULT_ROOM_SNAP_DENSITY = 12;
export const MIN_ROOM_SNAP_DENSITY = 4;
export const MAX_ROOM_SNAP_DENSITY = 24;

/**
 * Old floating-chat workspaces stored right/bottom offsets in pixels. These
 * dimensions are the documented conversion board for those v2 values.
 */
export const LEGACY_FLOATING_REFERENCE_VIEWPORT = {
  width: 1440,
  height: 810,
} as const;

// Geometry serializes to six decimals. Keep the comparison tolerance above
// that rounding noise so adjoining snapped cells do not register as overlaps.
const EPSILON = 0.00001;

function finiteNumber(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function stableNumber(value: number): number {
  return Number(value.toFixed(6));
}

function normalizeGridAxis(value: unknown, fallback: number): number {
  return Math.round(clamp(finiteNumber(value, fallback), 1, 96));
}

export function normalizeSnapDensity(value: unknown, fallback = DEFAULT_ROOM_SNAP_DENSITY): number {
  return Math.round(clamp(finiteNumber(value, fallback), MIN_ROOM_SNAP_DENSITY, MAX_ROOM_SNAP_DENSITY));
}

export function normalizeRoomRect(
  value: Partial<NormalizedRect> | null | undefined,
  fallback: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 },
  options: Pick<RoomLayoutConstraints, "minWidth" | "minHeight"> = {},
): NormalizedRect {
  const minWidth = clamp(finiteNumber(options.minWidth, 0.01), EPSILON, 1);
  const minHeight = clamp(finiteNumber(options.minHeight, 0.01), EPSILON, 1);
  const width = clamp(finiteNumber(value?.width, fallback.width), minWidth, 1);
  const height = clamp(finiteNumber(value?.height, fallback.height), minHeight, 1);
  const x = clamp(finiteNumber(value?.x, fallback.x), 0, 1 - width);
  const y = clamp(finiteNumber(value?.y, fallback.y), 0, 1 - height);
  return {
    x: stableNumber(x),
    y: stableNumber(y),
    width: stableNumber(width),
    height: stableNumber(height),
  };
}

/** Snap a normalized rectangle to the logical Room Studio board. */
export function snapRoomRect(
  value: Partial<NormalizedRect> | null | undefined,
  snapDensity = DEFAULT_ROOM_SNAP_DENSITY,
  options: Pick<RoomLayoutConstraints, "minWidth" | "minHeight"> = {},
): NormalizedRect {
  const density = normalizeSnapDensity(snapDensity);
  const minWidth = Math.max(1 / density, finiteNumber(options.minWidth, 0));
  const minHeight = Math.max(1 / density, finiteNumber(options.minHeight, 0));
  const rect = normalizeRoomRect(value, { x: 0, y: 0, width: 1, height: 1 }, { minWidth, minHeight });
  const widthUnits = clamp(Math.round(rect.width * density), Math.ceil(minWidth * density), density);
  const heightUnits = clamp(Math.round(rect.height * density), Math.ceil(minHeight * density), density);
  const xUnits = clamp(Math.round(rect.x * density), 0, density - widthUnits);
  const yUnits = clamp(Math.round(rect.y * density), 0, density - heightUnits);
  return {
    x: stableNumber(xUnits / density),
    y: stableNumber(yUnits / density),
    width: stableNumber(widthUnits / density),
    height: stableNumber(heightUnits / density),
  };
}

export function roomRectsOverlap(first: NormalizedRect, second: NormalizedRect): boolean {
  return first.x < second.x + second.width - EPSILON
    && first.x + first.width > second.x + EPSILON
    && first.y < second.y + second.height - EPSILON
    && first.y + first.height > second.y + EPSILON;
}

export function roomRectWithinBounds(rect: NormalizedRect): boolean {
  return rect.x >= -EPSILON
    && rect.y >= -EPSILON
    && rect.width > 0
    && rect.height > 0
    && rect.x + rect.width <= 1 + EPSILON
    && rect.y + rect.height <= 1 + EPSILON;
}

export function roomLayoutHasCollisions(tiles: readonly RoomLayoutTile[]): boolean {
  for (let index = 0; index < tiles.length; index += 1) {
    const current = tiles[index];
    if (!current || !roomRectWithinBounds(current.rect)) return true;
    for (let comparison = index + 1; comparison < tiles.length; comparison += 1) {
      const other = tiles[comparison];
      if (other && roomRectsOverlap(current.rect, other.rect)) return true;
    }
  }
  return false;
}

export function gridTileToNormalizedRect(
  position: Partial<GridTilePosition> | null | undefined,
  columns = DEFAULT_ROOM_SNAP_DENSITY,
  rows = DEFAULT_ROOM_SNAP_DENSITY,
): NormalizedRect {
  const safeColumns = normalizeGridAxis(columns, DEFAULT_ROOM_SNAP_DENSITY);
  const safeRows = normalizeGridAxis(rows, DEFAULT_ROOM_SNAP_DENSITY);
  const col = clamp(Math.round(finiteNumber(position?.col, 1)), 1, safeColumns);
  const row = Math.max(1, Math.round(finiteNumber(position?.row, 1)));
  const colSpan = clamp(Math.round(finiteNumber(position?.colSpan, Math.ceil(safeColumns / 2))), 1, safeColumns - col + 1);
  const rowSpan = Math.max(1, Math.round(finiteNumber(position?.rowSpan, 2)));
  // Legacy rows could grow beyond the visible grid. Clamp them to the board
  // rather than generating the unbounded canvas that Room Studio had before.
  const clampedRow = clamp(row, 1, safeRows);
  const clampedRowSpan = clamp(rowSpan, 1, safeRows - clampedRow + 1);
  return normalizeRoomRect({
    x: (col - 1) / safeColumns,
    y: (clampedRow - 1) / safeRows,
    width: colSpan / safeColumns,
    height: clampedRowSpan / safeRows,
  }, { x: 0, y: 0, width: 1, height: 1 }, { minWidth: 1 / safeColumns, minHeight: 1 / safeRows });
}

export function normalizedRectToGridPosition(
  value: Partial<NormalizedRect> | null | undefined,
  columns = DEFAULT_ROOM_SNAP_DENSITY,
  rows = DEFAULT_ROOM_SNAP_DENSITY,
): GridTilePosition {
  const safeColumns = normalizeGridAxis(columns, DEFAULT_ROOM_SNAP_DENSITY);
  const safeRows = normalizeGridAxis(rows, DEFAULT_ROOM_SNAP_DENSITY);
  const rect = normalizeRoomRect(value, { x: 0, y: 0, width: 1, height: 1 }, {
    minWidth: 1 / safeColumns,
    minHeight: 1 / safeRows,
  });
  const col = clamp(Math.round(rect.x * safeColumns) + 1, 1, safeColumns);
  const row = clamp(Math.round(rect.y * safeRows) + 1, 1, safeRows);
  const colSpan = clamp(Math.round(rect.width * safeColumns), 1, safeColumns - col + 1);
  const rowSpan = clamp(Math.round(rect.height * safeRows), 1, safeRows - row + 1);
  return { col, row, colSpan, rowSpan };
}

function distributedUnits(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const remainder = total % parts;
  return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0));
}

function gridRects(count: number, preferredColumns: number, density = DEFAULT_ROOM_SNAP_DENSITY): NormalizedRect[] {
  // A low-density saved room has a finite number of cells. Preserve the
  // requested shape when possible, but widen it before `rows` would exceed
  // the board and create zero-sized distributed units.
  const minimumColumns = Math.ceil(count / density);
  const columns = Math.max(minimumColumns, Math.min(preferredColumns, count, density));
  const rows = Math.max(1, Math.ceil(count / columns));
  const columnUnits = distributedUnits(density, columns);
  const rowUnits = distributedUnits(density, rows);
  return Array.from({ length: count }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const xUnits = columnUnits.slice(0, column).reduce((sum, units) => sum + units, 0);
    const yUnits = rowUnits.slice(0, row).reduce((sum, units) => sum + units, 0);
    return {
      x: xUnits / density,
      y: yUnits / density,
      width: columnUnits[column]! / density,
      height: rowUnits[row]! / density,
    };
  });
}

function theaterRects(count: number, mainWidth: number, density = DEFAULT_ROOM_SNAP_DENSITY): NormalizedRect[] {
  if (count <= 1) return [{ x: 0, y: 0, width: 1, height: 1 }];
  if (count <= 4) {
    const companions = count - 1;
    const mainWidthUnits = clamp(Math.round(mainWidth * density), 1, density - 1);
    const companionHeights = distributedUnits(density, companions);
    let yUnits = 0;
    return [
      { x: 0, y: 0, width: mainWidthUnits / density, height: 1 },
      ...companionHeights.map((heightUnits) => {
        const rect = {
          x: mainWidthUnits / density,
          y: yUnits / density,
          width: (density - mainWidthUnits) / density,
          height: heightUnits / density,
        };
        yUnits += heightUnits;
        return rect;
      }),
    ];
  }

  // Keep the main experience cinematic, then reserve a shallow lower rail for
  // additional monitoring views. Use exact default-snap units here: values
  // such as .125 round up to two cells and used to make the lower rail overlap
  // the side stack after snapping.
  const mainWidthUnits = clamp(Math.round(mainWidth * density), 1, density - 1);
  const sideWidthUnits = density - mainWidthUnits;
  const remaining = count - 4;
  const railColumns = Math.min(4, remaining, density);
  const railRows = Math.ceil(remaining / railColumns);
  const railHeightUnits = railRows;
  const mainHeightUnits = density - railHeightUnits;
  // At a very coarse saved density there is not enough vertical space for a
  // three-item companion stack plus the lower monitoring rail. A regular
  // bounded grid is more useful than snapping a zero-height side slot back
  // into an overlapping cell.
  if (mainHeightUnits < 3) return gridRects(count, Math.min(3, count), density);
  const sideHeights = [
    Math.ceil(mainHeightUnits / 3),
    Math.ceil((mainHeightUnits - Math.ceil(mainHeightUnits / 3)) / 2),
  ];
  sideHeights.push(mainHeightUnits - sideHeights[0]! - sideHeights[1]!);
  const sideOffsets = [0, sideHeights[0]!, sideHeights[0]! + sideHeights[1]!];
  const railWidths = distributedUnits(density, railColumns);
  const railOffsets = railWidths.reduce<number[]>((offsets, units) => {
    offsets.push((offsets.at(-1) ?? 0) + units);
    return offsets;
  }, [0]);
  return [
    { x: 0, y: 0, width: mainWidthUnits / density, height: mainHeightUnits / density },
    ...Array.from({ length: 3 }, (_, index) => ({
      x: mainWidthUnits / density,
      y: sideOffsets[index]! / density,
      width: sideWidthUnits / density,
      height: sideHeights[index]! / density,
    })),
    ...Array.from({ length: remaining }, (_, index) => ({
      x: railOffsets[index % railColumns]! / density,
      y: (mainHeightUnits + Math.floor(index / railColumns)) / density,
      width: railWidths[index % railColumns]! / density,
      height: 1 / density,
    })),
  ];
}

/**
 * Return a bounded 16:9-board layout for the requested preset and count.
 *
 * The snap density is part of the layout contract, not merely a Studio
 * presentation preference.  A room saved on an 8-cell board must receive the
 * same rectangles in the Theater runtime; generating the preset on a hidden
 * 12-cell board and projecting it later used to create subtly different
 * companion sizes and occasionally an overlap on dense lower rails.
 */
export function presetNormalizedRects(
  preset: RoomLayoutPreset,
  tileCount: number,
  snapDensity = DEFAULT_ROOM_SNAP_DENSITY,
): NormalizedRect[] {
  const count = Math.max(1, Math.min(12, Math.round(finiteNumber(tileCount, 1))));
  const density = normalizeSnapDensity(snapDensity);
  let raw: NormalizedRect[];
  switch (preset) {
    case "theater-first":
      raw = theaterRects(count, 0.72, density);
      break;
    case "solo":
      raw = count === 1 ? [{ x: 0, y: 0, width: 1, height: 1 }] : gridRects(count, 1, density);
      break;
    case "split":
      raw = gridRects(count, 2, density);
      break;
    case "quad":
      raw = gridRects(count, count <= 4 ? 2 : 3, density);
      break;
    case "main-three":
      raw = theaterRects(count, 2 / 3, density);
      break;
    case "three-two":
      raw = gridRects(count, 3, density);
      break;
    case "portrait-wall":
      raw = gridRects(count, 3, density);
      break;
    case "chat-first":
      raw = count === 1 ? [{ x: 0, y: 0, width: 1, height: 1 }] : gridRects(count, 2, density);
      break;
    case "freeform":
    default:
      raw = gridRects(count, 2, density);
      break;
  }
  return raw.map((rect) => snapRoomRect(rect, density));
}

function sameRect(left: NormalizedRect, right: NormalizedRect): boolean {
  return Math.abs(left.x - right.x) <= EPSILON
    && Math.abs(left.y - right.y) <= EPSILON
    && Math.abs(left.width - right.width) <= EPSILON
    && Math.abs(left.height - right.height) <= EPSILON;
}

/**
 * Whether the stored rectangles are still the untouched preset arrangement.
 * This lets the Theater runtime retain its adaptive presentation for a fresh
 * Theater-first room while treating every custom saved rectangle—including
 * old snapshots that accidentally retained `theater-first`—as authoritative.
 */
export function roomLayoutMatchesPreset(
  preset: RoomLayoutPreset,
  tiles: readonly RoomLayoutTile[],
  snapDensity = DEFAULT_ROOM_SNAP_DENSITY,
): boolean {
  if (preset === "freeform") return false;
  const density = normalizeSnapDensity(snapDensity);
  const expected = presetNormalizedRects(preset, tiles.length, density);
  return expected.length === tiles.length && tiles.every((tile, index) => (
    sameRect(snapRoomRect(tile.rect, density), expected[index]!)
  ));
}

/**
 * Resolve preset geometry against the source that is currently focused.
 * Theater-first is intentionally focus-aware: choosing a new main source
 * moves that source into the cinematic rectangle without moving a provider
 * iframe between React parents. Other presets retain their saved source order.
 */
export function resolvePresetRoomLayout(
  preset: RoomLayoutPreset,
  tiles: readonly Pick<RoomLayoutTile, "id">[],
  options: {
    focusedId?: string | null;
    snapDensity?: number;
    /** Give a two-source Theater room a 60/40 rail for provider minimums. */
    twitchSafeTheaterPair?: boolean;
  } = {},
): RoomLayoutTile[] {
  const density = normalizeSnapDensity(options.snapDensity);
  const source = tiles.filter((tile): tile is Pick<RoomLayoutTile, "id"> => Boolean(tile?.id)).slice(0, 12);
  const focused = preset === "theater-first" && options.focusedId
    ? source.find((tile) => tile.id === options.focusedId)
    : null;
  const ordered = focused
    ? [focused, ...source.filter((tile) => tile.id !== focused.id)]
    : source;
  // A 25% companion rail is beautiful for ordinary video, but it cannot meet
  // Twitch's 400px minimum on many real desktop stages. Keep the main visibly
  // larger (60/40) instead of falling back to a flat 50/50 pair.
  const rects = preset === "theater-first" && options.twitchSafeTheaterPair && ordered.length === 2
    ? [
        snapRoomRect({ x: 0, y: 0, width: 0.6, height: 1 }, density),
        snapRoomRect({ x: 0.6, y: 0, width: 0.4, height: 1 }, density),
      ]
    : presetNormalizedRects(preset, ordered.length, density);
  const byId = new Map(ordered.map((tile, index) => [tile.id, rects[index]! ]));
  return source.map((tile) => ({ id: tile.id, rect: byId.get(tile.id)! }));
}

function findNearestOpenRect(
  desired: NormalizedRect,
  occupied: readonly RoomLayoutTile[],
  density: number,
): NormalizedRect | null {
  if (!occupied.some((tile) => roomRectsOverlap(desired, tile.rect))) return desired;
  const widthUnits = Math.max(1, Math.round(desired.width * density));
  const heightUnits = Math.max(1, Math.round(desired.height * density));
  const desiredX = Math.round(desired.x * density);
  const desiredY = Math.round(desired.y * density);
  let best: { rect: NormalizedRect; score: number; x: number; y: number } | null = null;
  for (let y = 0; y <= density - heightUnits; y += 1) {
    for (let x = 0; x <= density - widthUnits; x += 1) {
      const candidate = {
        x: x / density,
        y: y / density,
        width: widthUnits / density,
        height: heightUnits / density,
      };
      if (occupied.some((tile) => roomRectsOverlap(candidate, tile.rect))) continue;
      const score = Math.abs(x - desiredX) + Math.abs(y - desiredY);
      if (!best || score < best.score || (score === best.score && (y < best.y || (y === best.y && x < best.x)))) {
        best = { rect: candidate, score, x, y };
      }
    }
  }
  return best?.rect ?? null;
}

/**
 * Deterministically repair a room. The anchor (normally the dragged tile) is
 * placed first, so it retains its requested snapped location; every other tile
 * packs into the nearest open slot. Impossible tiles are returned as rejected.
 */
export function solveRoomLayout(
  source: readonly RoomLayoutTile[],
  constraints: RoomLayoutConstraints = {},
): RoomLayoutSolution {
  const density = normalizeSnapDensity(constraints.snapDensity);
  const ids = new Set<string>();
  const candidates = source
    .filter((tile): tile is RoomLayoutTile => Boolean(tile && typeof tile.id === "string" && tile.id.trim()))
    .filter((tile) => {
      if (ids.has(tile.id)) return false;
      ids.add(tile.id);
      return true;
    })
    .slice(0, 12)
    .map((tile) => ({
      id: tile.id,
      rect: snapRoomRect(tile.rect, density, constraints),
    }));
  const anchorIndex = constraints.anchorId ? candidates.findIndex((tile) => tile.id === constraints.anchorId) : -1;
  const ordered = anchorIndex > 0
    ? [candidates[anchorIndex]!, ...candidates.slice(0, anchorIndex), ...candidates.slice(anchorIndex + 1)]
    : candidates;
  const placed: RoomLayoutTile[] = [];
  const rejectedIds: string[] = [];
  for (const tile of ordered) {
    const rect = findNearestOpenRect(tile.rect, placed, density);
    if (!rect) {
      rejectedIds.push(tile.id);
      continue;
    }
    placed.push({ id: tile.id, rect });
  }
  const byId = new Map(placed.map((tile) => [tile.id, tile]));
  const tiles = candidates.flatMap((tile) => {
    const resolved = byId.get(tile.id);
    return resolved ? [resolved] : [];
  });
  return { tiles, rejectedIds, valid: rejectedIds.length === 0 && !roomLayoutHasCollisions(tiles) };
}

/** Move or resize one tile while deterministically resolving every collision. */
export function moveAndResolveRoomLayout(
  tiles: readonly RoomLayoutTile[],
  tileId: string,
  nextRect: Partial<NormalizedRect>,
  constraints: Omit<RoomLayoutConstraints, "anchorId"> = {},
): RoomLayoutSolution {
  return solveRoomLayout(
    tiles.map((tile) => tile.id === tileId ? { ...tile, rect: { ...tile.rect, ...nextRect } } : tile),
    { ...constraints, anchorId: tileId },
  );
}
