"use client";

/* eslint-disable @next/next/no-img-element */

import { useState, type CSSProperties, type ReactNode } from "react";
import { Check, Copy, Mail } from "lucide-react";
import { postcardIdentityFor, type PostcardArchetype } from "@/lib/postcard-identities";
import type { PoBox } from "@/lib/members";

export type FanMailPostcardProps = {
  slug: string;
  stageName: string;
  realName: string;
  initial: string;
  accent: string;
  poBox: PoBox | null | undefined;
  commLogo?: string;
  commName?: string;
};

const ARCHETYPE_LABELS: Record<PostcardArchetype, string> = {
  "broadcast-freeze-frame": "Transmission log",
  "creator-trading-card": "Mission file",
  "newspaper-front-page": "Late edition",
  "editorial-magazine": "Editor's letter",
  "scrapbook-contact-sheet": "Field note",
};

const ARCHETYPE_CLASSES: Record<PostcardArchetype, string> = {
  "broadcast-freeze-frame": "rounded-lg border border-cyan-200/30 bg-[#081017] text-[#f5f8fa] shadow-[0_24px_65px_-38px_rgba(46,170,232,.58)]",
  "creator-trading-card": "rounded-lg border border-[#24201a] bg-[#f5ecd7] text-[#18140e] shadow-[0_20px_55px_-38px_rgba(24,20,14,.52)]",
  "newspaper-front-page": "rounded-lg border border-[#312b22] bg-[#f2eadb] text-[#171411] shadow-[0_20px_55px_-38px_rgba(34,28,20,.48)]",
  "editorial-magazine": "rounded-lg border border-white/18 bg-[#111215] text-[#f5f5f3] shadow-[0_24px_65px_-40px_rgba(255,255,255,.25)]",
  "scrapbook-contact-sheet": "rounded-lg border border-[#6f685f]/40 bg-[#f5efe4] text-[#1b1814] shadow-[0_20px_55px_-38px_rgba(42,33,25,.45)]",
};

