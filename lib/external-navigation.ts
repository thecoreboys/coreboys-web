import { navigationTarget } from "./navigation-policy";

export const EXTERNAL_NAVIGATION_ERROR = "core:external-navigation-error";
export const EXTERNAL_NAVIGATION_START = "core:external-navigation-start";

/** Installed by the native app before the page loads. Reject on OS-open failure. */
export type ExternalBrowserBridge = {
  version: 1;
  openExternalUrl: (options: { url: string }) => void | Promise<void>;
};

declare global {
  interface Window { CoreExternalBrowser?: ExternalBrowserBridge }
}

export type NavigationRuntime = {
  currentUrl: string;
  nativeBrowser?: ExternalBrowserBridge;
  openNewTab: (url: string) => void;
  assign: (url: string) => void;
  reportError: () => void;
};

export function createNavigationHandler(runtime: NavigationRuntime) {
  return (value: string, { fallback = "new-tab" }: { fallback?: "new-tab" | "same-tab" } = {}): void => {
    const target = navigationTarget(value, runtime.currentUrl);
    if (target.kind === "blocked") { runtime.reportError(); return; }
    const bridge = runtime.nativeBrowser;
    if (bridge && bridge.version !== 1) { runtime.reportError(); return; }
    if (target.kind === "internal" && bridge) { runtime.assign(target.url); return; }
    if (target.kind !== "internal" && bridge?.version === 1) {
      try {
        // A failed native open must never send the page into the app WebView.
        void Promise.resolve(bridge.openExternalUrl({ url: target.url })).catch(runtime.reportError);
      } catch { runtime.reportError(); }
      return;
    }
    if (fallback === "same-tab") runtime.assign(target.url);
    else runtime.openNewTab(target.url);
  };
}

function browserRuntime(): NavigationRuntime {
  return {
    currentUrl: window.location.href,
    nativeBrowser: window.CoreExternalBrowser,
    openNewTab: (url) => { window.open(url, "_blank", "noopener,noreferrer"); },
    assign: (url) => { window.location.assign(url); },
    reportError: () => { window.dispatchEvent(new Event(EXTERNAL_NAVIGATION_ERROR)); },
  };
}

/** For buttons, context menus and API-returned redirect URLs. */
export function navigateToUrl(value: string, options?: { fallback?: "new-tab" | "same-tab" }): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EXTERNAL_NAVIGATION_START));
  createNavigationHandler(browserRuntime())(value, options);
}

/** Event delegation also covers links inserted after hydration or route changes. */
export function installExternalLinkPolicy(doc: Document, view: Window): () => void {
  const anchorFor = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download")) return null;
    const destination = navigationTarget(anchor.getAttribute("href") ?? "", view.location.href);
    return destination.kind === "external" ? { anchor, destination } : null;
  };
  const prepare = (event: MouseEvent) => {
    const link = anchorFor(event);
    if (!link) return;
    link.anchor.target = "_blank";
    const rel = new Set(link.anchor.rel.split(/\s+/).filter(Boolean));
    rel.add("noopener"); rel.add("noreferrer");
    link.anchor.rel = [...rel].join(" ");
  };
  const openNative = (event: MouseEvent) => {
    if (event.defaultPrevented || (event.button !== 0 && event.button !== 1)) return;
    const link = anchorFor(event);
    if (!link || !view.CoreExternalBrowser) return;
    event.preventDefault();
    navigateToUrl(link.destination.url);
  };
  doc.addEventListener("click", prepare, true);
  doc.addEventListener("auxclick", prepare, true);
  doc.addEventListener("click", openNative);
  doc.addEventListener("auxclick", openNative);
  return () => {
    doc.removeEventListener("click", prepare, true);
    doc.removeEventListener("auxclick", prepare, true);
    doc.removeEventListener("click", openNative);
    doc.removeEventListener("auxclick", openNative);
  };
}
