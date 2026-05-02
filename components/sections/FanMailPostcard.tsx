"use client";

import { useState } from "react";
import { Check, Copy, Mail } from "lucide-react";
import type { PoBox } from "@/lib/members";

export type FanMailPostcardProps = {
  stageName: string;
  realName: string;
  initial: string;
  accent: string;
  poBox: PoBox | null | undefined;
  /** Comm logo path — when present, used as the postage-stamp art so the
   * postcard reads as branded mail from that comm. */
  commLogo?: string;
  commName?: string;
};

/**
 * Postcard-styled fan-mail card. Real-postcard layout:
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │ ✎ Side notes  ·  Sent with love                     │
 *   │                                                     │
 *   │ Handwritten message    │     ┌─────┐                │
 *   │ pre-printed for you    │     │STAMP│  postmark      │
 *   │                        │     └─────┘                │
 *   │                        │     ─────────────          │
 *   │                        │     Address lines...       │
 *   │                        │     City, ST 00000         │
 *   │                        │                            │
 *   │ [ Copy address ]       │                            │
 *   └─────────────────────────────────────────────────────┘
 *
 * The page-side spec for postcards (vertical center divider, address
 * panel right, stamp top-right, message left) is followed deliberately
 * so it reads as a real postcard at a glance.
 */
export function FanMailPostcard({
  stageName,
  realName: _realName,
  initial,
  accent,
  poBox,
  commLogo,
  commName,
}: FanMailPostcardProps) {
  const [copied, setCopied] = useState(false);

  if (!poBox) {
    return (
      <div className="paper-card relative max-w-[720px]" style={{ ["--paper-rotate" as string]: "-0.6deg" }}>
        <p className="font-typewriter text-[11px] uppercase tracking-[0.22em] text-[color:var(--paper-ink-dim)]">
          Fan Mail · {stageName}
        </p>
        <h3 className="mt-3 font-editorial-serif text-[28px] font-bold italic leading-tight text-[color:var(--paper-ink)]">
          No public address yet.
        </h3>
        <p className="mt-3 max-w-[60ch] font-typewriter text-[14px] leading-relaxed text-[color:var(--paper-ink-dim)]">
          {stageName} doesn&apos;t have a public mailing address on file. Check back later.
        </p>
      </div>
    );
  }

  const formatted = formatAddress(poBox);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="paper-card relative grid w-full max-w-[800px] grid-cols-1 gap-6 md:grid-cols-2 md:gap-0"
      style={{ ["--paper-rotate" as string]: "-0.6deg", padding: 0 }}
    >
      {/* Left — message side */}
      <div className="relative flex flex-col gap-4 p-6 md:border-r md:border-dashed md:border-[color:var(--paper-rule)] md:p-8">
        <div className="flex items-center gap-2">
          <Mail size={14} className="text-[color:var(--paper-ink-dim)]" />
          <p className="font-typewriter text-[10px] uppercase tracking-[0.22em] text-[color:var(--paper-ink-dim)]">
            Mailing address · {stageName}
          </p>
        </div>

        <h3 className="font-editorial-serif text-[26px] font-bold italic leading-[1.1] text-[color:var(--paper-ink)]">
          Send a letter or package.
        </h3>

        <p className="font-typewriter text-[13px] leading-relaxed text-[color:var(--paper-ink-dim)]">
          Accepts postcards, letters, fan art, and packages. Drop it in the mail — not a DM.
          Mail gets opened on stream — much appreciated.
        </p>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-dashed border-[color:var(--paper-rule)] pt-4">
          <button type="button" onClick={onCopy} data-copied={copied ? "1" : undefined} className="paper-button">
            {copied ? (
              <>
                <Check size={11} className="mr-1.5 inline" /> Copied
              </>
            ) : (
              <>
                <Copy size={11} className="mr-1.5 inline" /> Copy address
              </>
            )}
          </button>
          <span className="font-typewriter text-[10px] uppercase tracking-[0.22em] text-[color:var(--paper-ink-dim)]">
            via airmail
          </span>
        </div>
      </div>

      {/* Right — address side */}
      <div className="relative flex flex-col gap-4 p-6 md:p-8">
        {/* Stamp + postmark, anchored top-right */}
        <div className="flex items-start justify-end gap-4">
          <div
            className="postmark relative"
            style={{ position: "relative", top: 0, right: 0 }}
            aria-hidden
          >
            CORE<br />
            AIRMAIL<br />
            ★ ★ ★
          </div>
          {commLogo ? (
            // Comm-logo "rubber stamp": clean white card stamped on top of
            // the postcard at an angle. No perforations / no radial texture
            // — just a flat printed badge so the logo reads cleanly.
            <div
              className="comm-stamp shrink-0"
              style={{ ["--accent" as string]: accent }}
              aria-label={commName ? `${commName} comm stamp` : "Comm stamp"}
            >
              <div className="comm-stamp__inner">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={commLogo}
                  alt={commName ? `${commName} comm` : ""}
                  className="h-[60px] w-[60px] object-contain"
                />
                <span className="comm-stamp__caption">
                  {commName ? `${commName.toUpperCase()} · 25¢` : "CORE · 25¢"}
                </span>
              </div>
            </div>
          ) : (
            <div
              className="postage-stamp shrink-0"
              style={{
                ["--stamp-bg" as string]: `${accent}40`,
                ["--stamp-bg-base" as string]: `${accent}20`,
              }}
            >
              <div className="postage-stamp__inner">
                <span className="postage-stamp__initial">{initial}</span>
                <span className="postage-stamp__caption">CORE · 25¢</span>
              </div>
            </div>
          )}
        </div>

        {/* Address lines on hand-drawn rules */}
        <div className="mt-2 flex flex-col">
          <p className="mb-3 font-typewriter text-[9px] uppercase tracking-[0.22em] text-[color:var(--paper-ink-dim)]">
            Mail to ──
          </p>
          <div className="flex flex-col gap-2">
            {formatted.split("\n").map((line, i) => (
              <div
                // eslint-disable-next-line react/no-array-index-key
                key={i}
                className="border-b border-dotted border-[color:var(--paper-rule)] pb-1.5"
              >
                <p className="address-block">{line}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatAddress(p: PoBox): string {
  const lines = [p.recipient, ...p.lines, `${p.city}, ${p.region} ${p.postalCode}`, p.country];
  return lines.filter(Boolean).join("\n");
}
