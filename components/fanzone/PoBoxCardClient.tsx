"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Copy, X } from "lucide-react";
import { FanMailPostcard } from "@/components/sections/FanMailPostcard";
import type { PoBox } from "@/lib/members";

export type PoBoxCardClientProps = {
  slug: string;
  stageName: string;
  realName?: string;
  accent: string;
  avatarUrl: string;
  /** Pre-joined newline-separated address. */
  formatted: string;
  /** Comm logo path so we can render a watermark on the card. */
  commLogo?: string;
  commName?: string;
  /** Full PO box record for the modal-rendered postcard. */
  poBox?: PoBox;
};

/**
 * Compact PO box tile. Click → opens a modal that renders the full
 * postcard (the same component used on /m/[slug]). Copy-to-clipboard
 * lives both on the tile (for power users) and inside the modal.
 */
export function PoBoxCardClient({
  slug,
  stageName,
  realName,
  accent,
  avatarUrl,
  formatted,
  commLogo,
  commName,
  poBox,
}: PoBoxCardClientProps) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const onCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block h-full w-full overflow-hidden rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-5 text-left transition-all cursor-pointer"
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = accent;
          e.currentTarget.style.boxShadow = `0 12px 32px -16px ${accent}99`;
          e.currentTarget.style.transform = "translateY(-2px)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "";
          e.currentTarget.style.boxShadow = "";
          e.currentTarget.style.transform = "";
        }}
      >
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full ring-2 ring-inset"
            style={{ ["--tw-ring-color" as string]: `${accent}77` }}
          />
          <div className="min-w-0 flex-1">
            <p className="inline-flex items-center gap-2 text-[14px] font-semibold text-[color:var(--ink)]">
              {stageName}
              {commLogo ? (
                <span
                  className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-sm bg-black/85 ring-1 ring-inset ring-white/10 p-[1px]"
                  title={commName}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={commLogo}
                    alt={commName ? `${commName} logo` : ""}
                    className="h-full w-full object-contain"
                  />
                </span>
              ) : null}
            </p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
              Tap to view postcard
            </p>
          </div>
          <ArrowUpRight
            size={14}
            className="text-[color:var(--ink-dim)] transition-colors group-hover:text-[color:var(--ink)]"
          />
        </div>
        <pre className="mt-4 whitespace-pre-line rounded-md border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg)] p-3 font-mono text-[12px] leading-snug text-[color:var(--ink)]">
          {formatted}
        </pre>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
            First-class postage
          </span>
          <span
            onClick={onCopy}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                void onCopy(e as unknown as React.MouseEvent);
              }
            }}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] px-2.5 py-1.5 text-[12px] font-medium text-[color:var(--ink-dim)] transition-all hover:-translate-y-px hover:border-[color:var(--core)] hover:bg-[color:var(--surface)] hover:text-[color:var(--ink)] active:translate-y-0"
          >
            {copied ? (
              <>
                <Check size={12} /> Copied
              </>
            ) : (
              <>
                <Copy size={12} /> Copy address
              </>
            )}
          </span>
        </div>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative max-w-[820px]"
            onClick={(e) => e.stopPropagation()}
          >
            <FanMailPostcard
              stageName={stageName}
              realName={realName ?? stageName}
              initial={stageName[0] ?? "C"}
              accent={accent}
              poBox={poBox ?? null}
              commLogo={commLogo}
              commName={commName}
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute -right-3 -top-3 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/70 text-white shadow-lg transition-all hover:scale-110 hover:bg-black/90"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
