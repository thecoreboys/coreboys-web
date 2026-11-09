"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const LazyCursor = dynamic(() => import("./Cursor").then((module) => module.Cursor).catch(() => function CursorUnavailable() { return null; }), { ssr: false });

/** Keep cursor code off the initial render and off touch-only devices. */
export function CursorLoader() {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let activated = false;
    const eligible = () => fine.matches && !motion.matches && document.documentElement.dataset.watchReducedMotion !== "on";
    const activate = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !eligible() || document.hidden) return;
      activated = true;
      window.removeEventListener("pointermove", activate);
      setPosition({ x: event.clientX, y: event.clientY });
    };
    const sync = () => {
      window.removeEventListener("pointermove", activate);
      if (!eligible()) {
        activated = false;
        setPosition(null);
      } else if (!activated) {
        window.addEventListener("pointermove", activate, { passive: true });
      }
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-watch-reduced-motion"] });
    fine.addEventListener("change", sync);
    motion.addEventListener("change", sync);
    sync();
    return () => {
      window.removeEventListener("pointermove", activate);
      fine.removeEventListener("change", sync);
      motion.removeEventListener("change", sync);
      observer.disconnect();
    };
  }, []);
  return position ? <LazyCursor initialPosition={position} /> : null;
}
