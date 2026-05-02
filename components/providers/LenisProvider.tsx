"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Site-wide smooth scroll. Lenis hijacks wheel input and lerps
 * `scrollTop` toward the target each frame, so the page glides instead
 * of stepping. Honors `prefers-reduced-motion` (skip entirely) and
 * tags `<html>` with `lenis lenis-smooth` so the matching CSS in
 * globals.css can suppress browser-default `scroll-behavior: smooth`.
 *
 * Anything that has its own scroll container (modals, chat panes,
 * dropdowns) should mark its scrollable child with
 * `data-lenis-prevent` so Lenis doesn't fight the local scroll.
 */
export function LenisProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      // `lerp` produces a smoother / less janky feel than a fixed duration.
      lerp: 0.1,
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.4,
    });

    document.documentElement.classList.add("lenis", "lenis-smooth");

    let raf = 0;
    const tick = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      document.documentElement.classList.remove("lenis", "lenis-smooth");
    };
  }, []);

  return <>{children}</>;
}