/** Profile/Fan Zone artifact driven by the same identity catalog as checkout. */
export function FanMailPostcard({
  slug,
  stageName,
  initial,
  accent,
  poBox,
  commLogo,
  commName,
}: FanMailPostcardProps) {
  const [copied, setCopied] = useState(false);
  const identity = postcardIdentityFor(slug);

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
  const archetype = identity?.archetype ?? "editorial-magazine";
  const logo = identity?.media.communityLogo ?? commLogo;
  const palette = identity?.palette;
  const style = {
    "--pc-primary": palette?.primary ?? accent,
    "--pc-secondary": palette?.secondary ?? accent,
    "--pc-surface": palette?.surface ?? "#111",
    "--pc-ink": palette?.ink ?? "#fff",
    "--pc-muted": palette?.mutedInk ?? "#aaa",
    "--pc-paper": identity?.paper.baseColor ?? "#f4efe4",
    fontFamily: identity?.typography.body.family,
  } as CSSProperties;
  const darkSurface = archetype === "broadcast-freeze-frame" || archetype === "editorial-magazine";
  const panelRule = darkSurface ? "border-white/20" : "border-black/15";

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Clipboard can be unavailable in embedded browsers. */
    }
  };

  return (
    <article
      data-postcard-archetype={archetype}
      className={`relative isolate w-full max-w-[880px] overflow-hidden ${ARCHETYPE_CLASSES[archetype]}`}
      style={style}
    >
      <IdentityTexture archetype={archetype} />
      <IdentityMasthead
        stageName={stageName}
        communityName={identity?.communityName ?? commName ?? "CORE"}
        label={ARCHETYPE_LABELS[archetype]}
        logo={logo}
      />

      <div className="relative z-10 grid grid-cols-1 md:grid-cols-[.92fr_1.08fr]">
        <section
          className={`flex min-h-[280px] flex-col border-b ${panelRule} p-6 md:border-b-0 md:border-r md:p-8`}
        >
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] opacity-70">
            <Mail size={13} aria-hidden />
            {identity?.back.messageLabel ?? "A note from the community"}
          </div>
          <h3
            className="mt-5 max-w-[21ch] text-pretty font-sans text-[clamp(1.7rem,3vw,2.45rem)] font-bold leading-[1.04] tracking-[-.045em]"
            style={{ fontFamily: "var(--font-sans), Inter, Arial, sans-serif" }}
          >
            Send {stageName} something worth keeping.
          </h3>
          <p className="mt-5 max-w-[48ch] text-sm leading-relaxed opacity-75">
            Letters, postcards, fan art, and packages are welcome. This is {stageName}&apos;s public fan-mail address—not a private location.
          </p>
          <div className="mt-auto flex flex-wrap items-center gap-3 pt-7">
            <button
              type="button"
              onClick={onCopy}
              data-copied={copied ? "1" : undefined}
              className="inline-flex min-h-10 items-center rounded-full border border-current bg-white/10 px-4 text-xs font-bold uppercase tracking-[.12em] transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
            >
              {copied ? <Check size={13} className="mr-2" /> : <Copy size={13} className="mr-2" />}
              {copied ? "Copied" : "Copy address"}
            </button>
          </div>
        </section>

        <section className="relative flex min-h-[280px] flex-col p-6 md:p-8" aria-label={`${stageName} mailing address`}>
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[.2em] opacity-55">Public fan mail</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-[.08em] opacity-80">
                {identity?.back.senderLabel ?? "CORE dispatch"}
              </p>
            </div>
            <CreatorSeal
              initial={initial}
              logo={logo}
              label={identity?.postage.stamp.label ?? commName ?? "CORE"}
              background={identity?.postage.stamp.background ?? accent}
              ink={identity?.postage.stamp.ink ?? "#fff"}
            />
          </div>

          <div className="mt-7">
            <p className="mb-3 text-[9px] font-bold uppercase tracking-[.2em] opacity-55">Mail to</p>
            <div className="flex flex-col gap-2">
              {formatted.split("\n").map((line, index) => (
                <div
                  key={`${line}-${index}`}
                  className={`border-b ${panelRule} pb-1.5 font-mono`}
                >
                  <p className="text-[13px] font-semibold leading-snug tracking-[.025em]">{line}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto flex items-end justify-between gap-4 pt-5 text-[9px] font-bold uppercase tracking-[.14em] opacity-55">
            <span>Confirmed public address</span>
            <span>Community mark · decorative</span>
          </div>
        </section>
      </div>
    </article>
  );
}

function IdentityMasthead({
  stageName,
  communityName,
  label,
  logo,
}: {
  stageName: string;
  communityName: string;
  label: string;
  logo?: string;
}) {
  return (
    <header className="relative z-10 flex items-center gap-3 border-b border-current/15 px-6 py-4 md:px-8">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-current/15 bg-white/70 p-1.5 shadow-sm">
        {logo ? <img src={logo} alt="" className="h-full w-full object-contain" /> : <strong className="text-sm">{stageName.slice(0, 1)}</strong>}
      </span>
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-[.2em] opacity-60">{label}</p>
        <strong className="mt-0.5 block truncate font-editorial-serif text-[clamp(1.35rem,2.8vw,2rem)] leading-none">{communityName} mailroom</strong>
      </div>
      <span className="ml-auto hidden whitespace-nowrap text-[9px] font-bold uppercase tracking-[.15em] opacity-55 sm:block">CORE / official mail</span>
    </header>
  );
}

function IdentityTexture({ archetype }: { archetype: PostcardArchetype }) {
  let texture: ReactNode;
  if (archetype === "broadcast-freeze-frame") {
    texture = <div className="absolute inset-0 opacity-[.08]" style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent 0 3px,rgba(101,205,248,.22) 3px 4px)" }} />;
  } else if (archetype === "creator-trading-card") {
    texture = <div className="absolute inset-0 opacity-[.08]" style={{ backgroundImage: "linear-gradient(135deg,rgba(24,20,14,.18),transparent 38%)" }} />;
  } else if (archetype === "newspaper-front-page") {
    texture = <div className="absolute inset-0 opacity-[.1]" style={{ backgroundImage: "radial-gradient(#111 0.45px, transparent 0.6px)", backgroundSize: "4px 4px" }} />;
  } else if (archetype === "editorial-magazine") {
    texture = <div className="absolute inset-0 opacity-[.07]" style={{ backgroundImage: "linear-gradient(90deg,rgba(255,255,255,.18) 1px,transparent 1px)", backgroundSize: "32px 32px" }} />;
  } else {
    texture = <div className="absolute inset-0 opacity-[.1]" style={{ backgroundImage: "linear-gradient(#6f685f 1px,transparent 1px)", backgroundSize: "100% 29px" }} />;
  }
  return <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">{texture}</div>;
}

function CreatorSeal({
  initial,
  logo,
  label,
  background,
  ink,
}: {
  initial: string;
  logo?: string;
  label: string;
  background: string;
  ink: string;
}) {
  return (
    <div
      className="relative flex size-[70px] shrink-0 flex-col items-center justify-center rounded-md border p-2 text-center shadow-sm"
      style={{ background, color: ink, borderColor: ink }}
      aria-label={`${label} decorative creator seal`}
    >
      {logo ? <img src={logo} alt="" className="h-11 w-11 object-contain" /> : <strong className="text-3xl font-black">{initial}</strong>}
      <span className="mt-1 max-w-full truncate text-[7px] font-black uppercase tracking-[.08em]">Community mark</span>
    </div>
  );
}

function formatAddress(poBox: PoBox): string {
  return [poBox.recipient, ...poBox.lines, `${poBox.city}, ${poBox.region} ${poBox.postalCode}`, poBox.country]
    .filter(Boolean)
    .join("\n");
}
