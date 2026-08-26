export type XWidgetsApi = {
  createTweet?: (
    id: string,
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => Promise<HTMLElement | undefined>;
  load?: (element?: HTMLElement) => Promise<unknown> | void;
};

declare global {
  interface Window {
    twttr?: {
      ready?: (callback: () => void) => void;
      widgets?: XWidgetsApi;
    };
  }
}

let widgetsPromise: Promise<XWidgetsApi> | null = null;

/** Load the official X for Websites runtime only after an explicit opt-in. */
export function loadXWidgets(): Promise<XWidgetsApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("browser only"));
  if (window.twttr?.widgets) return Promise.resolve(window.twttr.widgets);
  if (widgetsPromise) return widgetsPromise;

  widgetsPromise = new Promise<XWidgetsApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-coreboys-x-widgets="true"]');
    const script = existing ?? document.createElement("script");
    const timeout = window.setTimeout(() => reject(new Error("X embed timed out")), 12_000);
    const done = () => {
      const finish = () => {
        const widgets = window.twttr?.widgets;
        window.clearTimeout(timeout);
        if (widgets) resolve(widgets);
        else reject(new Error("X widgets unavailable"));
      };
      const ready = window.twttr?.ready;
      if (ready) ready(finish);
      else finish();
    };
    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", () => {
      window.clearTimeout(timeout);
      reject(new Error("X embed blocked"));
    }, { once: true });
    if (!existing) {
      script.src = "https://platform.twitter.com/widgets.js";
      script.async = true;
      script.dataset.coreboysXWidgets = "true";
      script.referrerPolicy = "strict-origin-when-cross-origin";
      document.head.appendChild(script);
    }
  }).catch((error) => {
    widgetsPromise = null;
    throw error;
  });

  return widgetsPromise;
}
