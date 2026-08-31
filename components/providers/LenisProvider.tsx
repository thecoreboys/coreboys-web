"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { detectWeakGpu, devicePerformanceProfile } from "@/lib/device-performance";

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
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const profile = devicePerformanceProfile({
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
      connection,
      gpuWeak: detectWeakGpu(),
    });
    // Smooth scrolling is a visual enhancement. On constrained devices it
    // competes with media decoding and feed work, so native scrolling wins.
    if (profile === "conserve" || connection?.saveData) return;

    const lenis = new Lenis({
      // `lerp` produces a smoother / less janky feel than a fixed duration.
      lerp: 0.12,
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.4,
    });

    document.documentElement.classList.add("lenis", "lenis-smooth");

    let raf = 0;
    let visible = document.visibilityState === "visible";
    const tick = (time: number) => {
      if (visible) lenis.raf(time);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onVisibilityChange = () => {
      visible = document.visibilityState === "visible";
      if (visible) lenis.resize();
    };
    document.addEventListener("visibilitychange", onVisibilityChange, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      lenis.destroy();
      document.documentElement.classList.remove("lenis", "lenis-smooth");
    };
  }, []);

  return <>{children}</>;
}
