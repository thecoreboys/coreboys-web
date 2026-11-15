"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Keep browse filters in the URL so returning from a video restores the view. */
export function useBrowseFilters<T extends Record<string, string>>(defaults: T) {
  const defaultsKey = JSON.stringify(defaults);
  const [filters, setFilters] = useState<T>(defaults);
  const currentFilters = useRef(filters);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const initial = JSON.parse(defaultsKey) as T;
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      const next = Object.fromEntries(Object.entries(initial).map(([key, fallback]) => [key, params.get(key) ?? fallback])) as T;
      currentFilters.current = next;
      setFilters(next);
      setReady(true);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [defaultsKey]);
  const update = useCallback((patch: Partial<T>) => {
    const next = { ...currentFilters.current, ...patch };
    currentFilters.current = next;
    setFilters(next);
    const url = new URL(window.location.href);
    const initial = JSON.parse(defaultsKey) as T;
    for (const [key, value] of Object.entries(next)) {
      if (!value || value === initial[key]) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [defaultsKey]);
  return { filters, update, ready };
}
