"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { prefersMinimalMotion } from "@/lib/motion";
import {
  MINI_PLAYER_DRAG_THRESHOLD,
  MINI_PLAYER_POSITION_KEY,
  clampMiniPlayerPoint,
  miniPlayerBounds,
  miniPlayerPlacementFromPoint,
  miniPlayerPointFromPlacement,
  miniPlayerSide,
  nudgeMiniPlayerPoint,
  parseMiniPlayerPlacement,
  serializeMiniPlayerPlacement,
  snapMiniPlayerPoint,
  type MiniPlayerBounds,
  type MiniPlayerInsets,
  type MiniPlayerPlacement,
  type MiniPlayerPoint,
} from "@/lib/watch/mini-player-position";

/** A drag never starts from the player's own controls or provider frames. */
export const MINI_PLAYER_NO_DRAG_SELECTOR = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "iframe",
  "video",
  "[role='button']",
  "[role='slider']",
  "[role='dialog']",
  "[role='menu']",
  "[contenteditable='true']",
  "[data-mini-player-no-drag]",
].join(",");

const SETTLE_TRANSITION = [
  "transform var(--motion-base, 240ms) var(--motion-ease-out, cubic-bezier(0.16, 1, 0.3, 1))",
  "width 300ms cubic-bezier(0.4, 0, 0.2, 1)",
  "opacity 300ms cubic-bezier(0.4, 0, 0.2, 1)",
].join(", ");

// The placement survives route changes in memory, and reloads in storage.
let cachedPlacement: MiniPlayerPlacement | null | undefined;

function readPlacement(): MiniPlayerPlacement | null {
  if (cachedPlacement !== undefined) return cachedPlacement;
  try {
    cachedPlacement = parseMiniPlayerPlacement(window.localStorage.getItem(MINI_PLAYER_POSITION_KEY));
  } catch {
    // Storage can be blocked; the player still docks and drags.
    cachedPlacement = null;
  }
  return cachedPlacement;
}

function writePlacement(placement: MiniPlayerPlacement | null) {
  cachedPlacement = placement;
  try {
    if (placement) window.localStorage.setItem(MINI_PLAYER_POSITION_KEY, serializeMiniPlayerPlacement(placement));
    else window.localStorage.removeItem(MINI_PLAYER_POSITION_KEY);
  } catch {
    // Private browsing can refuse storage; the in-memory placement still holds.
  }
}

let insetProbe: HTMLDivElement | null = null;

/**
 * Header, phone bottom nav and safe areas resolved to pixels. CSS variables
 * like `--mobile-nav-space` hold `calc(... env(...))`, which only the layout
 * engine can resolve, so a hidden probe reads them back as padding.
 */
function readInsets(): MiniPlayerInsets {
  if (!insetProbe || !insetProbe.isConnected) {
    insetProbe = document.createElement("div");
    insetProbe.setAttribute("aria-hidden", "true");
    insetProbe.dataset.miniPlayerInsetProbe = "";
    Object.assign(insetProbe.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "0",
      height: "0",
      visibility: "hidden",
      pointerEvents: "none",
      boxSizing: "content-box",
      paddingTop: "max(env(safe-area-inset-top, 0px), var(--site-header-h, 0px))",
      paddingRight: "env(safe-area-inset-right, 0px)",
      paddingBottom: "max(env(safe-area-inset-bottom, 0px), var(--mobile-nav-space, 0px))",
      paddingLeft: "env(safe-area-inset-left, 0px)",
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(insetProbe);
  }
  const style = window.getComputedStyle(insetProbe);
  const px = (value: string) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    top: px(style.paddingTop),
    right: px(style.paddingRight),
    bottom: px(style.paddingBottom),
    left: px(style.paddingLeft),
  };
}

type Measurement = { base: MiniPlayerPoint; bounds: MiniPlayerBounds };

