"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
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
      <div className="pointer-events-auto w-full max-w-[420px] rounded-2xl border border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)]/95 px-5 py-4 shadow-2xl backdrop-blur-md">
        <p className="text-md font-semibold tracking-tight text-[color:var(--ink)]">
          Cookies
        </p>
        <p className="mt-1.5 text-sm leading-[1.5] text-[color:var(--ink-dim)]">
          We save one cookie for your preference, plus Google Analytics if you accept.{" "}
          <Link
            href={"/legal/cookies" as Route}
            className="text-[color:var(--ink)] underline-offset-2 hover:underline"
          >
            Read More
          </Link>
        </p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={decline}
            className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-[color:var(--rule-strong)] bg-[color:var(--bg)] px-4 text-xs font-semibold tracking-tight text-[color:var(--ink-dim)] transition-all hover:-translate-y-px hover:border-[color:var(--ink)] hover:text-[color:var(--ink)] hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.4)] active:translate-y-0"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={accept}
            className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-[color:var(--core)] bg-[color:var(--core)] px-4 text-xs font-semibold tracking-tight text-white transition-all hover:-translate-y-px hover:shadow-[0_8px_20px_-6px_rgba(219,3,104,0.55)] active:translate-y-0"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
