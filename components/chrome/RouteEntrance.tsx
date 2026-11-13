"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cssEase, prefersMinimalMotion, uiDurations } from "@/lib/motion";

/**
 * Soft cut between client-side routes: the incoming page fades up on the
 * compositor. The first render never animates, so server-rendered content
 * paints at full opacity and LCP is unaffected. Opacity alone is used because
 * a transform on <main> would re-parent fixed descendants mid-animation.
 */
export function RouteEntrance() {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);

  useEffect(() => {
    const last = previous.current;
    previous.current = pathname;
    if (last === null || last === pathname) return;
    if (prefersMinimalMotion()) return;
    const main = document.getElementById("main");
    if (!main || typeof main.animate !== "function") return;
    const animation = main.animate(
      [{ opacity: 0.001 }, { opacity: 1 }],
      { duration: uiDurations.page, easing: cssEase.out },
    );
    return () => animation.cancel();
  }, [pathname]);

  return null;
}
