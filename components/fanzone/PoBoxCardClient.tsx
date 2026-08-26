"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy01, XClose } from "@untitledui/icons";
import { Heart } from "lucide-react";
import { FanMailPostcard } from "@/components/sections/FanMailPostcard";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { CommunityStamp } from "@/components/fanzone/CommunityStamp";
import { postcardIdentityFor } from "@/lib/postcard-identities";
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
  isFavorite?: boolean;
};

/**
 * Compact PO box tile. Click → opens a modal that renders the full
 * postcard (the same component used on /about/[slug]). Copy-to-clipboard
 * lives both on the tile (for power users) and inside the modal.
 *
 * UUI surface: rounded-xl card, bg-secondary, ring-1 ring-inset,
 * shadow-xs-skeuomorphic; UUI type scale throughout. The accent-tinted
 * hover glow is preserved as a brand affordance. The postcard inside the
 * modal is a bespoke paper artifact (kept intentionally).
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
  isFavorite = false,
}: PoBoxCardClientProps) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const identity = postcardIdentityFor(slug);
  const featuredDesign = identity?.frontDesigns[0];

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
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => dialogRef.current?.focus());

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) {
        e.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      const restoreTarget = previouslyFocused?.isConnected ? previouslyFocused : triggerRef.current;
      restoreTarget?.focus();
    };
  }, [open]);

  return (
    <>
      <article
        className="group relative block h-full w-full cursor-pointer overflow-hidden rounded-xl p-5 text-left shadow-xs-skeuomorphic ring-1 ring-inset ring-white/15 transition-all"
        data-postcard-archetype={identity?.archetype}
        style={{
          background: featuredDesign?.background ?? "var(--color-bg-secondary)",
          color: featuredDesign?.ink ?? "inherit",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = `0 12px 32px -16px ${accent}99`;
          e.currentTarget.style.transform = "translateY(-2px)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = "";
          e.currentTarget.style.transform = "";
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          className="absolute inset-0 z-10 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
          aria-label={`View ${stageName} postcard`}
        />
        <div className="pointer-events-none relative z-20 flex items-center gap-3 pr-20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full ring-2 ring-inset"
            style={{ ["--tw-ring-color" as string]: `${accent}77` }}
          />
          <div className="min-w-0 flex-1">
            <p className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: featuredDesign?.ink }}>
              {stageName}
              {isFavorite ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-secondary">
                  <Heart size={10} fill="currentColor" aria-hidden /> Favorite
                </span>
              ) : null}
            </p>
            <p className="line-clamp-2 text-xs font-bold uppercase tracking-[.12em] opacity-65" style={{ color: featuredDesign?.ink }}>
              {identity?.concept ?? "Tap to view postcard"}
            </p>
          </div>
          <ArrowUpRight className="size-4 opacity-65 transition-opacity group-hover:opacity-100" />
        </div>
        <CommunityStamp logo={commLogo} name={commName} className="absolute right-4 top-4 z-20" />
        <div className="pointer-events-none absolute -bottom-10 -right-8 select-none text-[76px] font-black uppercase leading-none opacity-[.06]" aria-hidden>
          {identity?.communityName ?? stageName}
        </div>
        <pre className="relative mt-4 whitespace-pre-line rounded-lg bg-black/35 p-3 font-mono text-xs font-semibold leading-snug text-white ring-1 ring-inset ring-white/15 backdrop-blur-sm">
          {formatted}
        </pre>
        <div className="pointer-events-none relative z-20 mt-3 flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wide opacity-65">
            {poBox?.verifiedAt ? `Checked ${formatVerifiedAt(poBox.verifiedAt)}` : "Confirm before mailing"}
          </span>
          <button
            type="button"
            onClick={onCopy}
            className="pointer-events-auto relative z-30 inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-secondary shadow-xs ring-1 ring-inset ring-secondary transition-colors hover:bg-secondary hover:text-primary"
          >
            {copied ? (
              <>
                <Check className="size-3.5 text-success-primary" /> Copied
              </>
            ) : (
              <>
                <Copy01 className="size-3.5" /> Copy address
              </>
            )}
          </button>
        </div>
      </article>

      {open ? (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${stageName} mailing postcard`}
          tabIndex={-1}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative max-w-[820px]"
            onClick={(e) => e.stopPropagation()}
          >
            <FanMailPostcard
              slug={slug}
              stageName={stageName}
              realName={realName ?? stageName}
              initial={stageName[0] ?? "C"}
              accent={accent}
              poBox={poBox ?? null}
              commLogo={commLogo}
              commName={commName}
            />
            <div className="absolute -right-3 -top-3">
              <ButtonUtility
                size="sm"
                color="secondary"
                icon={XClose}
                aria-label="Close"
                onClick={() => setOpen(false)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function formatVerifiedAt(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}
