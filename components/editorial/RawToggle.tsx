"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Footer toggle for RAW mode — flips a `data-mode` attribute on <html>
 * which CSS keys off of (scanlines + grain + tint). Persisted via
 * localStorage so it survives reloads.
 */
export function RawToggle({ className }: { className?: string }) {
  const [raw, setRaw] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("coreboys:mode");
    if (stored === "raw") {
      setRaw(true);
      document.documentElement.dataset.mode = "raw";
    }
  }, []);

  function toggle() {
    setRaw((r) => {
      const next = !r;
      if (next) {
        document.documentElement.dataset.mode = "raw";
        window.localStorage.setItem("coreboys:mode", "raw");
      } else {
        delete document.documentElement.dataset.mode;
        window.localStorage.removeItem("coreboys:mode");
      }
      return next;
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={raw}
      className={cn(
        "group inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)] transition-colors",
        "hover:text-[color:var(--ink)]",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-5 w-9 items-center rounded-full border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-0.5 transition-colors",
          raw && "border-[color:var(--core)]/60 bg-[color:var(--core)]/10",
        )}
      >
        <span
          className={cn(
            "h-3.5 w-3.5 rounded-full bg-[color:var(--ink-dim)] transition-transform",
            raw && "translate-x-4 bg-[color:var(--core)]",
          )}
        />
      </span>
      RAW{raw ? " · ON" : ""}
    </button>
  );
}
