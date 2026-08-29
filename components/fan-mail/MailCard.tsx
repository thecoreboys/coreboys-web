import Image from "next/image";
import type { CSSProperties } from "react";
import { CopyAddress } from "./CopyAddress";
import { clipboardPayloadFor, type MailMember } from "@/lib/fan-mail";
import {
  postcardIdentityFor,
  type PostcardArchetype,
  type PostcardIdentity,
} from "@/lib/postcard-identities";

/**
 * A recipient-specific fan-mail card. The mailing address and actions remain
 * consistent, while each creator gets the visual language defined by the
 * postcard identity catalog. Decorative branding is presented as a creator
 * seal and is explicitly identified as non-postage.
 */
export function MailCard({ member }: { member: MailMember }) {
  const identity = postcardIdentityFor(member.slug);
  const payload = clipboardPayloadFor(member);

  if (!identity) {
    return <FallbackMailCard member={member} payload={payload} />;
  }

  const rotate = ROTATIONS[identity.slug] ?? 0;
  const edgeRadius = identity.paper.edge === "rounded" ? "24px" : identity.paper.edge === "clean" ? "5px" : "2px";

  return (
    <article
      id={member.slug}
      aria-label={`Send fan mail to ${member.displayName}`}
      data-postcard-archetype={identity.archetype}
      data-paper-stock={identity.paper.stock}
      className="paper-card group isolate w-full min-w-0 scroll-mt-32 overflow-hidden border md:scroll-mt-24"
      style={
        {
          "--paper-rotate": `${rotate}deg`,
          // The button system uses --paper as its inverse hover color. Match
          // the on-screen identity background so dark cards stay legible.
          "--paper": identity.palette.background,
          "--paper-ink": identity.palette.ink,
          "--paper-ink-dim": identity.palette.mutedInk,
          background: identity.palette.background,
          borderColor: `${identity.palette.primary}80`,
          borderRadius: edgeRadius,
          color: identity.palette.ink,
          fontFamily: identity.typography.body.family,
          padding: 0,
        } as CSSProperties
      }
    >
      <IdentityTexture identity={identity} />

      <div className="relative z-10 p-5 sm:p-7">
        <IdentityHero identity={identity} />

        <AddressPanel identity={identity} member={member} payload={payload} />
      </div>
    </article>
  );
}

