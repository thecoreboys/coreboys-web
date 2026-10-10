"use client";

import { useEffect } from "react";
import type Lenis from "lenis";
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
    let cancelled = false;
    let started = false;
    let raf = 0;
    let idleHandle: number | null = null;
    let idleTimer: number | null = null;
    let lenis: Lenis | null = null;
    let removeVirtualScroll: (() => void) | null = null;
    const scheduleFrame = () => {
      if (raf || !lenis || document.visibilityState !== "visible") return;
      raf = requestAnimationFrame(tick);
    };
    const tick = (time: number) => {
      raf = 0;
      if (!lenis || document.visibilityState !== "visible") return;
      lenis.raf(time);
      if (lenis.isScrolling === "smooth") scheduleFrame();
    };
    const start = async () => {
      if (started || cancelled) return;
      started = true;
      const { default: Lenis } = await import("lenis");
      if (cancelled) return;
      lenis = new Lenis({
        // `lerp` produces a smoother / less janky feel than a fixed duration.
        lerp: 0.12,
        smoothWheel: true,
        wheelMultiplier: 1,
        touchMultiplier: 1.4,
      });
      document.documentElement.classList.add("lenis", "lenis-smooth");
      removeVirtualScroll = lenis.on("virtual-scroll", scheduleFrame);
    };
    const browserWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      } else {
        lenis?.resize();
        if (lenis?.isScrolling === "smooth") scheduleFrame();
      }
    };
    // Load the optional smooth-scroll chunk only after the page is idle (or
    // the first real scroll gesture), so it does not compete with hydration.
    const onFirstScroll = () => { void start(); };
    window.addEventListener("wheel", onFirstScroll, { once: true, passive: true });
    window.addEventListener("touchmove", onFirstScroll, { once: true, passive: true });
    if (browserWindow.requestIdleCallback) {
      idleHandle = browserWindow.requestIdleCallback(() => void start(), { timeout: 2_000 });
    } else {
      idleTimer = window.setTimeout(() => void start(), 1_200);
    }
    document.addEventListener("visibilitychange", onVisibilityChange, { passive: true });
    return () => {
      cancelled = true;
      window.removeEventListener("wheel", onFirstScroll);
      window.removeEventListener("touchmove", onFirstScroll);
      if (idleHandle !== null) browserWindow.cancelIdleCallback?.(idleHandle);
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      removeVirtualScroll?.();
      lenis?.destroy();
      document.documentElement.classList.remove("lenis", "lenis-smooth");
    };
  }, []);

  return <>{children}</>;
}
