import type { GuideProgram } from "./guide-response";

/** One block in a TV-guide row: a single programme, or a run of short ones. */
export type EpgCell = {
  id: string;
  /** Grid geometry, clipped to the visible day. */
  start: number;
  end: number;
  /** When the programme(s) really air, for labels. */
  airStart: number;
  airEnd: number;
  programs: GuideProgram[];
};

/**
 * Lay a channel's programmes out as non-overlapping cells, like a TV guide.
 *
 * Each programme runs until its own end or the next programme's start,
 * whichever comes first. Consecutive programmes shorter than `minCellMs`
 * (a 24/7 rotation of 40-second Shorts, a burst of uploads) are merged into
 * one readable "mix" cell rather than drawn as slivers. Live programmes are
 * never merged, so what is on air always has its own cell.
 */
export function buildEpgCells(
  programs: readonly GuideProgram[],
  options: { rangeStart: number; rangeEnd: number; minCellMs: number; endOf: (program: GuideProgram) => number },
): EpgCell[] {
  const { rangeStart, rangeEnd, minCellMs, endOf } = options;
  const timed = programs
    .map((program) => ({ program, start: Date.parse(program.startsAt), end: endOf(program) }))
    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && end > start && start < rangeEnd && end > rangeStart)
    .sort((a, b) => a.start - b.start || Number(b.program.status === "live") - Number(a.program.status === "live"));

  const blocks: Array<{ program: GuideProgram; start: number; end: number; airStart: number; airEnd: number }> = [];
  for (let index = 0; index < timed.length; index += 1) {
    const entry = timed[index]!;
    const previous = blocks.at(-1);
    const start = Math.max(entry.start, previous?.end ?? -Infinity, rangeStart);
    // A live programme owns the time up to its end; a later archive entry that
    // overlaps it is moved after it rather than cutting the live cell short.
    let end = Math.min(entry.end, rangeEnd);
    const next = timed[index + 1];
    if (entry.program.status !== "live" && next && next.start < end && next.start > start) end = next.start;
    if (end <= start) continue;
    blocks.push({ program: entry.program, start, end, airStart: entry.start, airEnd: Math.max(end, Math.min(entry.end, next && entry.program.status !== "live" && next.start > entry.start ? next.start : entry.end)) });
  }

  const cells: EpgCell[] = [];
  let run: typeof blocks = [];
  const flush = () => {
    if (!run.length) return;
    cells.push({ id: run.length === 1 ? run[0]!.program.id : `mix:${run[0]!.program.id}`, start: run[0]!.start, end: run.at(-1)!.end, airStart: run[0]!.airStart, airEnd: run.at(-1)!.airEnd, programs: run.map((block) => block.program) });
    run = [];
  };
  for (const block of blocks) {
    const short = block.end - block.start < minCellMs && block.program.status !== "live";
    const contiguous = run.length > 0 && block.start - run.at(-1)!.end < minCellMs;
    if (!short) {
      // A short run that is still too small to read borrows nothing: it stays
      // its own (narrow) cell rather than swallowing a real programme.
      flush();
      cells.push({ id: block.program.id, start: block.start, end: block.end, airStart: block.airStart, airEnd: block.airEnd, programs: [block.program] });
      continue;
    }
    if (run.length && (!contiguous || run.at(-1)!.end - run[0]!.start >= minCellMs)) flush();
    run.push(block);
  }
  flush();
  return cells;
}

/** The cell on air at `nowMs` and the one after it, for now/next highlighting. */
export function epgNowNext(cells: readonly EpgCell[], nowMs: number): { now: EpgCell | null; next: EpgCell | null } {
  const nowIndex = cells.findIndex((cell) => cell.start <= nowMs && cell.end > nowMs);
  const next = cells.find((cell, index) => cell.start > nowMs && index !== nowIndex) ?? null;
  return { now: nowIndex >= 0 ? cells[nowIndex]! : null, next };
}

/** The programme a cell tunes to: the one on air inside a mix, else its first. */
export function cellProgram(cell: EpgCell, nowMs: number): GuideProgram {
  if (cell.programs.length === 1) return cell.programs[0]!;
  return cell.programs.find((program) => Date.parse(program.startsAt) <= nowMs && Date.parse(program.endsAt ?? "") > nowMs) ?? cell.programs[0]!;
}

/** A readable name for a merged run of short programmes. */
export function mixLabel(cell: EpgCell): string {
  const types = new Set(cell.programs.map((program) => program.contentType ?? "video"));
  if (types.size === 1 && types.has("short")) return "Shorts mix";
  if ([...types].every((type) => type === "short" || type === "clip")) return "Shorts & clips";
  return `${cell.programs.length} back-to-back`;
}

/** How far through its slot a cell is, 0–1. */
export function epgProgress(cell: EpgCell, nowMs: number): number {
  return Math.max(0, Math.min(1, (nowMs - cell.start) / Math.max(1, cell.end - cell.start)));
}
