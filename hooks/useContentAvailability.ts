"use client";

import { useEffect, useState } from "react";
import type { ContentIdentityInput } from "@/lib/content-identity";
import { availabilityRequestItems } from "@/lib/watch/availability-request";

const EVENT = "core-content-unavailable";

/** Recheck displayed/saved content using the site's registry, never paid APIs. */
export function useContentAvailability(items: readonly ContentIdentityInput[]): ReadonlySet<string> {
  const [unavailable, setUnavailable] = useState<Set<string>>(() => new Set());
  const requestKey = JSON.stringify(availabilityRequestItems(items));
  useEffect(() => {
    const receive = (event: Event) => {
      const keys = (event as CustomEvent<unknown>).detail;
      if (!Array.isArray(keys)) return;
      setUnavailable((previous) => {
        const next = new Set(previous);
        for (const key of keys) if (typeof key === "string") next.add(key);
        return next.size === previous.size ? previous : next;
      });
    };
    window.addEventListener(EVENT, receive);
    return () => window.removeEventListener(EVENT, receive);
  }, []);
  useEffect(() => {
    const candidates = JSON.parse(requestKey) as ContentIdentityInput[];
    if (!candidates.length) return;
    let disposed = false;
    let active: AbortController | null = null;
    const refresh = async () => {
      if (disposed || active || document.hidden || !navigator.onLine) return;
      active = new AbortController();
      const timeout = window.setTimeout(() => active?.abort(), 12_000);
      try {
        const keys = new Set<string>();
        for (let offset = 0; offset < candidates.length; offset += 100) {
          const response = await fetch("/api/watch/availability", { method: "POST", cache: "no-store",
            headers: { "content-type": "application/json" }, body: JSON.stringify({ items: candidates.slice(offset, offset + 100) }),
            signal: active.signal,
          });
          if (!response.ok) throw new Error("availability_unavailable");
          const data = await response.json() as { unavailableKeys?: unknown };
          if (!Array.isArray(data.unavailableKeys)) throw new Error("invalid_availability");
          for (const key of data.unavailableKeys) if (typeof key === "string") keys.add(key);
        }
        if (!disposed && keys.size) window.dispatchEvent(new CustomEvent(EVENT, { detail: [...keys] }));
      } catch { /* Keep known removals; a temporary check failure is not deletion evidence. */ }
      finally { window.clearTimeout(timeout); active = null; }
    };
    const onActive = () => { void refresh(); };
    void refresh();
    const timer = window.setInterval(onActive, 60_000);
    window.addEventListener("focus", onActive);
    window.addEventListener("online", onActive);
    document.addEventListener("visibilitychange", onActive);
    return () => {
      disposed = true;
      active?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", onActive);
      window.removeEventListener("online", onActive);
      document.removeEventListener("visibilitychange", onActive);
    };
  }, [requestKey]);
  return unavailable;
}
