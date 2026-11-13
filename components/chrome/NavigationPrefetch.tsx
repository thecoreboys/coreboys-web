"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { canPrefetchPages, createRouteWarmer, publicPrefetchHref } from "@/lib/route-prefetch";

export function NavigationPrefetch() {
  const router = useRouter();
  const pathname = usePathname();
  const warm = useMemo(() => createRouteWarmer(href => router.prefetch(href as never)), [router]);

  useEffect(() => {
    if (/^\/(?:admin|studio|access)(?:\/|$)/.test(pathname)) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (!canPrefetchPages(connection)) return;
    const preload = (href: string) => {
      if (document.visibilityState === "hidden") return;
      const destination = publicPrefetchHref(href, window.location.href);
      if (destination) warm(destination);
    };
    const onIntent = (event: Event) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      preload(link.href);
    };
    document.addEventListener("pointerover", onIntent, { passive: true });
    document.addEventListener("focusin", onIntent);
    document.addEventListener("touchstart", onIntent, { passive: true });

    // Warm the small set of primary destinations after first paint, one at a
    // time. Provider audio and the media runtime never gate these requests.
    const routes = ["/", "/guide", "/shorts", "/channels/core?mode=continuous"];
    let timeout: number | undefined;
    let idle: number | undefined;
    const next = () => {
      const href = routes.shift();
      if (!href) return;
      preload(href);
      timeout = window.setTimeout(next, 350);
    };
    if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(next, { timeout: 2500 });
    else timeout = window.setTimeout(next, 1000);
    return () => {
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timeout !== undefined) window.clearTimeout(timeout);
      document.removeEventListener("pointerover", onIntent);
      document.removeEventListener("focusin", onIntent);
      document.removeEventListener("touchstart", onIntent);
    };
  }, [pathname, warm]);
  return null;
}
