"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/** Load only the hovered preview, after intent; never start media on touch. */
export function useHoverAutoplay() {
  const player = usePlayer();
  const reducedMotion = useReducedMotion();
  const eligible = player.previewAutoplay && !player.dataSaver && !reducedMotion;
  const [activeId, setActiveId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setActiveId(null);
  }, []);
  const start = useCallback((id: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (!eligible || document.documentElement.dataset.watchAutoplay === "off"
      || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (document.documentElement.dataset.watchAutoplay !== "off") setActiveId(id);
    }, 300);
  }, [eligible]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { activeId: eligible ? activeId : null, start, stop };
}