type Gesture = {
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  origin: MiniPlayerPoint;
  measurement: Measurement;
  dragging: boolean;
  point: MiniPlayerPoint;
};

export type MiniPlayerDragSide = ReturnType<typeof miniPlayerSide>;

/**
 * Lets the viewer drag the docked mini player anywhere on screen. The element
 * keeps its CSS dock (bottom-left) as an anchor and moves by `transform`
 * only. Pass `enabled: false` for the full player page, and every inline
 * style this hook wrote is removed.
 */
export function useMiniPlayerDrag(elementRef: RefObject<HTMLElement | null>, enabled: boolean) {
  const offsetRef = useRef({ x: 0, y: 0 });
  const gestureRef = useRef<Gesture | null>(null);
  const cleanupGestureRef = useRef<(() => void) | null>(null);
  const [dragging, setDragging] = useState(false);
  const [placement, setPlacement] = useState<MiniPlayerPlacement | null>(null);

  const measure = useCallback((element: HTMLElement): Measurement => {
    const style = window.getComputedStyle(element);
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const viewport = { width: document.documentElement.clientWidth || window.innerWidth, height: window.innerHeight };
    let left = Number.parseFloat(style.left);
    let top = window.innerHeight - Number.parseFloat(style.bottom) - height;
    if (!Number.isFinite(left) || !Number.isFinite(top)) {
      const rect = element.getBoundingClientRect();
      left = rect.left - offsetRef.current.x;
      top = rect.top - offsetRef.current.y;
    }
    return {
      base: { left, top },
      bounds: miniPlayerBounds(viewport, { width, height }, readInsets()),
    };
  }, []);

  const restingTransition = useCallback(() => (prefersMinimalMotion() ? "none" : SETTLE_TRANSITION), []);

  const applyPoint = useCallback((element: HTMLElement, measurement: Measurement | null, point: MiniPlayerPoint | null, animate: boolean) => {
    const x = point && measurement ? Math.round(point.left - measurement.base.left) : 0;
    const y = point && measurement ? Math.round(point.top - measurement.base.top) : 0;
    offsetRef.current = { x, y };
    const transform = x || y ? `translate3d(${x}px, ${y}px, 0)` : "";
    if (animate) {
      element.style.transition = restingTransition();
      element.style.transform = transform;
      return;
    }
    element.style.transition = "none";
    element.style.transform = transform;
    // Commit the jump before restoring the settle transition.
    void element.offsetWidth;
    element.style.transition = restingTransition();
  }, [restingTransition]);

  const sync = useCallback((animate = false) => {
    const element = elementRef.current;
    if (!element || gestureRef.current?.dragging) return;
    const saved = readPlacement();
    if (!saved) {
      applyPoint(element, null, null, animate);
      return;
    }
    const measurement = measure(element);
    applyPoint(element, measurement, miniPlayerPointFromPlacement(saved, measurement.bounds), animate);
  }, [applyPoint, elementRef, measure]);

  const commit = useCallback((element: HTMLElement, measurement: Measurement, point: MiniPlayerPoint | null) => {
    const next = point ? miniPlayerPlacementFromPoint(point, measurement.bounds) : null;
    writePlacement(next);
    setPlacement(next);
    applyPoint(element, measurement, point, true);
  }, [applyPoint]);

  // Mount, resize, rotation, and size changes between video shapes.
  useEffect(() => {
    const element = elementRef.current;
    if (!enabled || !element) return;
    setPlacement(readPlacement());
    sync(false);
    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => sync(false));
    };
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(element);
    // The fixed site header resizes (banner, nav, ribbon) and republishes
    // `--site-header-h` on the root element without a window resize.
    let headerHeight = document.documentElement.style.getPropertyValue("--site-header-h");
    const rootStyle = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => {
      const next = document.documentElement.style.getPropertyValue("--site-header-h");
      if (next === headerHeight) return;
      headerHeight = next;
      schedule();
    });
    rootStyle?.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      observer?.disconnect();
      rootStyle?.disconnect();
      cleanupGestureRef.current?.();
      element.style.removeProperty("transform");
      element.style.removeProperty("transition");
      element.style.removeProperty("will-change");
      delete element.dataset.miniPlayerDragging;
      offsetRef.current = { x: 0, y: 0 };
      setDragging(false);
    };
  }, [elementRef, enabled, sync]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const element = elementRef.current;
    if (!enabled || !element || !event.isPrimary || event.button !== 0 || gestureRef.current) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const fromHandle = Boolean(target.closest("[data-mini-player-handle]"));
    if (!fromHandle && target.closest(MINI_PLAYER_NO_DRAG_SELECTOR)) return;

    const measurement = measure(element);
    const origin = {
      left: measurement.base.left + offsetRef.current.x,
      top: measurement.base.top + offsetRef.current.y,
    };
    gestureRef.current = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      origin,
      measurement,
      dragging: false,
      point: origin,
    };
    const threshold = event.pointerType === "mouse" ? MINI_PLAYER_DRAG_THRESHOLD.mouse : MINI_PLAYER_DRAG_THRESHOLD.touch;

    const onMove = (moveEvent: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || moveEvent.pointerId !== gesture.pointerId) return;
      const dx = moveEvent.clientX - gesture.startX;
      const dy = moveEvent.clientY - gesture.startY;
      if (!gesture.dragging) {
        if (Math.hypot(dx, dy) < threshold) return;
        gesture.dragging = true;
        try { element.setPointerCapture(gesture.pointerId); } catch { /* pointer already released */ }
        element.style.transition = "none";
        element.style.willChange = "transform";
        element.dataset.miniPlayerDragging = "true";
        setDragging(true);
      }
      moveEvent.preventDefault();
      gesture.point = clampMiniPlayerPoint(
        { left: gesture.origin.left + dx, top: gesture.origin.top + dy },
        gesture.measurement.bounds,
      );
      const x = Math.round(gesture.point.left - gesture.measurement.base.left);
      const y = Math.round(gesture.point.top - gesture.measurement.base.top);
      offsetRef.current = { x, y };
      element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    const finish = (endEvent: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || endEvent.pointerId !== gesture.pointerId) return;
      cleanup();
      if (!gesture.dragging) return;
      try { element.releasePointerCapture(gesture.pointerId); } catch { /* already released */ }
      element.style.removeProperty("will-change");
      delete element.dataset.miniPlayerDragging;
      setDragging(false);
      commit(element, gesture.measurement, snapMiniPlayerPoint(gesture.point, gesture.measurement.bounds));
      // The release must not also count as a click on whatever is under it.
      const swallowClick = (clickEvent: MouseEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
      };
      window.addEventListener("click", swallowClick, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallowClick, { capture: true }), 0);
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      gestureRef.current = null;
      cleanupGestureRef.current = null;
    };
    cleanupGestureRef.current = cleanup;
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }, [commit, elementRef, enabled, measure]);

  const reset = useCallback(() => {
    const element = elementRef.current;
    if (!element) return;
    commit(element, measure(element), null);
  }, [commit, elementRef, measure]);

  const onHandleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    const element = elementRef.current;
    if (!enabled || !element || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Home") {
      event.preventDefault();
      reset();
      return;
    }
    const measurement = measure(element);
    const current = {
      left: measurement.base.left + offsetRef.current.x,
      top: measurement.base.top + offsetRef.current.y,
    };
    const next = nudgeMiniPlayerPoint(current, event.key, event.shiftKey, measurement.bounds);
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    commit(element, measurement, next);
  }, [commit, elementRef, enabled, measure, reset]);

  return {
    onPointerDown,
    dragging,
    placed: Boolean(placement),
    side: miniPlayerSide(placement),
    handleProps: {
      "data-mini-player-handle": true,
      onKeyDown: onHandleKeyDown,
      onDoubleClick: reset,
    },
  };
}
