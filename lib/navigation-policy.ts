export const APP_SITE_ORIGINS = ["https://thecoreboys.com", "https://www.thecoreboys.com"] as const;

export type NavigationTarget = { kind: "internal" | "external" | "system"; url: string } | { kind: "blocked" };

/** Compare parsed origins, never hostname prefixes or substrings. */
export function navigationTarget(value: string, currentUrl: string): NavigationTarget {
  if (!value.trim()) return { kind: "blocked" };
  try {
    const current = new URL(currentUrl);
    const url = new URL(value, current);
    if (url.username || url.password) return { kind: "blocked" };
    if (url.protocol === "mailto:" || url.protocol === "tel:") return { kind: "system", url: url.href };
    if (url.protocol !== "https:" && url.protocol !== "http:") return { kind: "blocked" };
    const officialAlias = APP_SITE_ORIGINS.some((origin) => origin === current.origin)
      && APP_SITE_ORIGINS.some((origin) => origin === url.origin);
    return { kind: url.origin === current.origin || officialAlias ? "internal" : "external", url: url.href };
  } catch {
    return { kind: "blocked" };
  }
}

/** Native wrappers must apply this to redirects and new windows too. */
export function nativeNavigationAction(value: string, { isMainFrame = true, isNewWindow = false } = {}) {
  if (!isMainFrame && !isNewWindow) return "allow-embedded" as const;
  if (value === "about:blank") return "allow-in-app" as const;
  const target = navigationTarget(value, APP_SITE_ORIGINS[0]);
  if (target.kind === "blocked") return "block" as const;
  return target.kind === "internal" ? "allow-in-app" as const : "open-system" as const;
}

/** Adapter for a native host's should-start-navigation callback. */
export function createNativeNavigationGuard(openSystemUrl: (url: string) => void | Promise<unknown>, reportError: () => void) {
  return (request: { url: string; isMainFrame?: boolean; isNewWindow?: boolean }): boolean => {
    const action = nativeNavigationAction(request.url, request);
    if (action === "allow-in-app" || action === "allow-embedded") return true;
    if (action === "open-system") {
      try { void Promise.resolve(openSystemUrl(request.url)).catch(reportError); }
      catch { reportError(); }
    }
    return false;
  };
}
