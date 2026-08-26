"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, type HTMLAttributes } from "react";
import { useDragScroll } from "@/hooks/useDragScroll";

type DragScrollRailProps = HTMLAttributes<HTMLDivElement> & {
  wheelToX?: boolean;
};

const EDGE_TOLERANCE = 8;

/**
 * A horizontal rail that keeps native touch and trackpad behavior while adding
 * desktop mouse grab-to-scroll. Interactive descendants still receive normal
 * clicks unless the pointer actually travels far enough to become a drag.
 */
export function DragScrollRail({ wheelToX = false, ...props }: DragScrollRailProps) {
  const railRef = useDragScroll<HTMLDivElement>({ wheel: wheelToX ? "x" : "native" });
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    if (!scroller) return;
    const updateEdges = () => {
      const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      const next = {
        left: scroller.scrollLeft > EDGE_TOLERANCE,
        right: maxLeft - scroller.scrollLeft > EDGE_TOLERANCE,
      };
      setEdges((current) => current.left === next.left && current.right === next.right ? current : next);
    };
    updateEdges();
    const nextFrame = window.requestAnimationFrame(updateEdges);
    scroller.addEventListener("scroll", updateEdges, { passive: true });
    window.addEventListener("resize", updateEdges);
    scroller.addEventListener("load", updateEdges, true);
    const observer = new ResizeObserver(updateEdges);
    observer.observe(scroller);
    for (const child of scroller.children) observer.observe(child);
    return () => {
      window.cancelAnimationFrame(nextFrame);
      scroller.removeEventListener("scroll", updateEdges);
      window.removeEventListener("resize", updateEdges);
      scroller.removeEventListener("load", updateEdges, true);
      observer.disconnect();
    };
  }, [scroller]);

  const bindRail = (node: HTMLDivElement | null) => {
    railRef(node);
    setScroller(node);
  };
  const move = (direction: -1 | 1) => {
    scroller?.scrollBy({ left: direction * Math.max(260, scroller.clientWidth * .72), behavior: "smooth" });
  };

  return (
    <div className="watch-rail-frame">
      <div ref={bindRail} data-drag-scroll-root="true" {...props} />
      {edges.left ? <button type="button" data-no-drag className="watch-rail-arrow is-left" onClick={() => move(-1)} aria-label="Scroll this row left"><ChevronLeft aria-hidden /></button> : null}
      {edges.right ? <button type="button" data-no-drag className="watch-rail-arrow is-right" onClick={() => move(1)} aria-label="Scroll this row right"><ChevronRight aria-hidden /></button> : null}
    </div>
  );
}
