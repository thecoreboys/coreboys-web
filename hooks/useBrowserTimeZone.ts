"use client";

import { useEffect, useState } from "react";

export type BrowserTimeZone = Readonly<{
  locale: string;
  timeZone: string;
  ready: boolean;
}>;

const SERVER_SNAPSHOT: BrowserTimeZone = Object.freeze({
  locale: "en-US",
  timeZone: "UTC",
  ready: false,
});

function browserSnapshot(): BrowserTimeZone {
  const resolved = new Intl.DateTimeFormat().resolvedOptions();
  return {
    locale: resolved.locale || window.navigator.language || "en-US",
    timeZone: resolved.timeZone || "UTC",
    ready: true,
  };
}

/**
 * Resolves date/time presentation from the viewer's browser after hydration.
 * The server snapshot is deliberately marked unready so server-local time can
 * never flash before the viewer's own timezone is known.
 */
export function useBrowserTimeZone(): BrowserTimeZone {
  const [value, setValue] = useState<BrowserTimeZone>(SERVER_SNAPSHOT);

  useEffect(() => {
    const refresh = () => {
      const next = browserSnapshot();
      setValue((current) => (
        current.ready && current.locale === next.locale && current.timeZone === next.timeZone
          ? current
          : next
      ));
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    refresh();
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("languagechange", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("languagechange", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  return value;
}
