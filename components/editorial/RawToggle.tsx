"use client";

import { useEffect, useState } from "react";
import { Toggle } from "@/components/base/toggle/toggle";
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

  function toggle(next: boolean) {
    if (next) {
      document.documentElement.dataset.mode = "raw";
      window.localStorage.setItem("coreboys:mode", "raw");
    } else {
      delete document.documentElement.dataset.mode;
      window.localStorage.removeItem("coreboys:mode");
    }
    setRaw(next);
  }

  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <Toggle
        size="sm"
        slim
        isSelected={raw}
        onChange={toggle}
        aria-label="RAW mode"
      />
      <span
        className={cn(
          "font-mono text-xs uppercase tracking-[0.18em] transition-colors",
          raw ? "text-[color:var(--core)]" : "text-[color:var(--ink-faint)]",
        )}
      >
        RAW{raw ? " · ON" : ""}
      </span>
    </div>
  );
}
