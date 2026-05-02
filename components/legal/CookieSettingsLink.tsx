"use client";

import { openConsentSettings } from "@/lib/consent";

/**
 * "Open cookie settings" link — re-opens the consent banner. Used in
 * `/legal/cookies` and the footer.
 */
export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openConsentSettings}
      className={
        className ??
        "inline-flex items-center gap-1 rounded-[4px] border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-2 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-[color:var(--ink-dim)] transition-colors hover:border-[color:var(--core)] hover:text-[color:var(--ink)]"
      }
    >
      Cookie settings
    </button>
  );
}
