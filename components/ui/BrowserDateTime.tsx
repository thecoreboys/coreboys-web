"use client";

import { useMemo } from "react";
import { useBrowserTimeZone } from "@/hooks/useBrowserTimeZone";
import { useNow } from "@/hooks/useNow";

export type BrowserDateTimeProps = {
  value: string | number;
  options?: Intl.DateTimeFormatOptions;
  fallback?: string;
  className?: string;
};

/**
 * Hydration-safe absolute timestamp presentation. The instant remains UTC in
 * storage; only its visible representation follows the viewer's browser.
 */
export function BrowserDateTime({
  value,
  options = { dateStyle: "medium", timeStyle: "short" },
  fallback = "Local time",
  className,
}: BrowserDateTimeProps) {
  const viewer = useBrowserTimeZone();
  const parsed = useMemo(() => new Date(value), [value]);
  const valid = Number.isFinite(parsed.getTime());
  const label = viewer.ready && valid
    ? new Intl.DateTimeFormat(viewer.locale, { ...options, timeZone: viewer.timeZone }).format(parsed)
    : fallback;

  return (
    <time
      className={className}
      dateTime={valid ? parsed.toISOString() : undefined}
      title={viewer.ready ? viewer.timeZone : undefined}
      suppressHydrationWarning
    >
      {label}
    </time>
  );
}

export type BrowserRelativeTimeProps = {
  value: string | number;
  absoluteAfterDays?: number;
  fallback?: string;
  className?: string;
};

/** Relative age that keeps ticking and falls back to a viewer-local date. */
export function BrowserRelativeTime({
  value,
  absoluteAfterDays = 14,
  fallback = "Local time",
  className,
}: BrowserRelativeTimeProps) {
  const viewer = useBrowserTimeZone();
  const now = useNow(60_000);
  const parsed = useMemo(() => new Date(value), [value]);
  const valid = Number.isFinite(parsed.getTime());
  let label = fallback;

  if (viewer.ready && valid) {
    const diffMs = parsed.getTime() - now;
    const absoluteMs = Math.abs(diffMs);
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const relative = new Intl.RelativeTimeFormat(viewer.locale, { numeric: "auto", style: "short" });

    if (absoluteMs < hour) {
      const minutes = Math.max(1, Math.floor(absoluteMs / minute));
      label = relative.format(diffMs < 0 ? -minutes : minutes, "minute");
    } else if (absoluteMs < day) {
      const hours = Math.max(1, Math.floor(absoluteMs / hour));
      label = relative.format(diffMs < 0 ? -hours : hours, "hour");
    } else if (absoluteMs < absoluteAfterDays * day) {
      const days = Math.max(1, Math.floor(absoluteMs / day));
      label = relative.format(diffMs < 0 ? -days : days, "day");
    } else {
      label = new Intl.DateTimeFormat(viewer.locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: viewer.timeZone,
      }).format(parsed);
    }
  }

  return (
    <time
      className={className}
      dateTime={valid ? parsed.toISOString() : undefined}
      title={viewer.ready ? viewer.timeZone : undefined}
      suppressHydrationWarning
    >
      {label}
    </time>
  );
}
