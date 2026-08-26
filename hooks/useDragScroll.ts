"use client";

import { useEffect, useMemo, useState } from "react";

export const DRAG_SCROLL_START_EVENT = "core:drag-scroll-start";

export type DragScrollStartDetail = {
  scroller: HTMLElement;
};

export type DragScrollRef<T extends HTMLElement> = ((node: T | null) => void) & {
  current: T | null;
};

/**
 * Click-drag to pan an overflow scroller while leaving touch scrolling native.
 * Pointer capture begins only after a horizontal movement threshold, so an
 * ordinary press remains an ordinary link or button click. Clicks that follow
 * a real drag are cancelled before they reach the card beneath the pointer.
 */
export function useDragScroll<T extends HTMLElement>(opts?: {
  wheelToX?: boolean;
  wheel?: "x" | "native" | "none";
}) {
  const [node, setNode] = useState<T | null>(null);
  const ref = useMemo(() => {
    const callback = ((next: T | null) => {
      callback.current = next;
      setNode(next);
    }) as DragScrollRef<T>;
    callback.current = null;
    return callback;
  }, []);
  const wheelMode = opts?.wheel ?? (opts?.wheelToX === false ? "native" : "x");

  useEffect(() => {
    const el = node;
    if (!el) return;

    const suppliedDragRoot = el.hasAttribute("data-drag-scroll-root");
    if (!suppliedDragRoot) el.dataset.dragScrollRoot = "true";

    let pressed = false;
    let dragging = false;
    let suppressClick = false;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let pointerId = -1;
    let lastMoveX = 0;
    let lastMoveAt = 0;
    let velocity = 0;
    let momentumFrame: number | null = null;
    let clickResetTimer: number | null = null;

    const interactive = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      if (!node) return false;
      return Boolean(node.closest("input, textarea, select, [contenteditable='true'], [data-no-drag]"));
    };

    const setDragging = (active: boolean) => {
      dragging = active;
      el.classList.toggle("is-dragging", active);
      if (active) el.dataset.dragScrollActive = "true";
      else delete el.dataset.dragScrollActive;
    };

    const releaseCapture = (id: number) => {
      if (id < 0) return;
      if (!el.hasPointerCapture(id)) return;
      try {
        el.releasePointerCapture(id);
      } catch {
        /* The browser may have already released capture. */
      }
    };

    const resetGesture = (keepClickSuppressed = false) => {
      const capturedPointerId = pointerId;
      pressed = false;
      pointerId = -1;
      setDragging(false);
      releaseCapture(capturedPointerId);
      if (!keepClickSuppressed) suppressClick = false;
    };

    const cancelMomentum = () => {
      if (momentumFrame !== null) window.cancelAnimationFrame(momentumFrame);
      momentumFrame = null;
    };

    const continueMomentum = () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || Math.abs(velocity) < 0.12) return;
      const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
      const next = Math.max(0, Math.min(maxLeft, el.scrollLeft - velocity * 18));
      if (next <= 0 || next >= maxLeft) return;
      el.scrollLeft = next;
      velocity *= 0.91;
      momentumFrame = window.requestAnimationFrame(continueMomentum);
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (e.button !== 0) return;
      if (interactive(e.target)) return;
      if (clickResetTimer !== null) {
        window.clearTimeout(clickResetTimer);
        clickResetTimer = null;
      }
      cancelMomentum();
      pressed = true;
      suppressClick = false;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      originLeft = el.scrollLeft;
      lastMoveX = e.clientX;
      lastMoveAt = performance.now();
      velocity = 0;
    };

    const onMove = (e: PointerEvent) => {
      if (!pressed || e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!dragging) {
        if (Math.abs(dx) < 7) return;
        if (Math.abs(dy) > Math.abs(dx) * 1.25) {
          resetGesture();
          return;
        }

        suppressClick = true;
        setDragging(true);
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* Pointer capture is an enhancement, not a requirement. */
        }
        window.dispatchEvent(new CustomEvent<DragScrollStartDetail>(DRAG_SCROLL_START_EVENT, {
          detail: { scroller: el },
        }));
      }

      e.preventDefault();
      el.scrollLeft = originLeft - dx;
      const now = performance.now();
      const elapsed = Math.max(1, now - lastMoveAt);
      velocity = (e.clientX - lastMoveX) / elapsed;
      lastMoveX = e.clientX;
      lastMoveAt = now;
    };

    const onUp = (e: PointerEvent) => {
      if (!pressed || e.pointerId !== pointerId) return;
      const dragged = dragging;
      resetGesture(dragged);
      if (!dragged) return;

      cancelMomentum();
      momentumFrame = window.requestAnimationFrame(continueMomentum);

      // A drag normally produces a click synchronously after pointerup. Clear
      // the guard on the next task as a fallback for browsers that omit it.
      clickResetTimer = window.setTimeout(() => {
        suppressClick = false;
        clickResetTimer = null;
      }, 0);
    };

    const onCancel = (e: PointerEvent) => {
      if (!pressed || e.pointerId !== pointerId) return;
      resetGesture();
    };

    const onLostPointerCapture = (e: PointerEvent) => {
      if (!pressed || e.pointerId !== pointerId) return;
      resetGesture(suppressClick);
    };

    const onClick = (e: MouseEvent) => {
      if (!suppressClick) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      suppressClick = false;
      if (clickResetTimer !== null) {
        window.clearTimeout(clickResetTimer);
        clickResetTimer = null;
      }
    };

    const onDragStart = (e: DragEvent) => {
      e.preventDefault();
    };

    const onWheel = (e: WheelEvent) => {
      if (wheelMode !== "x") return;
      if (el.scrollWidth <= el.clientWidth + 2) return;
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      const unit = e.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? el.clientWidth
          : 1;
      const delta = e.deltaY * unit;
      const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
      const canMove = delta < 0
        ? el.scrollLeft > 1
        : delta > 0 && el.scrollLeft < maxLeft - 1;
      if (!canMove) return;
      e.preventDefault();
      el.scrollLeft = Math.max(0, Math.min(maxLeft, el.scrollLeft + delta));
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    el.addEventListener("lostpointercapture", onLostPointerCapture);
    el.addEventListener("click", onClick, true);
    el.addEventListener("dragstart", onDragStart);
    if (wheelMode === "x") el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      if (clickResetTimer !== null) window.clearTimeout(clickResetTimer);
      cancelMomentum();
      resetGesture();
      if (!suppliedDragRoot) delete el.dataset.dragScrollRoot;
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      el.removeEventListener("lostpointercapture", onLostPointerCapture);
      el.removeEventListener("click", onClick, true);
      el.removeEventListener("dragstart", onDragStart);
      el.removeEventListener("wheel", onWheel);
    };
  }, [node, wheelMode]);

  return ref;
}