function IdentityHero({ identity }: { identity: PostcardIdentity }) {
  const hero = identity.frontDesigns[0]!;

  if (identity.archetype === "broadcast-freeze-frame") {
    return (
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_176px] sm:items-stretch">
        <div className="flex min-h-44 flex-col justify-between border-l-4 pl-4" style={{ borderColor: identity.palette.secondary }}>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em]">
            <span className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-white" style={{ background: identity.palette.secondary }}>
              <span className="size-1.5 rounded-full bg-white" aria-hidden="true" /> Live fan-mail feed
            </span>
            <span style={{ color: identity.palette.highlight }}>{identity.motifs[1]?.mark}</span>
          </div>
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.24em]" style={{ color: identity.palette.mutedInk }}>
              Stable Network / Channel 02
            </p>
            <h2 style={fontStyle(identity.typography.display)} className="text-[42px] sm:text-[58px]">
              {identity.creatorName}
            </h2>
            <p className="mt-2 text-sm font-bold uppercase tracking-wide" style={{ color: identity.palette.highlight }}>
              {hero.headline}
            </p>
          </div>
        </div>
        <div className="relative min-h-44 overflow-hidden border-2 bg-black" style={{ borderColor: identity.palette.primary }}>
          <Image src={identity.media.portrait} alt={`${identity.creatorName} portrait`} fill sizes="176px" className="object-cover saturate-75" />
          <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent_0_3px,rgba(255,255,255,.08)_3px_4px)]" />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/85 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.16em] text-white">
            <span>CAM 02</span><span>REC ●</span>
          </div>
        </div>
        <CreatorSeal identity={identity} className="sm:col-span-2 sm:justify-self-end" />
      </div>
    );
  }

  if (identity.archetype === "creator-trading-card") {
    return (
      <div className="relative grid min-w-0 gap-6 border-4 border-black bg-[#fff300] p-4 shadow-[8px_8px_0_#111] sm:grid-cols-[152px_minmax(0,1fr)] sm:p-5">
        <div className="relative min-h-44 overflow-hidden rounded-xl border-4 border-black bg-white shadow-[4px_4px_0_#7657ff]">
          <Image src={identity.media.portrait} alt={`${identity.creatorName} portrait`} fill sizes="152px" className="object-cover" />
          <div className="absolute left-2 top-2 rounded-full border-2 border-black bg-white px-2 py-1 text-[9px] font-black uppercase">First edition</div>
        </div>
        <div className="min-w-0 flex flex-col justify-between text-black">
          <div className="flex items-start justify-between gap-3">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em]">NMS player card / 001</p>
            <span className="text-5xl font-black italic leading-none">99</span>
          </div>
          <div>
            <p className="mb-1 text-xs font-black uppercase tracking-[0.2em]" style={{ color: identity.palette.secondary }}>{identity.communityName}</p>
            <h2 style={fontStyle(identity.typography.display)} className="min-w-0 break-words [overflow-wrap:anywhere] text-[42px] sm:text-[54px]">{identity.creatorName}</h2>
            <p className="mt-2 inline-block -rotate-1 bg-black px-3 py-1.5 text-xs font-black uppercase tracking-wide text-white">{hero.headline}</p>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[9px] font-black uppercase">
            <span className="border-2 border-black bg-white py-1">Clutch 99</span>
            <span className="border-2 border-black bg-white py-1">XP +999</span>
            <span className="border-2 border-black bg-white py-1">Rare ★</span>
          </div>
        </div>
        <CreatorSeal identity={identity} className="sm:col-span-2 sm:justify-self-start" />
      </div>
    );
  }

  if (identity.archetype === "newspaper-front-page") {
    return (
      <div className="text-[#181512]">
        <div className="flex items-end justify-between border-y-4 border-double border-[#181512] py-2">
          <p className="font-serif text-3xl font-black uppercase tracking-[-0.06em] sm:text-5xl">Thugs Daily</p>
          <span className="bg-[#e7352b] px-2 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-white">Late edition</span>
        </div>
        <div className="grid gap-4 border-b-2 border-[#181512] py-4 sm:grid-cols-[minmax(0,1fr)_150px]">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em]">Exclusive / Fan-mail desk</p>
            <h2 style={fontStyle(identity.typography.display)} className="text-[44px] sm:text-[62px]">Mail desk open for {identity.creatorName}</h2>
            <p className="mt-2 max-w-xl font-serif text-sm leading-snug">{identity.concept}</p>
          </div>
          <div className="relative min-h-40 overflow-hidden border-2 border-[#181512] bg-[#ddd2bb]">
            <Image src={identity.media.portrait} alt={`${identity.creatorName} portrait`} fill sizes="150px" className="object-cover grayscale contrast-125" />
            <span className="absolute inset-x-0 bottom-0 bg-[#181512] px-2 py-1 text-center text-[8px] font-bold uppercase tracking-wider text-[#f2ead7]">Photo: Thugs archive</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="rotate-[-2deg] bg-[#e7352b] px-3 py-1 text-sm font-black uppercase text-white">Extra!</span>
          <CreatorSeal identity={identity} />
        </div>
      </div>
    );
  }

  if (identity.archetype === "editorial-magazine") {
    return (
      <div className="relative min-h-[260px] overflow-hidden border border-white/20 bg-[#101112] p-5 sm:p-7">
        <Image src={identity.media.portrait} alt={`${identity.creatorName} portrait`} fill sizes="(min-width: 640px) 420px, 100vw" className="object-cover object-[72%_28%] opacity-75 grayscale" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#101112_0%,rgba(16,17,18,.96)_34%,rgba(16,17,18,.18)_74%,rgba(16,17,18,.58)_100%)]" />
        <div className="relative flex min-h-[220px] max-w-full flex-col justify-between text-[#f8f6f1] sm:max-w-[62%]">
          <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-[0.26em]">
            <span>M3 / Volume 03</span><span style={{ color: identity.palette.highlight }}>Icon issue</span>
          </div>
          <div>
            <p className="mb-2 font-serif text-lg italic">The next cover belongs to</p>
            <h2 style={fontStyle(identity.typography.display)} className="text-[48px] sm:text-[68px]">{identity.creatorName}</h2>
            <p className="mt-3 border-l-2 pl-3 text-xs font-bold uppercase tracking-[0.16em]" style={{ borderColor: identity.palette.highlight }}>
              {hero.headline}
            </p>
          </div>
        </div>
        <CreatorSeal identity={identity} className="mt-5 sm:absolute sm:bottom-4 sm:right-4 sm:mt-0" />
      </div>
    );
  }

  return (
    <div className="relative grid gap-5 text-[#201b18] sm:grid-cols-[158px_1fr]">
      <div className="relative min-h-48 -rotate-3 bg-[#fffaf0] p-2 pb-8 shadow-[4px_5px_12px_rgba(55,41,25,.28)]">
        <div className="absolute -top-2 left-1/2 z-10 h-5 w-20 -translate-x-1/2 rotate-2 bg-[#e4d09f]/80" aria-hidden="true" />
        <div className="relative h-full min-h-36 overflow-hidden">
          <Image src={identity.media.portrait} alt={`${identity.creatorName} portrait`} fill sizes="158px" className="object-cover sepia-[.18]" />
        </div>
        <span className="absolute inset-x-2 bottom-2 text-center font-mono text-[8px] font-bold uppercase tracking-wider">Flock file / keeper</span>
      </div>
      <div className="relative rounded-sm border border-[#9d8d78] bg-[#fffaf0] p-5 shadow-[5px_5px_0_rgba(38,77,133,.18)]">
        <span className="absolute -right-2 -top-2 rotate-3 bg-[#ed2d25] px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white">Certified Unc</span>
        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#264d85]">Flock archives / filed 2014—</p>
        <h2 style={fontStyle(identity.typography.display)} className="mt-3 text-[46px] sm:text-[60px]">{identity.creatorName}</h2>
        <p className="mt-3 max-w-md text-lg" style={fontStyle(identity.typography.accent)}>{hero.headline}</p>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <span className="font-mono text-xs font-bold text-[#ed2d25]">★ ★ ★ &nbsp; FLOCK →</span>
          <CreatorSeal identity={identity} />
        </div>
      </div>
    </div>
  );
}

