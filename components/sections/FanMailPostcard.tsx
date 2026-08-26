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
  "broadcast-freeze-frame": "rounded-sm border border-cyan-300/35 bg-[#05070a] text-[#f7fbff] shadow-[0_28px_80px_-38px_rgba(46,170,232,.8)]",
  "creator-trading-card": "rounded-[22px] border-[3px] border-[#111] bg-[#fbbf24] text-[#090909] shadow-[10px_12px_0_#111]",
  "newspaper-front-page": "rounded-none border-[4px] border-double border-[#111] bg-[#eee5d5] text-[#111] shadow-[8px_10px_0_rgba(239,68,68,.72)]",
  "editorial-magazine": "rounded-none border border-white/25 bg-[#080808] text-[#f4f4f5] shadow-[0_30px_85px_-42px_rgba(255,255,255,.45)]",
  "scrapbook-contact-sheet": "rounded-[3px] border border-[#6f685f]/40 bg-[#f5ede0] text-[#181615] shadow-[7px_11px_22px_rgba(42,33,25,.3)]",
};

/** Profile/Fan Zone artifact driven by the same identity catalog as checkout. */
export function FanMailPostcard({
  slug,
  stageName,
  realName,
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
  const design = identity?.frontDesigns[0];
  const style = {
    "--pc-primary": palette?.primary ?? accent,
    "--pc-secondary": palette?.secondary ?? accent,
    "--pc-surface": palette?.surface ?? "#111",
    "--pc-ink": palette?.ink ?? "#fff",
    "--pc-muted": palette?.mutedInk ?? "#aaa",
    "--pc-paper": identity?.paper.baseColor ?? "#f4efe4",
    fontFamily: identity?.typography.body.family,
  } as CSSProperties;

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
      <IdentityTexture archetype={archetype} accent={palette?.primary ?? accent} />
      <IdentityMasthead
        archetype={archetype}
        stageName={stageName}
        realName={realName}
        communityName={identity?.communityName ?? commName ?? "CORE"}
        label={ARCHETYPE_LABELS[archetype]}
        logo={logo}
        headline={design?.headline}
      />

      <div className={`relative z-10 grid grid-cols-1 ${archetype === "newspaper-front-page" ? "md:grid-cols-[1.15fr_.85fr]" : "md:grid-cols-[.92fr_1.08fr]"}`}>
        <section
          className={`flex min-h-[280px] flex-col p-6 md:p-8 ${
            archetype === "creator-trading-card"
              ? "border-b-[3px] border-[#111] md:border-b-0 md:border-r-[3px]"
              : archetype === "newspaper-front-page"
                ? "border-b-2 border-[#111] md:border-b-0 md:border-r-2"
                : archetype === "editorial-magazine"
                  ? "border-b border-white/20 md:border-b-0 md:border-r"
                  : archetype === "broadcast-freeze-frame"
                    ? "border-b border-cyan-200/25 md:border-b-0 md:border-r"
                    : "border-b border-dashed border-[#6f685f]/45 md:border-b-0 md:border-r"
          }`}
        >
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.22em] opacity-70">
            <Mail size={13} aria-hidden />
            {identity?.back.messageLabel ?? "A note from the community"}
          </div>
          <h3
            className={`mt-5 max-w-[17ch] text-balance leading-[.98] ${
              archetype === "editorial-magazine" ? "font-editorial-serif text-4xl italic" : "text-3xl font-black uppercase"
            }`}
            style={{ fontFamily: identity?.typography.display.family }}
          >
            Send {stageName} something worth keeping.
          </h3>
          <p className="mt-5 max-w-[48ch] text-sm leading-relaxed opacity-75">
            Letters, postcards, fan art, and packages are welcome. This is {stageName}&apos;s public fan-mail address—not a private location.
          </p>
          {identity ? (
            <p className="mt-5 border-l-[3px] pl-3 text-xs font-semibold leading-relaxed" style={{ borderColor: identity.palette.primary }}>
              {identity.copy.prompts[0]?.question}
            </p>
          ) : null}

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
              <p className="text-[9px] font-bold uppercase tracking-[.24em] opacity-55">Public mail destination</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-[.1em] opacity-80">
                {identity?.back.senderLabel ?? "CORE dispatch"}
              </p>
            </div>
            <CreatorSeal
              initial={initial}
              logo={logo}
              label={identity?.postage.stamp.label ?? commName ?? "CORE"}
              background={identity?.postage.stamp.background ?? accent}
              ink={identity?.postage.stamp.ink ?? "#fff"}
              archetype={archetype}
            />
          </div>

          <div className={`mt-7 ${archetype === "creator-trading-card" ? "rounded-xl border-2 border-[#111] bg-white/45 p-4" : ""}`}>
            <p className="mb-3 text-[9px] font-bold uppercase tracking-[.24em] opacity-55">Mail to</p>
            <div className="flex flex-col gap-2">
              {formatted.split("\n").map((line, index) => (
                <div
                  key={`${line}-${index}`}
                  className={`pb-1.5 ${
                    archetype === "broadcast-freeze-frame"
                      ? "border-b border-cyan-100/20 font-mono"
                      : archetype === "newspaper-front-page"
                        ? "border-b-2 border-[#111] font-serif"
                        : archetype === "editorial-magazine"
                          ? "border-b border-white/20 font-editorial-serif"
                          : archetype === "scrapbook-contact-sheet"
                            ? "border-b border-dashed border-[#6f685f]/55 font-mono"
                            : "border-b border-[#111]/35 font-mono"
                  }`}
                >
                  <p className="text-[13px] font-bold leading-snug tracking-[.04em]">{line}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto flex items-end justify-between gap-4 pt-5 text-[9px] font-bold uppercase tracking-[.18em] opacity-55">
            <span>{identity?.postage.postmark.topText ?? "CORE MAIL"}</span>
            <span>Creator seal · not postage</span>
          </div>
        </section>
      </div>
    </article>
  );
}

function IdentityMasthead({
  archetype,
  stageName,
  realName,
  communityName,
  label,
  logo,
  headline,
}: {
  archetype: PostcardArchetype;
  stageName: string;
  realName: string;
  communityName: string;
  label: string;
  logo?: string;
  headline?: string;
}) {
  const commonLogo = logo ? <img src={logo} alt="" className="size-10 object-contain" /> : null;

  if (archetype === "broadcast-freeze-frame") {
    return (
      <header className="relative z-10 flex items-center justify-between gap-4 border-b border-cyan-100/20 bg-[#0e161d] px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-[.18em]">
        <span className="inline-flex items-center gap-2"><i className="size-2 animate-pulse rounded-full bg-red-500" /> Signal // live</span>
        <strong className="text-base tracking-[.08em] text-cyan-300">{stageName}</strong>
        <span className="hidden sm:inline">00:23:{String((stageName.length * 7) % 60).padStart(2, "0")}</span>
      </header>
    );
  }

  if (archetype === "creator-trading-card") {
    return (
      <header className="relative z-10 grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b-[3px] border-[#111] bg-[#111] px-5 py-3 text-[#fbbf24]">
        {commonLogo}
        <div><p className="text-[9px] font-black uppercase tracking-[.22em]">{label}</p><strong className="text-xl font-black uppercase">{communityName}</strong></div>
        <span className="rounded-full border border-current px-3 py-1 font-mono text-[9px] font-bold uppercase">Cleared</span>
      </header>
    );
  }

  if (archetype === "newspaper-front-page") {
    return (
      <header className="relative z-10 border-b-[4px] border-double border-[#111] px-5 py-3 text-center">
        <div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-[.16em]"><span>{label}</span><span>CORE mail</span></div>
        <strong className="block font-serif text-4xl font-black uppercase leading-none tracking-[-.06em]">{communityName}</strong>
        <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-[.18em] text-red-600">{headline ?? `${stageName} community dispatch`}</p>
      </header>
    );
  }

  if (archetype === "editorial-magazine") {
    return (
      <header className="relative z-10 flex items-end justify-between gap-5 border-b border-white/20 px-6 py-5">
        <div><p className="text-[9px] font-bold uppercase tracking-[.28em] text-zinc-400">{label}</p><strong className="font-editorial-serif text-4xl italic leading-none">{communityName}</strong></div>
        <div className="text-right"><span className="block text-2xl font-black">{stageName}</span><span className="text-[9px] uppercase tracking-[.2em] text-zinc-500">{realName}</span></div>
      </header>
    );
  }

  return (
    <header className="relative z-10 mx-5 mt-4 flex -rotate-1 items-center gap-4 border border-[#6f685f]/35 bg-white/55 px-4 py-3 shadow-sm">
      <span className="inline-flex size-12 items-center justify-center rounded-sm bg-white shadow-sm">{commonLogo}</span>
      <div><p className="font-mono text-[9px] font-bold uppercase tracking-[.2em] text-red-600">{label}</p><strong className="font-serif text-2xl">{communityName} dispatch</strong></div>
    </header>
  );
}

function IdentityTexture({ archetype, accent }: { archetype: PostcardArchetype; accent: string }) {
  let texture: ReactNode;
  if (archetype === "broadcast-freeze-frame") {
    texture = <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent 0 3px,rgba(101,205,248,.22) 3px 4px)" }} />;
  } else if (archetype === "creator-trading-card") {
    texture = <div className="absolute -right-16 -top-16 size-56 rounded-full border-[22px] border-[#111]/15" />;
  } else if (archetype === "newspaper-front-page") {
    texture = <div className="absolute inset-0 opacity-[.14]" style={{ backgroundImage: "radial-gradient(#111 0.55px, transparent 0.65px)", backgroundSize: "4px 4px" }} />;
  } else if (archetype === "editorial-magazine") {
    texture = <div className="absolute -right-10 top-10 select-none font-serif text-[190px] font-black italic leading-none opacity-[.055]">M3</div>;
  } else {
    texture = <><span className="absolute -left-5 top-20 h-6 w-32 rotate-[-8deg] bg-red-500/30" /><div className="absolute inset-0 opacity-[.12]" style={{ backgroundImage: "linear-gradient(#6f685f 1px,transparent 1px)", backgroundSize: "100% 29px" }} /></>;
  }
  return <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ color: accent }}>{texture}</div>;
}

function CreatorSeal({
  initial,
  logo,
  label,
  background,
  ink,
  archetype,
}: {
  initial: string;
  logo?: string;
  label: string;
  background: string;
  ink: string;
  archetype: PostcardArchetype;
}) {
  return (
    <div
      className={`relative flex size-[82px] shrink-0 flex-col items-center justify-center border-2 p-2 text-center shadow-sm ${
        archetype === "creator-trading-card" ? "rounded-xl" : archetype === "scrapbook-contact-sheet" ? "-rotate-3 rounded-sm" : "rounded-sm"
      }`}
      style={{ background, color: ink, borderColor: ink }}
      aria-label={`${label} decorative creator seal`}
    >
      {logo ? <img src={logo} alt="" className="h-11 w-11 object-contain" /> : <strong className="text-3xl font-black">{initial}</strong>}
      <span className="mt-1 max-w-full truncate text-[7px] font-black uppercase tracking-[.08em]">Creator seal</span>
    </div>
  );
}

function formatAddress(poBox: PoBox): string {
  return [poBox.recipient, ...poBox.lines, `${poBox.city}, ${poBox.region} ${poBox.postalCode}`, poBox.country]
    .filter(Boolean)
    .join("\n");
}
