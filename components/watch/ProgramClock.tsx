"use client";

import { useEffect, useState } from "react";
import { useBrowserTimeZone } from "@/hooks/useBrowserTimeZone";

export function ProgramClock() {
  const [now, setNow] = useState(() => new Date());
  const viewer = useBrowserTimeZone();
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", {
    timeZone: viewer.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const h = Number(parts.hour ?? 0) % 12;
  const m = Number(parts.minute ?? 0);
  const s = Number(parts.second ?? 0);
  const hourA = h * 30 + m * 0.5;
  const minA = m * 6 + s * 0.1;
  const secA = s * 6;

  return (
    <div className="relative size-14 shrink-0" aria-label={viewer.ready ? `Local clock, ${viewer.timeZone}` : "Local clock"}>
      <svg viewBox="0 0 100 100" className={`size-full transition-opacity ${viewer.ready ? "opacity-100" : "opacity-0"}`}>
        <circle cx="50" cy="50" r="48" fill="rgba(8,8,10,0.5)" stroke="var(--core)" strokeWidth="1.2" />
        <line x1="50" y1="50" x2="50" y2="28" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" transform={`rotate(${hourA} 50 50)`} />
        <line x1="50" y1="50" x2="50" y2="18" stroke="var(--core)" strokeWidth="1.4" strokeLinecap="round" transform={`rotate(${minA} 50 50)`} />
        <line x1="50" y1="50" x2="50" y2="14" stroke="var(--ink-dim)" strokeWidth="0.7" transform={`rotate(${secA} 50 50)`} />
        <circle cx="50" cy="50" r="2" fill="var(--core)" />
      </svg>
    </div>
  );
}
