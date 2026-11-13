"use client";

import { ArrowLeftRight } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import styles from "./TileSwapDrag.module.css";

/**
 * Pointer-driven "pick up and swap" for multiview tiles.
 *
 * Native HTML5 drag-and-drop never fires for touch, and an iframe under the
 * cursor swallows dragover, so tiles are moved with pointer events instead.
 * Visual state lives in DOM data attributes so the heavy, memoized player
 * tiles never re-render while a finger moves.
 */

export type TileSwapMeta = { title: string; subtitle?: string; poster?: string | null };

type DragSession = {
  pointerId: number;
  sourceId: string;
  meta: TileSwapMeta;
  startX: number;
  startY: number;
  x: number;
  y: number;
  started: boolean;
  targetId: string | null;
  holdTimer: number | null;
  /** Touch on a tile body waits for a long press so normal scrolling still works. */
  requiresHold: boolean;
};

type TileSwapApi = {
  /** Wire to a drag handle (moves after a few pixels) or, with `hold`, to a tile body (long press). */
  begin: (event: ReactPointerEvent<HTMLElement>, sourceId: string, meta: TileSwapMeta, options?: { hold?: boolean }) => void;
  /** Arrow-key alternative for the drag handle. */
  keyboard: (event: ReactKeyboardEvent<HTMLElement>, sourceId: string, title: string) => void;
  /** Menu alternative: swap two views directly, with the same settle animation. */
  swapWith: (sourceId: string, targetId: string, announcement: string) => void;
};

const noop: TileSwapApi = { begin: () => {}, keyboard: () => {}, swapWith: () => {} };
const TileSwapContext = createContext<TileSwapApi>(noop);

export function useTileSwap() {
  return useContext(TileSwapContext);
}

/** Attributes every swappable tile root needs. */
export function tileSwapTarget(id: string) {
  return { "data-swap-target": "", "data-tile-id": id } as const;
}

const MOVE_THRESHOLD = 6;
const HOLD_MS = 320;
const HOLD_TOLERANCE = 10;

