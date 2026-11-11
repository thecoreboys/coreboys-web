"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState, type HTMLAttributes } from "react";
import { useDragScroll } from "@/hooks/useDragScroll";

type DragScrollRailProps = HTMLAttributes<HTMLDivElement> & {
  wheelToX?: boolean;
  alwaysShowArrows?: boolean;
  /** Changes when fixed-width cards are added or change shape. */
  fixedItemLayout?: string;
};

const EDGE_TOLERANCE = 8;

/**
 * A horizontal rail that keeps native touch and trackpad behavior while adding
 * desktop mouse grab-to-scroll. Interactive descendants still receive normal
 * clicks unless the pointer actually travels far enough to become a drag.
 */
export function DragScrollRail({ wheelToX = false, alwaysShowArrows = false, fixedItemLayout, ...props }: DragScrollRailProps) {
  const railRef = useDragScroll<HTMLDivElement>({ wheel: wheelToX ? "x" : "native" });
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    if (!scroller) return;
    let frame = 0;
    const updateEdges = () => {
      frame = 0;
      const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      const next = {
        left: scroller.scrollLeft > EDGE_TOLERANCE,
        right: maxLeft - scroller.scrollLeft > EDGE_TOLERANCE,
      };
      setEdges((current) => current.left === next.left && current.right === next.right ? current : next);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(updateEdges);
    };
    schedule();
    scroller.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    if (fixedItemLayout === undefined) {
      scroller.addEventListener("load", schedule, true);
      for (const child of scroller.children) observer.observe(child);
    }
    return () => {
      window.cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      scroller.removeEventListener("load", schedule, true);
      observer.disconnect();
    };
  }, [fixedItemLayout, scroller]);

  const bindRail = useCallback((node: HTMLDivElement | null) => {
    railRef(node);
    setScroller(node);
  }, [railRef]);
  const move = (direction: -1 | 1) => {
    scroller?.scrollBy({ left: direction * Math.max(260, scroller.clientWidth * .72), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <div className={`watch-rail-frame${alwaysShowArrows ? " has-visible-arrows" : ""}`}>
      <div ref={bindRail} data-drag-scroll-root="true" {...props} />
      {edges.left || alwaysShowArrows ? <button type="button" data-no-drag className="watch-rail-arrow is-left" disabled={!edges.left} onClick={() => move(-1)} aria-label="Scroll this row left"><ChevronLeft aria-hidden /></button> : null}
      {edges.right || alwaysShowArrows ? <button type="button" data-no-drag className="watch-rail-arrow is-right" disabled={!edges.right} onClick={() => move(1)} aria-label="Scroll this row right"><ChevronRight aria-hidden /></button> : null}
    </div>
  );
}
