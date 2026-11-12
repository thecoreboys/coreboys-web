"use client";

import { useEffect, useRef } from "react";
import { usePlayer } from "@/components/providers/PlayerProvider";

/** Resize the dock without replacing any provider or chat session. */
export function RoomSidebarResize() {
  const player = usePlayer();
  const drag = useRef<{ x: number; width: number; pointer: number } | null>(null);
  const frame = useRef(0);
  const pending = useRef<number | null>(null);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const left = player.chatDock === "left";
  const apply = (width: number) => player.setChatDockSize({ side: Math.round(Math.max(280, Math.min(520, window.innerWidth * .36, width))) });
  return <div
    role="separator" tabIndex={0} aria-orientation="vertical" aria-label="Resize chat panel"
    aria-valuemin={280} aria-valuemax={520} aria-valuenow={player.chatDockSize.side}
    className={`absolute inset-y-0 z-30 hidden w-2 touch-none cursor-col-resize outline-none hover:bg-white/15 focus-visible:bg-white/25 xl:block ${left ? "right-0" : "left-0"}`}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      drag.current = { x: event.clientX, width: event.currentTarget.parentElement?.getBoundingClientRect().width ?? player.chatDockSize.side, pointer: event.pointerId };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={(event) => {
      const start = drag.current;
      if (!start || start.pointer !== event.pointerId) return;
      pending.current = start.width + (event.clientX - start.x) * (left ? 1 : -1);
      if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; if (pending.current !== null) apply(pending.current); });
    }}
    onPointerUp={(event) => {
      const start = drag.current;
      if (!start || start.pointer !== event.pointerId) return;
      cancelAnimationFrame(frame.current); frame.current = 0;
      apply(start.width + (event.clientX - start.x) * (left ? 1 : -1));
      drag.current = null; pending.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={() => { cancelAnimationFrame(frame.current); frame.current = 0; if (drag.current) apply(drag.current.width); drag.current = null; pending.current = null; }}
    onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      apply(event.key === "Home" ? 280 : event.key === "End" ? 520 : player.chatDockSize.side + (event.key === "ArrowRight" ? 16 : -16) * (left ? 1 : -1));
    }}
  />;
}