function CreatorSeal({ identity, className = "" }: { identity: PostcardIdentity; className?: string }) {
  const seal = identity.postage.stamp;
  return (
    <div
      role="img"
      aria-label={`${identity.communityName} creator seal, decorative only, not postage`}
      className={`inline-flex w-fit items-center gap-2 border-2 px-2.5 py-2 shadow-sm ${className}`}
      style={{ background: seal.background, borderColor: seal.border, color: seal.ink }}
    >
      <span className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-sm bg-black/90 p-0.5">
        <Image src={identity.media.communityLogo} alt="" width={28} height={28} className="size-7 object-contain" />
      </span>
      <span className="leading-none">
        <span className="block text-[8px] font-black uppercase tracking-[0.18em]">Creator seal · not postage</span>
        <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.08em]">{seal.label}</span>
      </span>
    </div>
  );
}

function AddressPanel({ identity, member, payload }: { identity: PostcardIdentity; member: MailMember; payload: string }) {
  return (
    <div
      className={`mt-7 ${ADDRESS_PANEL_CLASSES[identity.archetype]}`}
      style={{
        backgroundColor: identity.archetype === "broadcast-freeze-frame" ? `${identity.palette.surface}dd` : undefined,
        borderColor: identity.palette.primary,
        color: identity.palette.ink,
      }}
    >
      <p className="text-[9px] font-black uppercase tracking-[0.22em]" style={{ color: identity.palette.mutedInk }}>
        {DESTINATION_LABELS[identity.archetype]}
      </p>
      <p className="mt-2 text-[15px] font-semibold leading-relaxed" style={{ fontFamily: identity.typography.numeric.family }}>
        <span className="block">{member.mailRecipient}</span>
        {member.addressLines.map((line) => (
          <span key={line} className="block">{line}</span>
        ))}
      </p>
      {member.note ? (
        <p className="mt-3 max-w-[520px] text-[12px] italic leading-snug" style={{ color: identity.palette.mutedInk }}>
          {member.note}
        </p>
      ) : null}
      <div className="mt-5"><CopyAddress payload={payload} /></div>
    </div>
  );
}

