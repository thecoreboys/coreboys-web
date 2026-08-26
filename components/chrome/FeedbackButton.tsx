"use client";

import { MessageSquare } from "lucide-react";
import { usePathname } from "next/navigation";

/**
 * Floating bottom-right stack: a "Give Feedback" pill on top + a
 * smaller "Built by MDCran" credit underneath. Mounted globally from
 * app/layout.tsx alongside the other persistent surface chrome
 * (cookie banner, console egg, etc.).
 */
export function FeedbackButton() {
  const pathname = usePathname();
  const inWatchExperience =
    pathname === "/" ||
    pathname === "/guide" ||
    pathname.startsWith("/my-list") ||
    pathname.startsWith("/dvr") ||
    pathname.startsWith("/channels") ||
    pathname.startsWith("/watch") ||
    pathname.startsWith("/theater") ||
    pathname.startsWith("/multiview") ||
    pathname === "/special-message";

  if (inWatchExperience) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-1.5 md:bottom-6 md:right-6">
      <a
        href="https://forms.gle/gg9TEQjSn7UCvRcE6"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Give feedback (opens Google Form in a new tab)"
        className="inline-flex items-center gap-2 rounded-full border border-[color:var(--core)]/60 bg-[color:var(--bg-elev)]/90 px-4 py-2.5 text-xs font-semibold tracking-tight text-[color:var(--ink)] shadow-[0_18px_40px_-18px_rgba(219,3,104,0.7),inset_0_0_0_1px_rgba(219,3,104,0.18)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-[color:var(--core)] hover:bg-[color:var(--core)]/12 hover:text-[color:var(--core)]"
      >
        <MessageSquare size={13} aria-hidden />
        Give Feedback
      </a>
      <a
        href="https://x.com/berryeyu"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Built by MDCran — open Twitter profile in new tab"
        className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--rule)] bg-[color:var(--bg-elev)]/85 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.2em] text-[color:var(--ink-dim)] backdrop-blur-md transition-colors hover:border-[color:var(--core)] hover:text-[color:var(--core)]"
      >
        Built by MDCran ↗
      </a>
    </div>
  );
}
