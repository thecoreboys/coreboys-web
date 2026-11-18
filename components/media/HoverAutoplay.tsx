"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useHoverAutoplay } from "@/hooks/useHoverAutoplay";
import { AutoplayEmbed } from "./AutoplayEmbed";

/** Share hover intent across the entire card, keeping its original action. */
export function HoverAutoplay({ sourceUrl, embedUrl, title, children, className = "" }: {
  sourceUrl?: string; embedUrl?: string; title: string; children: ReactNode; className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { activeId, start, stop } = useHoverAutoplay();
  useEffect(() => {
    if (!sourceUrl) return;
    const card = root.current?.closest("a, button, li") ?? root.current;
    if (!card) return;
    const enter = () => start(sourceUrl);
    const blur = (event: Event) => {
      if (!card.contains((event as FocusEvent).relatedTarget as Node | null)) stop();
    };
    card.addEventListener("mouseenter", enter);
    card.addEventListener("mouseleave", stop);
    card.addEventListener("focusin", enter);
    card.addEventListener("focusout", blur);
    card.addEventListener("click", stop);
    return () => {
      card.removeEventListener("mouseenter", enter);
      card.removeEventListener("mouseleave", stop);
      card.removeEventListener("focusin", enter);
      card.removeEventListener("focusout", blur);
      card.removeEventListener("click", stop);
    };
  }, [sourceUrl, start, stop]);
  return <div ref={root} className={`relative block h-full w-full overflow-hidden ${className}`}>
    {children}
    {sourceUrl && activeId === sourceUrl ? <div data-hover-preview aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 bg-black">
      <AutoplayEmbed sourceUrl={sourceUrl} embedUrl={embedUrl} title={`${title} preview`} controls={false} loop />
    </div> : null}
  </div>;
}
