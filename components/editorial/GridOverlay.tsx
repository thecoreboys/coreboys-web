"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Dev-only 12-column grid overlay. Activate by appending `?grid=1` to the URL.
 * Implemented as a single CSS pseudo-element on <html> driven by a data-grid
 * attribute (see globals.css).
 */
export function GridOverlay() {
  const params = useSearchParams();
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (params.get("grid") === "1") {
      document.documentElement.dataset.grid = "1";
    } else {
      delete document.documentElement.dataset.grid;
    }
    return () => {
      delete document.documentElement.dataset.grid;
    };
  }, [params]);
  return null;
}