function tileElement(root: HTMLElement | null, id: string) {
  return root?.querySelector<HTMLElement>(`[data-swap-target][data-tile-id="${CSS.escape(id)}"]`) ?? null;
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function buzz(ms: number) {
  try {
    // Browsers reject (and log) vibration before a real user tap.
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (activation && !activation.hasBeenActive) return;
    navigator.vibrate?.(ms);
  } catch {
    // Haptics are optional.
  }
}

export function TileSwapProvider({
  children,
  onSwap,
  className,
}: {
  children: ReactNode;
  onSwap: (sourceId: string, targetId: string) => void;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const session = useRef<DragSession | null>(null);
  const frame = useRef<number | null>(null);
  const ghostPos = useRef({ x: 0, y: 0, tilt: 0 });
  const onSwapRef = useRef(onSwap);
  onSwapRef.current = onSwap;
  const [ghost, setGhost] = useState<TileSwapMeta | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const setState = useCallback((id: string | null, state: "source" | "target" | null) => {
    if (!id) return;
    const element = tileElement(rootRef.current, id);
    if (!element) return;
    if (state) element.dataset.swapState = state;
    else delete element.dataset.swapState;
  }, []);

  const settle = useCallback((ids: string[]) => {
    for (const id of ids) {
      const element = tileElement(rootRef.current, id);
      if (!element) continue;
      element.dataset.swapSettle = "true";
      window.setTimeout(() => { delete element.dataset.swapSettle; }, 520);
    }
  }, []);

  const animateGhost = useCallback(() => {
    frame.current = null;
    const current = session.current;
    const node = ghostRef.current;
    if (!current?.started || !node) return;
    const pos = ghostPos.current;
    const still = reducedMotion();
    // Ease toward the pointer: a soft trailing card reads as weight, not lag.
    const ease = still ? 1 : 0.32;
    const dx = current.x - pos.x;
    pos.x += dx * ease;
    pos.y += (current.y - pos.y) * ease;
    pos.tilt = still ? 0 : Math.max(-9, Math.min(9, pos.tilt * 0.82 + dx * 0.05));
    node.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -62%) rotate(${pos.tilt.toFixed(2)}deg)`;
    if (Math.abs(dx) > 0.3 || Math.abs(current.y - pos.y) > 0.3 || Math.abs(pos.tilt) > 0.05) {
      frame.current = window.requestAnimationFrame(animateGhost);
    }
  }, []);

  const schedule = useCallback(() => {
    if (frame.current === null) frame.current = window.requestAnimationFrame(animateGhost);
  }, [animateGhost]);

  const updateTarget = useCallback((x: number, y: number) => {
    const current = session.current;
    if (!current) return;
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-swap-target]");
    const inRoom = hit && rootRef.current?.contains(hit) ? hit : null;
    const id = inRoom?.dataset.tileId ?? null;
    const next = id && id !== current.sourceId ? id : null;
    if (next === current.targetId) return;
    setState(current.targetId, null);
    setState(next, "target");
    current.targetId = next;
    if (next) buzz(6);
  }, [setState]);

  const cleanup = useCallback((commit: boolean) => {
    const current = session.current;
    session.current = null;
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    frame.current = null;
    if (!current) return;
    if (current.holdTimer !== null) window.clearTimeout(current.holdTimer);
    setState(current.sourceId, null);
    setState(current.targetId, null);
    delete document.documentElement.dataset.tileDragging;
    setGhost(null);
    if (commit && current.started && current.targetId) {
      const targetTitle = tileElement(rootRef.current, current.targetId)?.getAttribute("aria-label")?.replace(/ player$/, "");
      onSwapRef.current(current.sourceId, current.targetId);
      settle([current.sourceId, current.targetId]);
      buzz(12);
      setAnnouncement(`Swapped ${current.meta.title}${targetTitle ? ` with ${targetTitle}` : ""}.`);
    } else if (current.started) {
      setAnnouncement("Move cancelled.");
    }
  }, [setState, settle]);

  const start = useCallback(() => {
    const current = session.current;
    if (!current || current.started) return;
    current.started = true;
    // The press that started a move must not also fire the tile's click.
    document.documentElement.dataset.tileDragJustEnded = "true";
    ghostPos.current = { x: current.x, y: current.y, tilt: 0 };
    document.documentElement.dataset.tileDragging = "true";
    setState(current.sourceId, "source");
    setGhost(current.meta);
    buzz(10);
    setAnnouncement(`Picked up ${current.meta.title}. Drop it on another view to swap places. Escape cancels.`);
    updateTarget(current.x, current.y);
    schedule();
  }, [schedule, setState, updateTarget]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = session.current;
      if (!current || event.pointerId !== current.pointerId) return;
      current.x = event.clientX;
      current.y = event.clientY;
      const distance = Math.hypot(current.x - current.startX, current.y - current.startY);
      if (!current.started) {
        if (current.requiresHold) {
          // Moving before the hold completes means the viewer is scrolling.
          if (distance > HOLD_TOLERANCE) cleanup(false);
          return;
        }
        if (distance < MOVE_THRESHOLD) return;
        start();
      }
      updateTarget(current.x, current.y);
      schedule();
    };
    const up = (event: PointerEvent) => {
      const current = session.current;
      if (!current || event.pointerId !== current.pointerId) return;
      cleanup(event.type === "pointerup");
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && session.current?.started) {
        event.preventDefault();
        cleanup(false);
      }
    };
    // Once a hold has turned into a drag, the page must not scroll under it.
    const touchMove = (event: TouchEvent) => {
      if (session.current?.started && event.cancelable) event.preventDefault();
    };
    const suppressClick = (event: MouseEvent) => {
      if (document.documentElement.dataset.tileDragJustEnded) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", key);
    document.addEventListener("touchmove", touchMove, { passive: false });
    window.addEventListener("click", suppressClick, true);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
      document.removeEventListener("touchmove", touchMove);
      window.removeEventListener("click", suppressClick, true);
      cleanup(false);
    };
  }, [cleanup, schedule, start, updateTarget]);

  const begin = useCallback<TileSwapApi["begin"]>((event, sourceId, meta, options) => {
    if (event.button !== 0 || session.current) return;
    const hold = Boolean(options?.hold) && event.pointerType !== "mouse";
    if (options?.hold && event.pointerType === "mouse") return;
    if (!hold) {
      // A handle owns its gesture: keep text selection from reacting and keep
      // receiving moves even when the pointer crosses a provider iframe.
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture is best-effort; window listeners still track the pointer.
      }
    }
    event.stopPropagation();
    const current: DragSession = {
      pointerId: event.pointerId,
      sourceId,
      meta,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      started: false,
      targetId: null,
      holdTimer: null,
      requiresHold: hold,
    };
    if (hold) {
      current.holdTimer = window.setTimeout(() => {
        if (session.current !== current) return;
        current.holdTimer = null;
        start();
      }, HOLD_MS);
    }
    session.current = current;
  }, [start]);

  // Clear the click suppressor after any gesture finishes.
  useEffect(() => {
    if (ghost) return;
    const timer = window.setTimeout(() => { delete document.documentElement.dataset.tileDragJustEnded; }, 60);
    return () => window.clearTimeout(timer);
  }, [ghost]);

  const keyboard = useCallback<TileSwapApi["keyboard"]>((event, sourceId, title) => {
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
    if (!forward && !backward) return;
    const tiles = [...(rootRef.current?.querySelectorAll<HTMLElement>("[data-swap-target]") ?? [])]
      .map((element) => ({ id: element.dataset.tileId ?? "", rect: element.getBoundingClientRect() }))
      .filter((entry) => entry.id)
      // Reading order: rows top-to-bottom (with slack for uneven tiles), then left-to-right.
      .sort((a, b) => Math.abs(a.rect.top - b.rect.top) > 24 ? a.rect.top - b.rect.top : a.rect.left - b.rect.left);
    const index = tiles.findIndex((entry) => entry.id === sourceId);
    const neighbor = tiles[index + (forward ? 1 : -1)];
    if (index < 0 || !neighbor) return;
    event.preventDefault();
    event.stopPropagation();
    onSwapRef.current(sourceId, neighbor.id);
    settle([sourceId, neighbor.id]);
    setAnnouncement(`Moved ${title} to position ${index + (forward ? 2 : 0)} of ${tiles.length}.`);
  }, [settle]);

  const swapWith = useCallback<TileSwapApi["swapWith"]>((sourceId, targetId, message) => {
    if (sourceId === targetId) return;
    onSwapRef.current(sourceId, targetId);
    settle([sourceId, targetId]);
    setAnnouncement(message);
  }, [settle]);

  const api = useMemo<TileSwapApi>(() => ({ begin, keyboard, swapWith }), [begin, keyboard, swapWith]);

  return (
    <TileSwapContext.Provider value={api}>
      <div ref={rootRef} className={`${styles.root} ${className ?? ""}`} data-tile-swap-root>
        {children}
      </div>
      <p className="sr-only" aria-live="assertive">{announcement}</p>
      {mounted && ghost ? createPortal(
        <div ref={ghostRef} className={styles.ghost} aria-hidden>
          <div className={styles.ghostCard}>
            <div className={styles.ghostArt}>
              {ghost.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ghost.poster} alt="" draggable={false} />
              ) : null}
              <span className={styles.ghostSheen} />
            </div>
            <div className={styles.ghostMeta}>
              <span className={styles.ghostIcon}><ArrowLeftRight size={13} /></span>
              <span className={styles.ghostText}>
                <strong>{ghost.title}</strong>
                {ghost.subtitle ? <span>{ghost.subtitle}</span> : null}
              </span>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </TileSwapContext.Provider>
  );
}
