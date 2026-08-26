"use client";

import { useEffect, useRef } from "react";
import { usePlayer } from "@/components/providers/PlayerProvider";
import type { WatchItem } from "@/lib/watch/types";

/**
 * The dedicated, full-screen short-form destination. It uses one tuned
 * player channel so the player can keep its ordered warm-frame deck ahead of
 * the current Short instead of creating a fresh provider embed per scroll.
 */
export function ShortsStage({ items }: { items: WatchItem[] }) {
  const { playChannel, ready, dataSaver } = usePlayer();
  const initializedRef = useRef(false);

  useEffect(() => {
    // Establish the provider connections before the off-screen short-form
    // deck mounts. This keeps the first scroll responsive while respecting
    // the viewer's explicit data-saver choice.
    if (dataSaver || typeof document === "undefined") return;
    const origins = [
      "https://www.youtube-nocookie.com",
      "https://www.tiktok.com",
      "https://www.instagram.com",
    ];
    const added: HTMLLinkElement[] = [];
    for (const href of origins) {
      const selector = `link[rel=\"preconnect\"][href=\"${href}\"]`;
      if (document.head.querySelector(selector)) continue;
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = href;
      link.crossOrigin = "anonymous";
      link.dataset.coreShortsWarmup = "true";
      document.head.appendChild(link);
      added.push(link);
    }
    return () => {
      for (const link of added) link.remove();
    };
  }, [dataSaver]);

  useEffect(() => {
    if (!ready || !items.length || initializedRef.current) return;
    initializedRef.current = true;

    playChannel(
      {
        id: "core-shorts",
        title: "CORE Shorts",
        subtitle: "Shorts, Reels, and TikToks from the house",
        href: "/shorts",
        artwork: "/brand/logo-core-white.png",
      },
      items,
      0,
    );
  }, [items, playChannel, ready]);

  return (
    <section className="min-h-dvh bg-[#050507]" aria-label="CORE Shorts">
      <p className="sr-only">Opening the CORE Shorts player.</p>
    </section>
  );
}