function IdentityTexture({ identity }: { identity: PostcardIdentity }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10"
      style={{
        backgroundImage: TEXTURES[identity.archetype],
        opacity: identity.archetype === "newspaper-front-page" ? 0.3 : 0.55,
      }}
    />
  );
}

function FallbackMailCard({ member, payload }: { member: MailMember; payload: string }) {
  return (
    <article id={member.slug} aria-label={`Send fan mail to ${member.displayName}`} className="paper-card w-full min-w-0 scroll-mt-32 md:scroll-mt-24">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--paper-ink-dim)]">Fan-mail destination</p>
      <h2 className="mt-1 font-editorial-serif text-[40px] font-semibold text-[color:var(--paper-ink)] sm:text-[56px]">{member.displayName}</h2>
      <p className="address-block mt-6">
        <span className="block">{member.mailRecipient}</span>
        {member.addressLines.map((line) => <span key={line} className="block">{line}</span>)}
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <CopyAddress payload={payload} />
      </div>
    </article>
  );
}

function fontStyle(token: PostcardIdentity["typography"]["display"]): CSSProperties {
  return {
    fontFamily: token.family,
    fontWeight: token.weight,
    fontStyle: token.style,
    letterSpacing: `${token.letterSpacingEm}em`,
    lineHeight: token.lineHeight,
    textTransform: token.transform,
  };
}

const ROTATIONS: Record<string, number> = {
  ron: -0.35,
  jason: 0.5,
  lacy: -0.85,
  marlon: 0.15,
  adapt: -0.6,
};

const DESTINATION_LABELS: Record<PostcardArchetype, string> = {
  "broadcast-freeze-frame": "Transmission destination",
  "creator-trading-card": "Player delivery route",
  "newspaper-front-page": "Mailroom / delivery address",
  "editorial-magazine": "Contributor mailing details",
  "scrapbook-contact-sheet": "File this mail to",
};

const ADDRESS_PANEL_CLASSES: Record<PostcardArchetype, string> = {
  "broadcast-freeze-frame": "border border-l-4 p-4",
  "creator-trading-card": "border-4 bg-white/85 p-4 shadow-[5px_5px_0_#111]",
  "newspaper-front-page": "border-y-4 border-double bg-black/[.04] py-4",
  "editorial-magazine": "border-l-4 bg-white/10 p-5",
  "scrapbook-contact-sheet": "rotate-[.25deg] border bg-[#fffaf0] p-5 shadow-[4px_4px_0_rgba(38,77,133,.16)]",
};

const TEXTURES: Record<PostcardArchetype, string> = {
  "broadcast-freeze-frame": "repeating-linear-gradient(0deg,transparent 0 5px,rgba(255,255,255,.025) 5px 6px),linear-gradient(135deg,rgba(46,170,232,.12),transparent 42%,rgba(225,18,46,.08))",
  "creator-trading-card": "radial-gradient(circle at 12% 10%,rgba(255,255,255,.7),transparent 22%),repeating-linear-gradient(45deg,rgba(118,87,255,.08) 0 2px,transparent 2px 14px)",
  "newspaper-front-page": "repeating-linear-gradient(0deg,rgba(24,21,18,.055) 0 1px,transparent 1px 4px),radial-gradient(circle at 20% 30%,rgba(24,21,18,.08) 0 1px,transparent 1px)",
  "editorial-magazine": "linear-gradient(120deg,rgba(184,255,63,.045),transparent 32%),repeating-linear-gradient(90deg,rgba(255,255,255,.022) 0 1px,transparent 1px 28px)",
  "scrapbook-contact-sheet": "repeating-linear-gradient(0deg,transparent 0 23px,rgba(38,77,133,.09) 23px 24px),radial-gradient(circle at 85% 14%,rgba(242,182,66,.2),transparent 18%)",
};
