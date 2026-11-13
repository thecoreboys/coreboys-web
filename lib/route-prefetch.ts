const PUBLIC_ROUTE = /^\/(?:guide|shorts|channels\/(?:core|adapt|ron|lacy|marlon|jason|silky))\/?$/;
const MAX_WARM_ROUTES = 32;
const WARM_FOR_MS = 30_000;

export function canPrefetchPages(connection?: { saveData?: boolean; effectiveType?: string }) {
  return !connection?.saveData && connection?.effectiveType !== "slow-2g" && connection?.effectiveType !== "2g";
}

/** Restrict automatic preloading to public entertainment pages. */
export function publicPrefetchHref(href: string, current: string): string | null {
  try {
    const source = new URL(current);
    const target = new URL(href, source);
    if (target.origin !== source.origin || target.hash || (target.pathname !== "/" && !PUBLIC_ROUTE.test(target.pathname))) return null;
    if ([...target.searchParams.keys()].some(key => key !== "mode")) return null;
    if (target.searchParams.has("mode") && !["continuous", "videos", "live", "shorts"].includes(target.searchParams.get("mode")!)) return null;
    if (target.pathname === source.pathname && target.search === source.search) return null;
    return target.pathname + target.search;
  } catch { return null; }
}

export function createRouteWarmer(prefetch: (href: string) => void, now = Date.now) {
  const warmed = new Map<string, number>();
  return (href: string) => {
    const time = now();
    if ((warmed.get(href) ?? -Infinity) + WARM_FOR_MS > time) return;
    warmed.delete(href);
    warmed.set(href, time);
    if (warmed.size > MAX_WARM_ROUTES) warmed.delete(warmed.keys().next().value!);
    prefetch(href);
  };
}
