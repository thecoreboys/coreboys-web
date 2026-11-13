"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { ChevronLeft, ChevronRight, Play, Radio } from "lucide-react";
import { useDragScroll } from "@/hooks/useDragScroll";
import { cellProgram, epgNowNext, epgProgress as progressOf, mixLabel, type EpgCell } from "@/lib/watch/guide-epg";
import type { GuideProgram } from "@/lib/watch/guide-response";
import { readableTitle } from "@/lib/watch/presentation";
import { WatchThumb } from "./WatchThumb";
import styles from "./GuideEpg.module.css";

export type EpgLane = {
  key: string;
  network: string;
  label: string;
  kind: "live" | "videos" | "shorts" | "continuous";
  logo: string;
  accent: string;
  portrait: string;
  cells: EpgCell[];
  emptyLabel: string;
};

export type EpgDay = { start: number; label: string; sublabel: string };

const HOUR = 3_600_000;
const HALF_HOUR = 1_800_000;

/**
 * A TV-guide grid: channels down the side, time across the top, programmes as
 * blocks. One scroller owns both axes so the time ruler and channel column
 * stay pinned while the viewer pans through the day by touch, drag, wheel,
 * buttons or the keyboard.
 */
export function GuideEpg({
  lanes,
  rangeStart,
  rangeEnd,
  nowMs,
  days,
  selectedDay,
  onSelectDay,
  formatTime,
  zoneLabel,
  isPlayable,
  onPlay,
  describe,
  toolbarExtra,
  loading,
  initialScroll,
}: {
  lanes: EpgLane[];
  rangeStart: number;
  rangeEnd: number;
  nowMs: number;
  days: EpgDay[];
  selectedDay: number;
  onSelectDay: (dayStart: number, focus?: "start" | "end" | "now") => void;
  formatTime: (ms: number) => string;
  zoneLabel: string;
  isPlayable: (program: GuideProgram) => boolean;
  onPlay: (program: GuideProgram) => void;
  describe: (program: GuideProgram) => { kind: string; platform: string };
  toolbarExtra?: React.ReactNode;
  loading?: boolean;
  /** Where the viewer left the grid, e.g. before tuning from the player guide. */
  initialScroll?: { left: number; top: number };
}) {
  const scroller = useDragScroll<HTMLDivElement>({ wheel: "native" });
  const [metrics, setMetrics] = useState({ hourPx: 300, columnPx: 208, rowPx: 68, measured: false });
  const [view, setView] = useState({ left: 0, width: 1200 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pointerType = useRef<string>("mouse");
  // Until the viewer moves the grid it follows Now (including when the time
  // zone resolves after hydration). Explicit requests always apply.
  const [scrollRequest, setScrollRequest] = useState<{ target: "now" | "start" | "end" | "restore"; id: number }>({ target: initialScroll ? "restore" : "now", id: 0 });
  const userMoved = useRef(Boolean(initialScroll));
  const pxPerMs = metrics.hourPx / HOUR;
  const trackWidth = Math.max(0, (rangeEnd - rangeStart) * pxPerMs);
  const nowVisible = nowMs >= rangeStart && nowMs < rangeEnd;
  const nowX = (nowMs - rangeStart) * pxPerMs;

  // Geometry follows the CSS breakpoints, read from custom properties so the
  // stylesheet stays the single source of truth for phone/tablet/desktop.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const read = () => {
      const style = getComputedStyle(element);
      const value = (name: string, fallback: number) => Number.parseFloat(style.getPropertyValue(name)) || fallback;
      setMetrics((previous) => {
        const next = { hourPx: value("--epg-hour", 300), columnPx: value("--epg-column", 208), rowPx: value("--epg-row", 68), measured: true };
        return previous.measured && previous.hourPx === next.hourPx && previous.columnPx === next.columnPx && previous.rowPx === next.rowPx ? previous : next;
      });
      setView({ left: element.scrollLeft, width: element.clientWidth });
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [scroller]);

  const scrollToTime = useCallback((ms: number, behavior: ScrollBehavior = "smooth", align = 0.3) => {
    const element = scroller.current;
    if (!element) return;
    const visibleTrack = Math.max(0, element.clientWidth - metrics.columnPx);
    element.scrollTo({ left: Math.max(0, (ms - rangeStart) * pxPerMs - visibleTrack * align), behavior });
  }, [metrics.columnPx, pxPerMs, rangeStart, scroller]);

  // Land on Now (or the requested edge of a newly chosen day) once the day's
  // geometry exists. Later data refreshes leave the viewer where they are.
  const appliedRequest = useRef(-1);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || trackWidth === 0 || !metrics.measured) return;
    const fresh = appliedRequest.current !== scrollRequest.id;
    if (!fresh && userMoved.current) return;
    appliedRequest.current = scrollRequest.id;
    const { target } = scrollRequest;
    if (target === "restore" && initialScroll) element.scrollTo({ ...initialScroll, behavior: "instant" });
    else if (target === "end") scrollToTime(rangeEnd, "instant", 1);
    else if (target === "start" || !nowVisible) scrollToTime(rangeStart, "instant", 0);
    else scrollToTime(nowMs - HALF_HOUR / 2, fresh && scrollRequest.id > 0 ? "smooth" : "instant", 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, trackWidth, metrics.measured, metrics.hourPx, scrollRequest]);

  // Keep the chosen day visible in the (horizontally scrolling) day strip
  // without moving the page itself.
  const dayStrip = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const strip = dayStrip.current;
    const chip = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!strip || !chip) return;
    strip.scrollLeft = Math.max(0, chip.offsetLeft - strip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2);
  }, [selectedDay, days.length]);

  const laneNowNext = useMemo(() => lanes.map((lane) => epgNowNext(lane.cells, nowMs)), [lanes, nowMs]);
  const allCells = useMemo(() => lanes.flatMap((lane) => lane.cells), [lanes]);
  const selected = allCells.find((cell) => cell.id === selectedId)
    ?? laneNowNext.find((entry) => entry.now)?.now
    ?? laneNowNext.find((entry) => entry.next)?.next
    ?? allCells[0]
    ?? null;
  const selectedLaneIndex = selected ? lanes.findIndex((lane) => lane.cells.includes(selected)) : -1;
  const selectedLane = selectedLaneIndex >= 0 ? lanes[selectedLaneIndex]! : null;

  function changeDay(dayStart: number, focus: "start" | "end" | "now" = "now") {
    userMoved.current = focus !== "now";
    setScrollRequest((previous) => ({ target: focus, id: previous.id + 1 }));
    if (dayStart !== selectedDay) onSelectDay(dayStart, focus);
  }

  function step(direction: -1 | 1) {
    const element = scroller.current;
    if (!element) return;
    const max = element.scrollWidth - element.clientWidth;
    const dayIndex = days.findIndex((day) => day.start === selectedDay);
    if (direction < 0 && element.scrollLeft <= 2 && dayIndex > 0) return changeDay(days[dayIndex - 1]!.start, "end");
    if (direction > 0 && element.scrollLeft >= max - 2 && dayIndex >= 0 && dayIndex < days.length - 1) return changeDay(days[dayIndex + 1]!.start, "start");
    element.scrollBy({ left: direction * 2 * metrics.hourPx, behavior: "smooth" });
  }

  function goToNow() {
    const today = days.filter((day) => day.start <= nowMs).at(-1);
    changeDay(today?.start ?? selectedDay, "now");
  }

  function cellElement(id: string) {
    return scroller.current?.querySelector<HTMLElement>(`[data-epg-cell="${CSS.escape(id)}"]`) ?? null;
  }

  // Focus lands after React renders the target (it may have been outside the
  // horizontally virtualized window until it became the selection).
  const pendingFocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    const element = cellElement(id);
    if (!element) return;
    pendingFocus.current = null;
    element.focus({ preventScroll: true });
  });

  function focusCell(cell: EpgCell) {
    setSelectedId(cell.id);
    pendingFocus.current = cell.id;
    const element = scroller.current;
    if (!element) return;
    const left = (Math.max(cell.start, rangeStart) - rangeStart) * pxPerMs;
    const right = (Math.min(cell.end, rangeEnd) - rangeStart) * pxPerMs;
    const visibleTrack = element.clientWidth - metrics.columnPx;
    const viewLeft = element.scrollLeft;
    const viewRight = viewLeft + visibleTrack;
    // Only pan when the programme is (nearly) off screen; a long programme
    // that already crosses the view must not yank the grid back to its start.
    if (right < viewLeft + 48 || left > viewRight - 48) {
      element.scrollTo({ left: Math.max(0, left - visibleTrack * 0.15), behavior: "smooth" });
    }
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    userMoved.current = true;
    if (!selected || selectedLaneIndex < 0) return;
    const lane = lanes[selectedLaneIndex]!;
    const index = lane.cells.indexOf(selected);
    // Moving up/down keeps the viewer at the same moment: Now if the programme
    // is on air, else the middle of the part of the programme on screen.
    const element = scroller.current;
    const viewFrom = rangeStart + (element?.scrollLeft ?? 0) / pxPerMs;
    const viewTo = viewFrom + Math.max(0, (element?.clientWidth ?? 0) - metrics.columnPx) / pxPerMs;
    const shownFrom = Math.max(selected.start, viewFrom);
    const shownTo = Math.min(selected.end, viewTo);
    const anchor = nowVisible && selected.start <= nowMs && selected.end > nowMs ? nowMs
      : shownTo > shownFrom ? shownFrom + (shownTo - shownFrom) / 2 : selected.start + (selected.end - selected.start) / 2;
    const verticalTarget = (offset: number) => {
      for (let laneIndex = selectedLaneIndex + offset; laneIndex >= 0 && laneIndex < lanes.length; laneIndex += offset) {
        const cells = lanes[laneIndex]!.cells;
        if (!cells.length) continue;
        return cells.find((cell) => cell.start <= anchor && cell.end > anchor)
          ?? cells.reduce((best, cell) => Math.abs(cell.start - anchor) < Math.abs(best.start - anchor) ? cell : best);
      }
      return null;
    };
    let target: EpgCell | null | undefined = null;
    if (event.key === "ArrowRight") target = lane.cells[index + 1];
    else if (event.key === "ArrowLeft") target = lane.cells[index - 1];
    else if (event.key === "ArrowDown") target = verticalTarget(1);
    else if (event.key === "ArrowUp") target = verticalTarget(-1);
    else if (event.key === "Home") target = lane.cells[0];
    else if (event.key === "End") target = lane.cells.at(-1);
    else if (event.key.toLowerCase() === "n" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      const live = laneNowNext[selectedLaneIndex]?.now;
      if (live) focusCell(live);
      goToNow();
      return;
    } else return;
    event.preventDefault();
    if (target) focusCell(target);
  }

  function activate(cell: EpgCell) {
    // On touch the first tap previews the programme in the info panel and the
    // second tap tunes, so a viewer can read before committing. Mouse and
    // keyboard tune immediately (hover and focus already preview).
    if (pointerType.current === "touch" && selected?.id !== cell.id) {
      setSelectedId(cell.id);
      return;
    }
    const program = cellProgram(cell, nowMs);
    if (isPlayable(program)) onPlay(program);
    else window.open(program.sourceUrl, "_blank", "noopener,noreferrer");
  }

  const viewStart = rangeStart + (view.left - 2 * metrics.hourPx) / pxPerMs;
  const viewEnd = rangeStart + (view.left + view.width + 2 * metrics.hourPx) / pxPerMs;
  const ticks = useMemo(() => {
    const output: number[] = [];
    for (let cursor = Math.ceil(rangeStart / HALF_HOUR) * HALF_HOUR; cursor < rangeEnd; cursor += HALF_HOUR) output.push(cursor);
    return output;
  }, [rangeEnd, rangeStart]);

  const boardStyle = { "--epg-track-w": `${trackWidth}px` } as CSSProperties;
  const dayIndex = days.findIndex((day) => day.start === selectedDay);
  const selectedProgram = selected ? cellProgram(selected, nowMs) : null;
  const selectedState = selected && selectedLaneIndex >= 0 ? cellState(selected, laneNowNext[selectedLaneIndex]!, nowMs) : null;

  return (
    <section className={styles.epg} aria-labelledby="guide-epg-title" data-guide-epg>
      <h2 id="guide-epg-title" className="sr-only">Program guide grid</h2>
      <div className={styles.toolbar}>
        <div ref={dayStrip} className={styles.days} role="group" aria-label="Choose a day">
          {days.map((day) => (
            <button key={day.start} type="button" aria-pressed={day.start === selectedDay} onClick={() => changeDay(day.start, nowMs >= day.start && nowMs < day.start + 26 * HOUR ? "now" : "start")}>
              <strong>{day.label}</strong><span>{day.sublabel}</span>
            </button>
          ))}
        </div>
        <div className={styles.controls}>
          {toolbarExtra ? <span className={styles.extra}>{toolbarExtra}</span> : null}
          <button type="button" className={styles.iconButton} onClick={() => step(-1)} disabled={dayIndex <= 0 && view.left <= 2} aria-label="Earlier"><ChevronLeft size={18} aria-hidden="true" /></button>
          <button type="button" className={styles.nowButton} onClick={goToNow}><Radio size={15} aria-hidden="true" />Now</button>
          <button type="button" className={styles.iconButton} onClick={() => step(1)} aria-label="Later"><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
      </div>

      <div className={styles.info} aria-live="polite">
        {selected && selectedProgram && selectedLane ? (
          <>
            <span className={styles.infoArt}>
              <WatchThumb src={selectedProgram.thumbnailUrl || selectedLane.portrait} youtubeId={selectedProgram.youtubeId ?? undefined} alt="" fallback={<span className={styles.infoArtFallback}>{selectedLane.network}</span>} />
            </span>
            <div className={styles.infoCopy}>
              <p className={styles.infoMeta}>
                {selectedState ? <span className={styles.badge} data-state={selectedState}>{stateLabel(selectedState, selectedProgram)}</span> : null}
                <span>{selectedLane.network} · {selectedLane.label}</span>
              </p>
              <h3>{selected.programs.length > 1 ? `${mixLabel(selected)} · ${readableTitle(selectedProgram.title)}` : readableTitle(selectedProgram.title)}</h3>
              <p className={styles.infoTime}>
                {formatTime(selected.airStart)} – {selectedProgram.status === "live" ? "Live" : formatTime(selected.airEnd)}
                <span aria-hidden="true"> · </span>{describe(selectedProgram).kind}
                {selected.programs.length > 1 ? <> · {selected.programs.length} picks</> : null}
              </p>
              {selectedState === "now" ? <span className={styles.infoProgress} aria-hidden="true"><i style={{ width: `${progressOf(selected, nowMs) * 100}%` }} /></span> : null}
            </div>
            <button type="button" className={styles.watch} onClick={() => { const program = cellProgram(selected, nowMs); if (isPlayable(program)) onPlay(program); else window.open(program.sourceUrl, "_blank", "noopener,noreferrer"); }}>
              <Play size={16} fill="currentColor" aria-hidden="true" />
              {isPlayable(selectedProgram) ? (selectedState === "now" || selectedProgram.status === "live" ? "Watch now" : "Watch") : `Open on ${describe(selectedProgram).platform}`}
            </button>
          </>
        ) : <p className={styles.infoEmpty}>{loading ? "Getting the lineup…" : "Choose a program to see what’s on."}</p>}
      </div>

      <div
        ref={scroller}
        className={`${styles.scroller} guide-epg-scroll`}
        role="region"
        aria-label={`Program guide, ${days[dayIndex]?.label ?? ""} ${days[dayIndex]?.sublabel ?? ""}. Use the arrow keys to move between programs and channels, N to jump to now, and Enter to watch.`}
        aria-busy={loading || undefined}
        data-lenis-prevent
        onKeyDown={handleKey}
        onPointerDown={(event: PointerEvent) => { pointerType.current = event.pointerType; userMoved.current = true; }}
        onWheel={() => { userMoved.current = true; }}
        onScroll={(event) => {
          const element = event.currentTarget;
          setView((previous) => Math.abs(previous.left - element.scrollLeft) < metrics.hourPx / 2 && previous.width === element.clientWidth
            ? previous : { left: element.scrollLeft, width: element.clientWidth });
        }}
      >
        <div className={styles.board} style={boardStyle}>
          <div className={styles.rulerRow}>
            <div className={styles.corner}><strong>{days[dayIndex]?.label}</strong><span>{zoneLabel}</span></div>
            <div className={styles.ruler} aria-hidden="true">
              {ticks.map((tick) => (
                <span key={tick} className={styles.tick} data-hour={tick % HOUR === 0 || undefined} style={{ left: (tick - rangeStart) * pxPerMs }}>{formatTime(tick)}</span>
              ))}
              {nowVisible ? <span className={styles.nowPill} style={{ left: nowX }}>Now</span> : null}
            </div>
          </div>

          {lanes.map((lane, laneIndex) => {
            const { now, next } = laneNowNext[laneIndex]!;
            const visible = lane.cells.filter((cell) => (cell.end > viewStart && cell.start < viewEnd) || cell.id === selected?.id);
            return (
              <div key={lane.key} className={styles.row} data-kind={lane.kind} style={{ "--epg-accent": lane.accent } as CSSProperties}>
                <div className={styles.channel} title={`${lane.network} · ${lane.label}`}>
                  <span className={styles.logo}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={lane.logo} alt="" />
                  </span>
                  <span className={styles.channelCopy}>
                    <strong>{lane.network}</strong>
                    <span data-kind={lane.kind}>{lane.kind === "live" ? <i aria-hidden="true" /> : null}{lane.label}</span>
                  </span>
                </div>
                <div className={styles.track}>
                  {visible.map((cell) => {
                    const program = cellProgram(cell, nowMs);
                    const state = cell === now ? "now" : cell === next ? "next" : cell.end <= nowMs ? "past" : "later";
                    const left = (Math.max(cell.start, rangeStart) - rangeStart) * pxPerMs;
                    const width = Math.max(4, (Math.min(cell.end, rangeEnd) - Math.max(cell.start, rangeStart)) * pxPerMs - 3);
                    const label = cell.programs.length > 1 ? mixLabel(cell) : readableTitle(program.title);
                    return (
                      <button
                        key={cell.id}
                        type="button"
                        data-epg-cell={cell.id}
                        className={styles.cell}
                        data-state={state}
                        data-live={program.status === "live" || undefined}
                        data-selected={selected?.id === cell.id || undefined}
                        data-narrow={width < 96 || undefined}
                        tabIndex={selected?.id === cell.id ? 0 : -1}
                        style={{ left, width, ...(state === "now" ? { "--epg-progress": progressOf(cell, nowMs) } : {}) } as CSSProperties}
                        onMouseEnter={() => { if (pointerType.current === "mouse") setSelectedId(cell.id); }}
                        onFocus={() => setSelectedId(cell.id)}
                        onClick={() => activate(cell)}
                        aria-label={`${label}, ${lane.network} ${lane.label}, ${formatTime(cell.airStart)} to ${program.status === "live" ? "live now" : formatTime(cell.airEnd)}${state === "now" ? ", on now" : state === "next" ? ", up next" : ""}`}
                      >
                        <span className={styles.cellBody}>
                          {program.status === "live" ? <span className={styles.liveTag}>Live</span> : state === "next" ? <span className={styles.nextTag}>Next</span> : null}
                          <strong>{label}</strong>
                          <span className={styles.cellTime}>{cell.programs.length > 1 ? readableTitle(program.title) : `${formatTime(cell.airStart)} – ${program.status === "live" ? "Live" : formatTime(cell.airEnd)}`}</span>
                        </span>
                      </button>
                    );
                  })}
                  {!lane.cells.length ? <span className={styles.empty}>{loading ? "Loading…" : lane.emptyLabel}</span> : null}
                  {lane.cells.length && !now && nowVisible && lane.kind === "live" ? (
                    <span className={styles.offAir} style={{ left: nowX + 8 }}>{next ? `Off air · next ${formatTime(next.start)}` : "Off air"}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
          {nowVisible ? <span className={styles.nowLine} style={{ left: `calc(var(--epg-column) + ${nowX}px)` }} aria-hidden="true" /> : null}
        </div>
      </div>
    </section>
  );
}

function cellState(cell: EpgCell, laneNowNext: { now: EpgCell | null; next: EpgCell | null }, nowMs: number) {
  if (cell === laneNowNext.now) return "now" as const;
  if (cell === laneNowNext.next) return "next" as const;
  return cell.end <= nowMs ? "past" as const : "later" as const;
}

function stateLabel(state: ReturnType<typeof cellState>, program: GuideProgram) {
  if (program.status === "live") return "Live";
  if (state === "now") return "On now";
  if (state === "next") return "Up next";
  if (state === "past") return program.status === "replay" ? "Aired" : "Earlier";
  return program.status === "upcoming" ? "Scheduled" : "Later";
}
