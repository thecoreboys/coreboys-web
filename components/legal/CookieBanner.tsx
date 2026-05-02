"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { Cookie, X } from "lucide-react";
import { getConsent, setConsent } from "@/lib/consent";

/**
 * Cookie banner. Renders nothing on first paint (prevents layout shift),
 * then mounts an inline glass-style strip pinned to the bottom on first
 * visit or whenever the "Cookie settings" link reopens it. Decline and
 * Accept are styled with equal weight — no dark patterns.
 */
export function CookieBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (getConsent() === "unknown") setOpen(true);
    function reopen() {
      setOpen(true);
    }
    window.addEventListener("coreboys:consent-open", reopen);
    return () => window.removeEventListener("coreboys:consent-open", reopen);
  }, []);

  if (!open) return null;

  function accept() {
    setConsent(true);
    setOpen(false);
  }
  function decline() {
    setConsent(false);
    setOpen(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4"
    >
      <div className="pointer-events-auto w-full max-w-[680px] rounded-[12px] border border-[color:var(--rule)] bg-[color:var(--bg-elev)]/85 px-5 py-4 shadow-2xl backdrop-blur-md">
        <div className="flex items-start gap-3">
          <Cookie size={16} className="mt-0.5 shrink-0 text-[color:var(--core)]" />
          <div className="flex-1 text-[13px] leading-[1.55] text-[color:var(--ink-dim)]">
            <p>
              We use a single first-party cookie to remember your choice and,{" "}
              <strong className="text-[color:var(--ink)]">only if you accept</strong>,
              load Google Analytics to measure how the site is used. No
              advertising, no profiling.
            </p>
            <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ink-faint)]">
              Read the{" "}
              <Link href={"/legal/privacy" as Route} className="hover:text-[color:var(--ink)]">
                privacy policy
              </Link>{" "}
              ·{" "}
              <Link href={"/legal/cookies" as Route} className="hover:text-[color:var(--ink)]">
                cookie policy
              </Link>
            </p>
          </div>
          <button
            type="button"
            onClick={decline}
            aria-label="Close"
            className="shrink-0 rounded-[6px] p-1 text-[color:var(--ink-faint)] hover:bg-[color:var(--surface)] hover:text-[color:var(--ink)]"
          >
            <X size={14} />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={decline}
            className="inline-flex h-9 items-center rounded-[6px] border border-[color:var(--rule)] bg-transparent px-3 font-mono text-[11px] uppercase tracking-[0.16em] text-[color:var(--ink-dim)] transition-colors hover:border-[color:var(--core)] hover:text-[color:var(--ink)]"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={accept}
            className="inline-flex h-9 items-center rounded-[6px] border border-[color:var(--core)] bg-[color:var(--core)] px-3 font-mono text-[11px] uppercase tracking-[0.16em] text-black transition-opacity hover:opacity-90"
          >
            Accept analytics
          </button>
        </div>
      </div>
    </div>
  );
}
