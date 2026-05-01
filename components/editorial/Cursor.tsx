"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Custom blended cursor — a 24px ring that scales to 64px on interactive
 * hovers. Hidden on touch devices and under prefers-reduced-motion.
 *
 * Picks up an accent color via [data-accent] on the hovered element, so
 * member hexes can pass their accent and the ring tints accordingly.
 */
export function Cursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced) return;

    setEnabled(true);
    document.body.dataset.cursor = "custom";

    let rx = window.innerWidth / 2;
    let ry = window.innerHeight / 2;
    let cx = rx;
    let cy = ry;
    let scale = 1;
    let targetScale = 1;
    let accent = "";
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      cx = e.clientX;
      cy = e.clientY;

      // Detect interactive ancestors and their optional accent.
      const target = e.target as HTMLElement | null;
      const interactive = target?.closest(
        "a, button, [role='button'], [data-cursor='hover']",
      ) as HTMLElement | null;
      targetScale = interactive ? 2.6 : 1;
      accent = interactive?.dataset.accent ?? "";
    };

    const onDown = () => {
      targetScale = 0.85;
    };
    const onUp = () => {
      targetScale = 1;
    };

    const tick = () => {
      // Lerp the ring toward the cursor with snappy gentle damping; the dot
      // tracks 1:1 (no lerp) so users can click precisely.
      rx += (cx - rx) * 0.18;
      ry += (cy - ry) * 0.18;
      scale += (targetScale - scale) * 0.18;

      const ring = ringRef.current;
      const dot = dotRef.current;
      if (ring) {
        ring.style.transform = `translate3d(${rx - 12}px, ${ry - 12}px, 0) scale(${scale.toFixed(3)})`;
        ring.style.borderColor = accent || "var(--ink)";
        ring.style.boxShadow = accent
          ? `0 0 24px ${accent}55`
          : "0 0 18px rgba(255,255,255,0.08)";
      }
      if (dot) {
        dot.style.transform = `translate3d(${cx - 2}px, ${cy - 2}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      cancelAnimationFrame(raf);
      delete document.body.dataset.cursor;
    };
  }, []);

  if (!enabled) return null;
  return (
    <>
      <div
        ref={ringRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[70] h-6 w-6 rounded-full border mix-blend-difference will-change-transform"
        style={{ transition: "border-color 200ms var(--ease-out), box-shadow 300ms var(--ease-out)" }}
      />
      <div
        ref={dotRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[70] h-1 w-1 rounded-full bg-[color:var(--ink)] mix-blend-difference will-change-transform"
      />
    </>
  );
}
