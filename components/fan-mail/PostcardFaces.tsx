"use client";
/* eslint-disable @next/next/no-img-element */

import type { CSSProperties, ReactNode } from "react";
import {
  createSeededPostcardVariation,
  designById,
  postcardIdentityFor,
  type PostcardArchetype,
  type PostcardIdentity,
  type SeededPostcardVariation,
} from "@/lib/postcard-identities";
import type { PostcardDraft } from "@/lib/postcard-draft";
import {
  postcardEffectStyleTokens,
  resolvePostcardScene,
  type PostcardScene,
  type PostcardScenePhoto,
} from "@/lib/postcard-scene";
import type { MailMember } from "@/lib/fan-mail";

export type PostcardFaceData = {
  recipient: MailMember;
  designId: string;
  imageDataUrl?: string | null;
  message?: string;
  senderName?: string;
  variationSeed?: string;
  /** Rich editor state. When present and valid it is authoritative for preview rendering. */
  draft?: PostcardDraft | null;
};

export function PostcardFrontFace(props: PostcardFaceData) {
  const resolved = resolveFace(props);
  if (!resolved) return null;
  const { identity } = resolved;

  switch (identity.archetype) {
    case "broadcast-freeze-frame":
      return <BroadcastFront {...resolved} />;
    case "creator-trading-card":
      return <TradingCardFront {...resolved} />;
    case "newspaper-front-page":
      return <NewspaperFront {...resolved} />;
    case "editorial-magazine":
      return <EditorialFront {...resolved} />;
    case "scrapbook-contact-sheet":
      return <ScrapbookFront {...resolved} />;
  }
}

export function PostcardBackFace(props: PostcardFaceData) {
  const resolved = resolveFace(props);
  if (!resolved) return null;
  const { identity, variation, scene } = resolved;
  const writing = scene?.writing;
  const rawMessage = writing ? writing.message : props.message;
  const body = rawMessage?.trim() || "Your message will appear here as you type…";
  const greeting = writing?.greeting.trim();
  const signoff = writing?.signoff.trim();
  const sender = writing
    ? writing.senderVisibility === "anonymous"
      ? "A CORE fan"
      : writing.senderVisibility === "handle" && writing.senderName.trim()
        ? `@${writing.senderName.trim().replace(/^@+/, "")}`
        : writing.senderName.trim()
    : props.senderName;
  const motif = motifMark(identity, variation.motifIds[0]);
  const namesAreVisible = !writing || writing.senderVisibility !== "anonymous";
  const groupSignerLine = writing && namesAreVisible ? formatGroupSigners(writing.groupSigners) : "";
  const hasExtendedWriting = Boolean(
    writing && (
      writing.secondaryMessage
      || writing.featuredQuote
      || writing.whyMomentMattered
      || (namesAreVisible && writing.signatureDataUrl)
      || groupSignerLine
    ),
  );

  return (
    <CardShell
      identity={identity}
      variation={variation}
      className={`postcard-back is-${identity.back.layout}`}
      style={backPaperStyle(identity, scene)}
      scene={scene}
    >
      <BackTexture identity={identity} variation={variation} />
      <div className="absolute inset-y-[7%] left-[6%] w-[34%] overflow-hidden pb-[13%]">
        <div className="flex items-center justify-between gap-2 border-b pb-2" style={{ borderColor: `${identity.palette.primary}66` }}>
          <span
            className="text-[clamp(7px,1.2vw,10px)] font-bold uppercase"
            style={fontStyle(identity.typography.accent)}
          >
            {identity.back.messageLabel}
            {writing?.purpose && writing.purpose !== "freeform" ? ` · ${writing.purpose.replace("-", " ")}` : ""}
          </span>
          <span
            aria-hidden
            className="text-[clamp(8px,1.5vw,12px)] font-bold"
            style={{ color: identity.palette.primary }}
          >
            {motif}
          </span>
        </div>
        <div
          className={`${hasExtendedWriting ? "mt-[3%] text-[clamp(6px,1.15vw,10px)]" : "mt-[6%] text-[clamp(9px,1.6vw,14px)]"} whitespace-pre-wrap break-words ${rawMessage?.trim() ? "" : "opacity-35"}`}
          style={{
            ...writingFontStyle(identity, writing?.lettering),
            color: identity.palette.ink,
            textAlign: writing?.alignment === "center"
              ? "center"
              : writing?.alignment === "left" || writing?.alignment === "letter"
                ? "left"
                : identity.back.messageAlignment,
          }}
        >
          {greeting ? <span className="mb-[4%] block font-bold">{greeting}</span> : null}
          <span>{body}</span>
          {signoff ? <span className="mt-[5%] block italic">{signoff}</span> : null}
        </div>
        {writing?.secondaryMessage ? (
          <div className="mt-[4%] border-t pt-[3%]" style={{ borderColor: `${identity.palette.primary}45` }}>
            <p className="text-[clamp(5px,.8vw,7px)] font-black uppercase tracking-[.14em] opacity-55">
              {writing.secondaryLanguageLabel ?? "Translation"}
            </p>
            <p
              className="mt-[1.5%] whitespace-pre-wrap break-words text-[clamp(5px,1vw,8px)] leading-[1.35]"
              style={writingFontStyle(identity, writing.lettering)}
            >
              {writing.secondaryMessage}
            </p>
          </div>
        ) : null}
        {writing?.featuredQuote ? (
          <blockquote
            className="mt-[4%] border-l-2 pl-[4%] text-[clamp(5px,.95vw,8px)] font-bold italic leading-[1.35]"
            style={{ borderColor: identity.palette.primary }}
          >
            “{writing.featuredQuote}”
          </blockquote>
        ) : null}
        {writing?.whyMomentMattered ? (
          <p className="mt-[3%] text-[clamp(5px,.85vw,7px)] leading-[1.35] opacity-70">
            <strong className="uppercase tracking-[.08em]">Why it mattered · </strong>
            {writing.whyMomentMattered}
          </p>
        ) : null}
        {sender ? (
          <p
            className={`${hasExtendedWriting ? "mt-[3%] text-[clamp(6px,1vw,9px)]" : "mt-[6%] text-[clamp(8px,1.4vw,12px)]"} italic opacity-70`}
            style={fontStyle(identity.typography.accent)}
          >
            — {sender}
          </p>
        ) : null}
        {groupSignerLine ? (
          <p className="mt-[2%] text-[clamp(5px,.85vw,7px)] leading-[1.3] opacity-65">
            {sender ? "Also signed by" : "From"} {groupSignerLine}
          </p>
        ) : null}
        {writing?.signatureDataUrl && namesAreVisible ? (
          <img
            src={writing.signatureDataUrl}
            alt={writing.savedSignatureLabel || "Sender signature"}
            width={160}
            height={48}
            decoding="async"
            className="mt-[2%] h-[clamp(16px,4vw,34px)] max-w-[72%] object-contain object-left"
          />
        ) : null}
        <CreatorSeal identity={identity} variation={variation} scene={scene} />
      </div>

      <div className="absolute right-[4.5%] top-[7%] w-[50%]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p
              className="text-[clamp(7px,1.1vw,9px)] font-bold uppercase tracking-[0.18em]"
              style={{ color: identity.palette.mutedInk }}
            >
              {identity.communityName} creator mail
            </p>
            <p
              className="mt-1 text-[clamp(9px,1.5vw,13px)] font-black uppercase"
              style={{ ...fontStyle(identity.typography.display), color: identity.palette.ink }}
            >
              For {identity.creatorName}
            </p>
            {writing?.requestedDeliveryLabel ? (
              <p
                className="mt-1 max-w-[28ch] text-[clamp(5px,.85vw,7px)] font-bold uppercase leading-tight tracking-[.08em]"
                data-mailing-date="true"
                style={{ color: identity.palette.primary }}
              >
                {writing.requestedDeliveryLabel}
              </p>
            ) : null}
            {writing?.contentNote ? (
              <p className="mt-1 max-w-[34ch] text-[clamp(5px,.78vw,7px)] leading-tight opacity-55">
                {writing.contentNote}
              </p>
            ) : null}
          </div>
          <DispatchMark identity={identity} variation={variation} />
        </div>
      </div>

      {/* Lob places the real address, barcode, and postage in this exact region. */}
      <div
        className="absolute bottom-[5.9%] right-[4.4%] flex h-[55.8%] w-[52.5%] items-end justify-end rounded-[4px] border border-dashed p-[4%] text-right"
        style={{ borderColor: `${identity.palette.mutedInk}66`, color: identity.palette.mutedInk }}
      >
        <div className="max-w-full text-[clamp(7px,1.25vw,10px)] leading-[1.45]">
          <span className="mb-2 block text-[.8em] font-bold uppercase tracking-[0.16em] opacity-60">
            USPS address + postage zone
          </span>
          <strong className="block text-[1.12em]" style={{ color: identity.palette.ink }}>
            {props.recipient.mailRecipient}
          </strong>
          {props.recipient.addressLines.map((line) => <span key={line} className="block">{line}</span>)}
        </div>
      </div>
    </CardShell>
  );
}

type ResolvedFace = {
  props: PostcardFaceData;
  identity: PostcardIdentity;
  design: PostcardIdentity["frontDesigns"][number];
  variation: SeededPostcardVariation;
  artSrc: string;
  scene: PostcardScene | null;
};

function resolveFace(props: PostcardFaceData): ResolvedFace | null {
  const scene = props.draft ? resolvePostcardScene(props.draft) : null;
  if (scene && scene.identity.slug === props.recipient.slug) {
    return {
      props,
      identity: scene.identity,
      design: scene.design,
      variation: scene.variation,
      artSrc: scene.photos[0]?.src || scene.identity.media.portrait,
      scene,
    };
  }
  const identity = postcardIdentityFor(props.recipient.slug);
  if (!identity) return null;
  const design = designById(props.designId, props.recipient.slug);
  const variation = createSeededPostcardVariation(
    identity,
    props.variationSeed || `${identity.slug}_preview`,
    design.id,
  );
  return { props, identity, design, variation, artSrc: props.imageDataUrl || identity.media.portrait, scene: null };
}

function DesignShell({ resolved, children }: { resolved: ResolvedFace; children: ReactNode }) {
  const { identity, design, variation, scene } = resolved;
  return (
    <CardShell
      identity={identity}
      variation={variation}
      design={design}
      style={{ background: design.background, color: design.ink }}
      scene={scene}
    >
      {children}
      <SceneMetadata scene={scene} />
      <MotifPair identity={identity} variation={variation} scene={scene} />
    </CardShell>
  );
}

function BroadcastFront(resolved: ResolvedFace) {
  switch (resolved.design.composition) {
    case "full-frame-alert":
      return <BroadcastAlert resolved={resolved} />;
    case "night-vision-monitor":
      return <BroadcastNightMonitor resolved={resolved} />;
    case "split-screen-recap":
      return <BroadcastReplay resolved={resolved} />;
    case "lower-third":
    default:
      return <BroadcastLowerThird resolved={resolved} />;
  }
}

function BroadcastLowerThird({ resolved }: { resolved: ResolvedFace }) {
  const { identity, design, variation, artSrc } = resolved;
  return (
    <DesignShell resolved={resolved}>
      <Photo src={artSrc} treatment={photoTreatment(design.imageTreatment)} variation={variation} objectPosition={cropPosition(variation, 0)} scenePhoto={resolved.scene?.photos[0]} />
      <div className="absolute inset-0" style={{ background: design.overlay }} />
      <BroadcastScanlines />
      <BroadcastBug label="REC" />
      <CommunityLogo identity={identity} className="right-[4%] top-[4%] h-[17%] w-[24%]" />
      <div className="absolute inset-x-[4%] bottom-[5%] border-l-[5px] bg-black/80 px-[4%] py-[3%]" style={{ borderColor: design.accent }}>
        <p className="text-[clamp(7px,1.1vw,9px)] font-bold uppercase tracking-[0.2em] opacity-70">CORE SIGNAL · CH 02 · {timecode(variation.seedHash)}</p>
        <p className="mt-1 text-[clamp(16px,4vw,34px)] font-black uppercase leading-[.92]" style={fontStyle(identity.typography.display)}>{design.headline}</p>
      </div>
    </DesignShell>
  );
}

function BroadcastAlert({ resolved }: { resolved: ResolvedFace }) {
  const { identity, design, variation, artSrc } = resolved;
  const score = 100 + (variation.seedHash % 900);
  return (
    <DesignShell resolved={resolved}>
      <div className="absolute bottom-[8%] right-[4%] top-[13%] w-[55%] overflow-hidden border-2" style={{ borderColor: design.accent }}>
        <Photo src={artSrc} treatment={photoTreatment(design.imageTreatment)} variation={variation} objectPosition={cropPosition(variation, 1)} scenePhoto={resolved.scene?.photos[0]} />
        <BroadcastScanlines />
      </div>
      <div className="absolute inset-y-0 left-0 w-[43%] bg-black/88 px-[5%] py-[6%] text-white">
        <BroadcastBug label="OVERTIME" />
        <p className="mt-[32%] text-[clamp(7px,1.2vw,10px)] font-bold uppercase tracking-[.22em]" style={{ color: design.accent }}>Live status alert</p>
        <p className="mt-2 text-[clamp(20px,5vw,44px)] font-black uppercase leading-[.82]" style={fontStyle(identity.typography.display)}>{design.headline}</p>
        <div className="mt-[10%] flex items-end gap-2 border-t border-white/25 pt-[5%]">
          <strong className="text-[clamp(18px,4vw,34px)] leading-none">{score}</strong>
          <span className="text-[clamp(6px,1vw,8px)] font-bold uppercase opacity-60">minutes<br />still live</span>
        </div>
      </div>
      <CommunityLogo identity={identity} className="right-[5%] top-[3%] h-[9%] w-[21%]" />
      <div className="absolute bottom-[2.5%] right-[4%] w-[55%] bg-[#e1122e] px-[3%] py-[1%] text-[clamp(7px,1.1vw,9px)] font-black uppercase tracking-[.18em] text-white">Breaking · Feed remains active</div>
    </DesignShell>
  );
}

function BroadcastNightMonitor({ resolved }: { resolved: ResolvedFace }) {
  const { identity, design, variation, artSrc } = resolved;
  return (
    <DesignShell resolved={resolved}>
      <div className="absolute inset-[5%] rounded-[2%] border-[clamp(3px,.8vw,7px)] border-[#244d35] bg-[#010604] shadow-[inset_0_0_24px_rgba(87,255,138,.16)]">
        <div className="absolute inset-[3%] overflow-hidden rounded-[1%] border border-[#57ff8a]/50">
          <Photo src={artSrc} treatment={photoTreatment(design.imageTreatment)} variation={variation} objectPosition={cropPosition(variation, 2)} scenePhoto={resolved.scene?.photos[0]} />
          <div className="absolute inset-0 bg-[#0dff64]/20 mix-blend-color" />
          <BroadcastScanlines />
          <span className="absolute left-[3%] top-[3%] font-mono text-[clamp(7px,1.2vw,10px)] font-bold text-[#b8ffc9]">CAM 02 · {timecode(variation.seedHash)}</span>
          <span className="absolute bottom-[3%] right-[3%] font-mono text-[clamp(6px,1vw,8px)] text-[#b8ffc9]">MOTION DETECTED</span>
          <CornerBrackets color={design.accent} />
        </div>
      </div>
      <CommunityLogo identity={identity} className="right-[7%] top-[7%] h-[12%] w-[20%]" />
      <div className="absolute bottom-[8%] left-[8%] max-w-[60%] bg-black/75 px-[3%] py-[2%] text-[#d8ffe4]">
        <p className="text-[clamp(13px,3.3vw,28px)] font-black uppercase leading-none" style={fontStyle(identity.typography.display)}>{design.headline}</p>
      </div>
    </DesignShell>
  );
}

function BroadcastReplay({ resolved }: { resolved: ResolvedFace }) {
  const { identity, design, variation, artSrc } = resolved;
  return (
    <DesignShell resolved={resolved}>
      <div className="absolute inset-x-[4%] top-[4%] flex h-[14%] items-center justify-between border-b border-white/30 bg-black/80 px-[3%] text-white">
        <span className="text-[clamp(12px,3vw,25px)] font-black uppercase" style={fontStyle(identity.typography.display)}>{design.headline}</span>
        <CommunityLogo identity={identity} placement="relative" className="h-[72%] w-[18%]" />
      </div>
      <div className="absolute inset-x-[4%] bottom-[5%] top-[20%] grid grid-cols-2 grid-rows-2 gap-[1.5%]">
        {Array.from({ length: design.photoSlots }, (_, index) => (
          <div key={index} className="relative overflow-hidden border border-white/40 bg-black">
            <Photo src={artSrc} treatment={photoTreatment(design.imageTreatment)} variation={variation} objectPosition={cropPosition(variation, index)} scenePhoto={resolved.scene?.photos[index]} />
            <BroadcastScanlines />
            <span className="absolute left-[3%] top-[3%] bg-black/70 px-1.5 py-0.5 font-mono text-[clamp(5px,.9vw,7px)] text-white">ANGLE {String(index + 1).padStart(2, "0")}</span>
            {index === variation.seedHash % design.photoSlots ? <span className="absolute bottom-[4%] right-[3%] bg-[#e1122e] px-1.5 py-0.5 text-[clamp(5px,.8vw,7px)] font-black text-white">HERO FRAME</span> : null}
          </div>
        ))}
      </div>
    </DesignShell>
  );
}

function TradingCardFront(resolved: ResolvedFace) {
  switch (resolved.design.composition) {
    case "stat-leader":
      return <TradingStatLeader resolved={resolved} />;
    case "quest-card":
      return <TradingQuest resolved={resolved} />;
    case "holographic-mvp":
      return <TradingHolo resolved={resolved} />;
    case "rookie-card":
    default:
      return <TradingRookie resolved={resolved} />;
  }
}

function TradingRookie({ resolved }: { resolved: ResolvedFace }) {
  const { identity, design, variation, artSrc } = resolved;
  const rating = 90 + (variation.seedHash % 10);
  return (
    <DesignShell resolved={resolved}>
      <div className="absolute inset-[4%] rounded-[5%] border-[clamp(3px,.7vw,6px)] bg-white/10" style={{ borderColor: design.accent }} />
      <div className="absolute inset-x-[18%] bottom-[12%] top-[9%] overflow-hidden rounded-t-[42%] border-[clamp(2px,.5vw,5px)] border-black/75 bg-black shadow-[0_8px_18px_rgba(0,0,0,.32)]">
        <Photo src={artSrc} treatment={photoTreatment(design.imageTreatment)} variation={variation} objectPosition={cropPosition(variation, 0)} scenePhoto={resolved.scene?.photos[0]} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-white/10" />
      </div>
      <div className="absolute left-[6%] top-[7%] grid size-[clamp(40px,9vw,72px)] place-items-center rounded-full border-2 border-black bg-white text-center text-black">
        <div><strong className="block text-[clamp(15px,3.5vw,28px)] leading-none">{rating}</strong><span className="text-[clamp(5px,.8vw,7px)] font-black uppercase">rookie</span></div>
      </div>
      <CommunityLogo identity={identity} className="right-[6%] top-[7%] h-[18%] w-[22%]" />
      <div className="absolute inset-x-[7%] bottom-[5%] -skew-x-6 border-2 border-black bg-black px-[4%] py-[2.4%] text-center text-white">
        <p className="skew-x-6 text-[clamp(14px,3.4vw,29px)] font-black uppercase leading-none" style={fontStyle(identity.typography.display)}>{design.headline}</p>
        <p className="mt-1 skew-x-6 text-[clamp(5px,.9vw,8px)] font-bold uppercase tracking-[.2em]">Player file · art {artworkCode(variation.seedHash)}</p>
      </div>
    </DesignShell>
  );
}

function TradingStatLeader({ resolved }: { resolved: ResolvedFace }) {
  const { identity, design, variation, artSrc } = resolved;
  const rating = 90 + (variation.seedHash % 10);
  return (
    <DesignShell resolved={resolved}>
      <div className="absolute inset-[4%] border-[clamp(2px,.5vw,5px)] bg-black/10" style={{ borderColor: design.accent }} />
      <div className="absolute bottom-[5%] left-[6%] top-[8%] w-[53%] overflow-hidden border-2 bg-black" style={{ borderColor: design.accent }}>
        <Photo src={artSrc} treatment={photoTreatment(design.imageTreatment)} variation={variation} objectPosition={cropPosition(variation, 1)} scenePhoto={resolved.scene?.photos[0]} />
        <div className="absolute inset-x-0 bottom-0 bg-black/80 px-[5%] py-[3%] text-white">
          <p className="text-[clamp(10px,2.3vw,20px)] font-black uppercase leading-none">{design.headline}</p>
        </div>
      </div>
      <div className="absolute right-[6%] top-[8%] w-[30%] text-right">
        <p className="text-[clamp(28px,8vw,66px)] font-black leading-none" style={fontStyle(identity.typography.numeric)}>{rating}</p>
        <p className="text-[clamp(6px,1vw,9px)] font-black uppercase tracking-widest">overall</p>
        <div className="mt-[12%] space-y-2 text-left text-[clamp(6px,1vw,9px)] font-bold uppercase">
          <Stat label="COLLAB" value={98} /><Stat label="CLUTCH" value={rating} /><Stat label="QUEST" value={96} /><Stat label="CHAOS" value={97} />
        </div>
      </div>
      <CommunityLogo identity={identity} className="bottom-[7%] right-[8%] h-[17%] w-[24%]" />
    </DesignShell>
  );
}

function TradingQuest({ resolved }: { resolved: ResolvedFace }) {
  const { identity, design, variation, artSrc } = resolved;
  return (
    <DesignShell resolved={resolved}>
      <div className="absolute inset-x-[5%] top-[5%] flex h-[17%] items-center justify-between border-b-2 px-[2%]" style={{ borderColor: design.accent }}>
        <div><p className="text-[clamp(5px,.9vw,8px)] font-bold uppercase tracking-[.2em] opacity-70">Side quest #{String(variation.seedHash % 100).padStart(2, "0")}</p><p className="text-[clamp(15px,3.5vw,30px)] font-black uppercase leading-none">{design.headline}</p></div>
        <CommunityLogo identity={identity} placement="relative" className="h-[75%] w-[18%]" />
      </div>
      <div className="absolute bottom-[9%] left-[5%] top-[25%] w-[57%] overflow-hidden rounded-lg border-2 border-white/60">
        <Photo src={artSrc} treatment={photoTreatment(design.imageTreatment)} variation={variation} objectPosition={cropPosition(variation, 0)} scenePhoto={resolved.scene?.photos[0]} />
        <span className="absolute bottom-[4%] left-[3%] rounded bg-black/75 px-2 py-1 text-[clamp(5px,.9vw,8px)] font-bold uppercase text-white">Primary objective</span>
      </div>
      <div className="absolute right-[5%] top-[25%] h-[31%] w-[30%] overflow-hidden rounded-lg border-2 border-white/60">
        <Photo src={artSrc} treatment={photoTreatment(design.imageTreatment)} variation={variation} objectPosition={cropPosition(variation, 1)} scenePhoto={resolved.scene?.photos[1]} />
      </div>
      <div className="absolute bottom-[9%] right-[5%] w-[30%] rounded-lg bg-black/80 p-[3%] text-white">
        <p className="text-[clamp(6px,1vw,9px)] font-black uppercase" style={{ color: design.accent }}>Quest cleared</p>
        <p className="mt-1 text-[clamp(6px,1vw,9px)] leading-tight opacity-75">Two scenes collected. Community XP secured.</p>
        <div className="mt-[8%] h-1.5 overflow-hidden rounded-full bg-white/20"><div className="h-full w-full" style={{ background: design.accent }} /></div>
        <p className="mt-1 text-right text-[clamp(5px,.8vw,7px)] font-bold">100%</p>
      </div>
    </DesignShell>
  );
}

function TradingHolo({ resolved }: { resolved: ResolvedFace }) {
  const { identity, design, variation, artSrc } = resolved;
  return (
    <DesignShell resolved={resolved}>
      <div className="absolute inset-[3%] overflow-hidden rounded-[7%] border-[clamp(3px,.8vw,7px)] border-white/75 bg-white/10">
        <div className="absolute inset-0 opacity-55" style={{ background: design.overlay }} />
        <div className="absolute bottom-[8%] left-[23%] top-[8%] w-[54%] overflow-hidden border-2 border-white/75 shadow-[0_0_22px_rgba(255,255,255,.45)]" style={{ clipPath: "polygon(18% 0,82% 0,100% 17%,92% 100%,8% 100%,0 17%)" }}>
          <Photo src={artSrc} treatment={photoTreatment(design.imageTreatment)} variation={variation} objectPosition={cropPosition(variation, 3)} scenePhoto={resolved.scene?.photos[0]} />
        </div>
        <div className="absolute left-[5%] top-[6%] rounded-full border border-black/60 bg-white/70 px-[2%] py-[1%] text-[clamp(6px,1vw,9px)] font-black uppercase text-black">Holo</div>
        <CommunityLogo identity={identity} className="right-[5%] top-[5%] h-[18%] w-[22%]" />
        <div className="absolute inset-x-[7%] bottom-[5%] bg-black/85 px-[4%] py-[2.5%] text-center text-white">
          <p className="text-[clamp(14px,3.4vw,29px)] font-black uppercase leading-none" style={fontStyle(identity.typography.display)}>{design.headline}</p>
          <p className="mt-1 text-[clamp(5px,.8vw,7px)] font-bold uppercase tracking-[.24em]">Prismatic print artwork · code {artworkCode(variation.seedHash)}</p>
        </div>
      </div>
    </DesignShell>
  );
}

function NewspaperFront(resolved: ResolvedFace) {
  switch (resolved.design.composition) {
    case "sports-extra":
      return <NewspaperSports resolved={resolved} />;
    case "classified-collage":
      return <NewspaperClassifieds resolved={resolved} />;
    case "late-edition-photo":
      return <NewspaperLateEdition resolved={resolved} />;
    case "banner-headline":
    default:
      return <NewspaperBanner resolved={resolved} />;
  }
}

function NewspaperBanner({ resolved }: { resolved: ResolvedFace }) {
  const { identity, design, variation, artSrc } = resolved;
  return (
    <DesignShell resolved={resolved}>
      <div className="absolute inset-[4%] border-y-4 border-double" style={{ borderColor: design.ink }}>
        <NewspaperMasthead identity={identity} variation={variation} compact={false} />
        <h2 className="line-clamp-2 h-[22%] border-b py-[1.5%] text-center text-[clamp(14px,3.8vw,32px)] font-black uppercase leading-[.9]" style={{ ...fontStyle(identity.typography.display), borderColor: design.ink }}>{design.headline}</h2>
        <div className="grid h-[56%] grid-cols-[1.5fr_.75fr] gap-[3%] pt-[2%]">
          <div className="relative overflow-hidden border border-black/50"><Photo src={artSrc} treatment={photoTreatment(design.imageTreatment)} variation={variation} objectPosition={cropPosition(variation, 0)} scenePhoto={resolved.scene?.photos[0]} /></div>
          <div className="flex flex-col text-[clamp(6px,1vw,9px)] leading-tight">
            <p className="font-black uppercase" style={{ color: design.accent }}>EXCLUSIVE</p>
            <p className="mt-1 font-bold">A community dispatch, printed before the timeline could refresh.</p>
            <div className="my-2 h-px bg-current opacity-30" />
            <p className="font-black uppercase">THE VERDICT</p>
            <p className="mt-1">One moment. One front page. No corrections after deadline.</p>
            <img src={identity.media.communityLogo} alt="" className="mt-auto h-[28%] w-full object-contain object-right" />
          </div>
        </div>
      </div>
    </DesignShell>
  );
}

function NewspaperSports({ resolved }: { resolved: ResolvedFace }) {
  const { identity, design, variation, artSrc } = resolved;
  const homeScore = 2 + (variation.seedHash % 6);
  const awayScore = variation.seedHash % 3;
  return (
    <DesignShell resolved={resolved}>
      <div className="absolute inset-[4%] border-y-4 border-double" style={{ borderColor: design.ink }}>
        <NewspaperMasthead identity={identity} variation={variation} compact />
        <div className="flex h-[20%] items-center justify-between border-b-2 px-[2%]" style={{ borderColor: design.ink }}>
          <div><p className="text-[clamp(6px,1vw,8px)] font-black uppercase" style={{ color: design.accent }}>Sports extra</p><h2 className="text-[clamp(13px,3vw,25px)] font-black uppercase leading-none">{design.headline}</h2></div>
          <div className="flex items-center gap-2 text-[clamp(20px,5vw,42px)] font-black leading-none"><span>{homeScore}</span><span className="text-[.45em] opacity-45">FINAL</span><span>{awayScore}</span></div>
        </div>
        <div className="grid h-[55%] grid-cols-[1.45fr_.75fr] gap-[2%] pt-[2%]">
          <div className="relative overflow-hidden border border-black/55"><Photo src={artSrc} treatment={photoTreatment(design.imageTreatment)} variation={variation} objectPosition={cropPosition(variation, 0)} scenePhoto={resolved.scene?.photos[0]} /><span className="absolute bottom-0 left-0 bg-black px-2 py-1 text-[clamp(5px,.8vw,7px)] font-bold uppercase text-white">The winning frame</span></div>
          <div className="grid grid-rows-[1fr_auto] gap-[5%]">
            <div className="relative overflow-hidden border border-black/55"><Photo src={artSrc} treatment={photoTreatment(design.imageTreatment)} variation={variation} objectPosition={cropPosition(variation, 1)} scenePhoto={resolved.scene?.photos[1]} /></div>
            <p className="border-t pt-1 text-[clamp(6px,1vw,8px)] font-bold leading-tight">Analysis: the final boss had no answer after halftime.</p>
          </div>
        </div>
      </div>
    </DesignShell>
  );
}

function NewspaperClassifieds({ resolved }: { resolved: ResolvedFace }) {
  const { identity, design, variation, artSrc } = resolved;
  const ads = ["WANTED", "FOR TRADE", "LATE FEES", "FOUND", "OPEN CALL", "ONE NIGHT ONLY"];
  return (
    <DesignShell resolved={resolved}>
      <div className="absolute inset-[4%] border-y-4 border-double" style={{ borderColor: design.ink }}>
        <NewspaperMasthead identity={identity} variation={variation} compact />
        <div className="flex h-[16%] items-center justify-between border-b-2" style={{ borderColor: design.ink }}>
          <h2 className="text-[clamp(14px,3.3vw,28px)] font-black uppercase leading-none">{design.headline}</h2>
          <span className="border-2 px-2 py-1 text-[clamp(5px,.9vw,8px)] font-black uppercase" style={{ borderColor: design.accent, color: design.accent }}>Six fresh listings</span>
        </div>
        <div className="grid h-[62%] grid-cols-3 grid-rows-2 gap-[1.3%] pt-[1.5%]">
          {Array.from({ length: design.photoSlots }, (_, index) => (
            <div key={index} className="relative overflow-hidden border border-black/45 bg-white/20 p-[3%]">
              <div className="relative h-[64%] overflow-hidden border border-black/35"><Photo src={artSrc} treatment={photoTreatment(design.imageTreatment)} variation={variation} objectPosition={cropPosition(variation, index)} scenePhoto={resolved.scene?.photos[index]} /></div>
              <p className="mt-[3%] text-[clamp(5px,.9vw,8px)] font-black uppercase" style={{ color: index % 2 ? design.ink : design.accent }}>{ads[index]}</p>
              <p className="line-clamp-1 text-[clamp(4px,.7vw,6px)] font-bold opacity-65">Community lore, lightly used.</p>
              {index === variation.seedHash % design.photoSlots ? <span className="absolute right-[3%] top-[3%] rotate-6 text-[clamp(8px,1.6vw,13px)] font-black" style={{ color: design.accent }}>✓</span> : null}
            </div>
          ))}
        </div>
      </div>
    </DesignShell>
  );
}

function NewspaperLateEdition({ resolved }: { resolved: ResolvedFace }) {
  const { identity, design, variation, artSrc } = resolved;
  return (
    <DesignShell resolved={resolved}>
      <div className="absolute inset-x-[4%] top-[4%] z-10 flex h-[14%] items-end justify-between border-y-4 border-double border-current pb-[1%]">
        <span className="text-[clamp(6px,1vw,8px)] font-bold uppercase">Late edition</span>
        <span className="text-[clamp(19px,4.8vw,40px)] font-black uppercase leading-none" style={fontStyle(identity.typography.display)}>THUGS NIGHT</span>
        <span className="text-[clamp(6px,1vw,8px)] font-bold uppercase">After deadline</span>
      </div>
      <div className="absolute inset-x-[4%] bottom-[5%] top-[20%] overflow-hidden border border-white/25">
        <Photo src={artSrc} treatment={photoTreatment(design.imageTreatment)} variation={variation} objectPosition={cropPosition(variation, 3)} scenePhoto={resolved.scene?.photos[0]} />
        <div className="absolute inset-0" style={{ background: design.overlay }} />
        <div className="absolute inset-x-0 bottom-0 bg-black/82 px-[4%] py-[3%] text-[#f2ead7]" style={{ clipPath: "polygon(0 12%,8% 0,18% 10%,29% 1%,42% 13%,55% 2%,69% 12%,82% 0,100% 9%,100% 100%,0 100%)" }}>
          <p className="text-[clamp(16px,4vw,34px)] font-black uppercase leading-[.88]" style={fontStyle(identity.typography.display)}>{design.headline}</p>
          <p className="mt-1 text-[clamp(5px,.9vw,8px)] font-bold uppercase tracking-[.18em]" style={{ color: design.accent }}>Photo desk exclusive · {timecode(variation.seedHash)}</p>
        </div>
      </div>
      <CommunityLogo identity={identity} className="right-[6%] top-[22%] h-[13%] w-[20%]" />
    </DesignShell>
  );
}

function EditorialFront(resolved: ResolvedFace) {
  switch (resolved.design.composition) {
    case "street-style-cover":
      return <EditorialStreet resolved={resolved} />;
    case "match-day-editorial":
      return <EditorialMatchDay resolved={resolved} />;
    case "noir-profile":
      return <EditorialNoir resolved={resolved} />;
    case "cover-story":
    default:
      return <EditorialCover resolved={resolved} />;
  }
}

function EditorialCover({ resolved }: { resolved: ResolvedFace }) {
  const { identity, design, variation, artSrc } = resolved;
  return (
    <DesignShell resolved={resolved}>
      <Photo src={artSrc} treatment={photoTreatment(design.imageTreatment)} variation={variation} objectPosition={cropPosition(variation, 0)} scenePhoto={resolved.scene?.photos[0]} />
      <div className="absolute inset-0" style={{ background: design.overlay }} />
      <CommunityLogo identity={identity} className="left-[4%] top-[4%] h-[24%] w-[27%] object-left" />
      <div className="absolute right-[4%] top-[5%] text-right text-[clamp(6px,1vw,9px)] font-semibold uppercase tracking-[0.18em]">
        <span className="block">M3 EDITION</span><span className="block">VOL. {String(variation.seedHash % 100).padStart(2, "0")}</span>
      </div>
      <div className="absolute bottom-[7%] left-[5%] max-w-[70%]">
        <p className="text-[clamp(8px,1.3vw,11px)] font-bold uppercase tracking-[.2em]" style={{ color: design.accent }}>Culture · motion · competition</p>
        <p className="mt-1 text-[clamp(20px,5.2vw,46px)] font-black uppercase leading-[.86]" style={fontStyle(identity.typography.display)}>{design.headline}</p>
      </div>
      <div className="absolute bottom-[6%] right-[4%] h-[28%] w-px" style={{ background: design.accent }} />
    </DesignShell>
  );
}

function EditorialStreet({ resolved }: { resolved: ResolvedFace }) {
  const { identity, design, variation, artSrc } = resolved;
  return (
    <DesignShell resolved={resolved}>
      <div className="absolute bottom-0 left-0 top-0 w-[64%] overflow-hidden">
        <Photo src={artSrc} treatment={photoTreatment(design.imageTreatment)} variation={variation} objectPosition={cropPosition(variation, 1)} scenePhoto={resolved.scene?.photos[0]} />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/20" />
      </div>
      <div className="absolute inset-y-0 right-0 w-[36%] bg-[#d9d7d0] px-[5%] py-[6%] text-[#101112]">
        <p className="text-[clamp(5px,.9vw,8px)] font-bold uppercase tracking-[.22em]">Location study · 003</p>
        <p className="mt-[20%] break-words text-[clamp(17px,4.2vw,36px)] font-black uppercase leading-[.82]" style={fontStyle(identity.typography.display)}>{design.headline}</p>
        <div className="absolute bottom-[7%] left-[14%] right-[14%] border-t border-black/30 pt-[5%] text-[clamp(5px,.9vw,8px)] leading-tight">
          <strong className="block uppercase">Subject: M3</strong>
          <span>Motion captured between destinations.</span>
        </div>
      </div>
      <div className="absolute left-[4%] top-[5%] [writing-mode:vertical-rl] text-[clamp(7px,1.2vw,10px)] font-bold uppercase tracking-[.26em] text-white">Street style / field no. {String(variation.seedHash % 99).padStart(2, "0")}</div>
      <CommunityLogo identity={identity} className="right-[5%] top-[5%] h-[17%] w-[24%]" />
    </DesignShell>
  );
}

function EditorialMatchDay({ resolved }: { resolved: ResolvedFace }) {
  const { identity, design, variation, artSrc } = resolved;
  const score = 1 + (variation.seedHash % 5);
  return (
    <DesignShell resolved={resolved}>
      <div className="absolute inset-x-[5%] top-[5%] flex h-[15%] items-start justify-between border-b-2 border-black/70 text-[#111]">
        <div><p className="text-[clamp(5px,.9vw,8px)] font-bold uppercase tracking-[.2em]">M3 Match Day</p><p className="text-[clamp(13px,3vw,25px)] font-black uppercase">{design.headline}</p></div>
        <div className="flex items-baseline gap-1"><strong className="text-[clamp(24px,6vw,50px)] leading-none">{score}</strong><span className="text-[clamp(7px,1vw,9px)] font-bold">—</span><strong className="text-[clamp(24px,6vw,50px)] leading-none">0</strong></div>
      </div>
      <div className="absolute bottom-[17%] left-[5%] top-[23%] w-[55%] overflow-hidden border border-black/45">
        <Photo src={artSrc} treatment={photoTreatment(design.imageTreatment)} variation={variation} objectPosition={cropPosition(variation, 0)} scenePhoto={resolved.scene?.photos[0]} />
      </div>
      <div className="absolute right-[5%] top-[23%] h-[31%] w-[33%] overflow-hidden border border-black/45">
        <Photo src={artSrc} treatment={photoTreatment(design.imageTreatment)} variation={variation} objectPosition={cropPosition(variation, 1)} scenePhoto={resolved.scene?.photos[1]} />
      </div>
      <div className="absolute bottom-[17%] right-[5%] w-[33%] border-l-2 pl-[3%] text-[#111]" style={{ borderColor: design.accent }}>
        <p className="text-[clamp(6px,1vw,9px)] font-black uppercase">Quiet analysis</p>
        <p className="mt-1 text-[clamp(5px,.85vw,7px)] leading-tight">Composure, movement, and the decisive frame.</p>
      </div>
      <div className="absolute inset-x-[5%] bottom-[5%] flex items-center justify-between border-t border-black/30 pt-[2%] text-[#111]">
        <p className="text-[clamp(5px,.8vw,7px)] font-bold uppercase tracking-[.18em]">Final whistle · Special edition</p>
        <CommunityLogo identity={identity} placement="relative" className="h-8 w-[16%]" />
      </div>
    </DesignShell>
  );
}

function EditorialNoir({ resolved }: { resolved: ResolvedFace }) {
  const { identity, design, variation, artSrc } = resolved;
  return (
    <DesignShell resolved={resolved}>
      <Photo src={artSrc} treatment={photoTreatment(design.imageTreatment)} variation={variation} objectPosition={cropPosition(variation, 4)} scenePhoto={resolved.scene?.photos[0]} />
      <div className="absolute inset-0" style={{ background: design.overlay }} />
      <div className="absolute inset-y-[5%] left-[4%] w-px" style={{ background: design.accent }} />
      <div className="absolute left-[7%] top-[6%]">
        <p className="text-[clamp(5px,.9vw,8px)] font-bold uppercase tracking-[.28em]" style={{ color: design.accent }}>M3 / Noir profile</p>
        <p className="mt-2 max-w-[48%] text-[clamp(20px,5vw,44px)] font-black uppercase leading-[.82] text-white" style={fontStyle(identity.typography.display)}>{design.headline}</p>
      </div>
      <div className="absolute bottom-[6%] right-[5%] max-w-[34%] border-t border-white/35 pt-[2%] text-right text-[clamp(5px,.9vw,8px)] uppercase tracking-[.16em] text-white/70">High contrast<br />Low noise<br />No. {String(variation.seedHash % 100).padStart(2, "0")}</div>
      <CommunityLogo identity={identity} className="bottom-[5%] left-[6%] h-[15%] w-[20%]" />
    </DesignShell>
  );
}

function ScrapbookFront(resolved: ResolvedFace) {
  switch (resolved.design.composition) {
    case "contact-sheet":
      return <ScrapbookContactSheet resolved={resolved} />;
    case "tour-notes":
      return <ScrapbookTourNotes resolved={resolved} />;
    case "archive-folder":
      return <ScrapbookArchive resolved={resolved} />;
    case "polaroid-stack":
    default:
      return <ScrapbookPolaroids resolved={resolved} />;
  }
}

function ScrapbookPolaroids({ resolved }: { resolved: ResolvedFace }) {
  const { identity, design, variation, artSrc } = resolved;
  const rotation = variation.artworkRotationDeg;
  return (
    <DesignShell resolved={resolved}>
      <div className="absolute inset-0 opacity-35" style={{ background: design.overlay }} />
      <ScrapPhoto src={artSrc} className="left-[8%] top-[14%] h-[60%] w-[43%]" rotate={rotation - 2.2} scenePhoto={resolved.scene?.photos[0]} />
      <ScrapPhoto src={artSrc} className="right-[9%] top-[9%] h-[38%] w-[30%]" rotate={rotation + 3.4} objectPosition="70% 30%" scenePhoto={resolved.scene?.photos[1]} />
      <ScrapPhoto src={artSrc} className="bottom-[8%] right-[16%] h-[35%] w-[32%]" rotate={rotation - 1.1} objectPosition="30% 70%" scenePhoto={resolved.scene?.photos[2]} />
      <span className="absolute left-[5%] top-[4%] -rotate-2 text-[clamp(8px,1.5vw,13px)] font-bold uppercase tracking-[.16em]" style={{ color: design.accent }}>FLOCK FIELD NOTES</span>
      <div className="absolute bottom-[6%] left-[5%] max-w-[48%] -rotate-1 bg-[#fffaf0] px-[3%] py-[2%] shadow-sm">
        <p className="text-[clamp(11px,2.6vw,23px)] font-black uppercase leading-none" style={fontStyle(identity.typography.display)}>{design.headline}</p>
        <p className="mt-1 text-[clamp(6px,1vw,9px)] font-bold uppercase opacity-60">Filed #{String(variation.seedHash % 10000).padStart(4, "0")}</p>
      </div>
      <img src={identity.media.communityLogo} alt="" className="absolute right-[3%] top-[52%] h-[19%] w-[24%] -rotate-6 object-contain" />
    </DesignShell>
  );
}

function ScrapbookContactSheet({ resolved }: { resolved: ResolvedFace }) {
  const { identity, design, variation, artSrc } = resolved;
  return (
    <DesignShell resolved={resolved}>
      <div className="absolute inset-[5%] bg-[#11100f] p-[3%] text-[#fffaf0] shadow-lg">
        <div className="flex h-[12%] items-center justify-between border-b border-white/25 pb-[1%]">
          <div><p className="text-[clamp(5px,.9vw,8px)] font-bold uppercase tracking-[.2em]">Flock contact sheet</p><p className="text-[clamp(10px,2.2vw,18px)] font-black uppercase">{design.headline}</p></div>
          <CommunityLogo identity={identity} placement="relative" className="h-full w-[17%]" />
        </div>
        <div className="mt-[2%] grid h-[75%] grid-cols-3 grid-rows-2 gap-[2%]">
          {Array.from({ length: design.photoSlots }, (_, index) => (
            <div key={index} className="relative overflow-hidden border border-white/35 bg-black">
              <Photo src={artSrc} treatment={photoTreatment(design.imageTreatment)} variation={variation} objectPosition={cropPosition(variation, index)} scenePhoto={resolved.scene?.photos[index]} />
              <span className="absolute bottom-[3%] left-[3%] bg-black/70 px-1 font-mono text-[clamp(4px,.7vw,6px)]">{String(index + 1).padStart(2, "0")} / {timecode(variation.seedHash + index * 97)}</span>
              {index === variation.seedHash % design.photoSlots ? <span className="absolute inset-[6%] rounded-[50%] border-[clamp(1px,.35vw,3px)]" style={{ borderColor: design.accent, transform: `rotate(${variation.artworkRotationDeg}deg)` }} /> : null}
            </div>
          ))}
        </div>
      </div>
    </DesignShell>
  );
}

function ScrapbookTourNotes({ resolved }: { resolved: ResolvedFace }) {
  const { identity, design, variation, artSrc } = resolved;
  const placements = [
    "left-[6%] top-[16%] h-[34%] w-[32%]",
    "right-[8%] top-[8%] h-[30%] w-[29%]",
    "bottom-[8%] left-[18%] h-[31%] w-[30%]",
    "bottom-[10%] right-[8%] h-[34%] w-[30%]",
  ];
  return (
    <DesignShell resolved={resolved}>
      <div className="absolute inset-0 opacity-50" style={{ background: design.overlay }} />
      <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 600 400" preserveAspectRatio="none">
        <path d="M85 86 C200 20 265 160 370 95 S490 160 520 285 C420 360 300 250 175 330" fill="none" stroke={design.accent} strokeWidth="3" strokeDasharray="9 7" opacity=".65" />
        <circle cx="85" cy="86" r="6" fill={design.accent} /><circle cx="520" cy="285" r="6" fill={design.accent} />
      </svg>
      {Array.from({ length: design.photoSlots }, (_, index) => (
        <ScrapPhoto
          key={index}
          src={artSrc}
          className={placements[index]!}
          rotate={variation.artworkRotationDeg + (index % 2 ? 2.4 : -1.8)}
          objectPosition={cropPosition(variation, index)}
          scenePhoto={resolved.scene?.photos[index]}
        />
      ))}
      <span className="absolute left-[5%] top-[4%] -rotate-2 text-[clamp(8px,1.5vw,13px)] font-bold uppercase tracking-[.16em]" style={{ color: design.accent }}>FLOCK TOUR NOTES</span>
      <div className="absolute left-[5%] top-[54%] max-w-[28%] -rotate-2 bg-[#fffaf0] px-[2.5%] py-[2%] shadow-sm">
        <p className="text-[clamp(8px,1.8vw,15px)] font-black uppercase leading-none">{design.headline}</p>
        <p className="mt-1 text-[clamp(4px,.75vw,6px)] font-bold uppercase opacity-60">Four stops · one field page</p>
      </div>
      <CommunityLogo identity={identity} className="left-[2%] bottom-[2%] h-[17%] w-[20%] -rotate-6" />
    </DesignShell>
  );
}

function ScrapbookArchive({ resolved }: { resolved: ResolvedFace }) {
  const { identity, design, variation, artSrc } = resolved;
  return (
    <DesignShell resolved={resolved}>
      <div className="absolute inset-[4%] border border-[#6d512d]/45 bg-[#d6b477] shadow-[0_8px_20px_rgba(53,36,18,.28)]">
        <div className="absolute -top-[6%] left-[3%] h-[9%] w-[30%] rounded-t-md bg-[#d6b477] px-[8%] pt-[1%] text-[clamp(5px,.8vw,7px)] font-black uppercase text-[#2a2118]">Flock files / 03</div>
        <div className="absolute inset-[3%] border border-[#76572e]/30 bg-[#caaa73]/45" />
        <ScrapPhoto src={artSrc} className="left-[6%] top-[9%] h-[70%] w-[48%]" rotate={variation.artworkRotationDeg - 1.2} objectPosition={cropPosition(variation, 0)} scenePhoto={resolved.scene?.photos[0]} />
        <ScrapPhoto src={artSrc} className="right-[8%] top-[12%] h-[34%] w-[30%]" rotate={variation.artworkRotationDeg + 2.6} objectPosition={cropPosition(variation, 1)} scenePhoto={resolved.scene?.photos[1]} />
        <ScrapPhoto src={artSrc} className="bottom-[9%] right-[13%] h-[34%] w-[31%]" rotate={variation.artworkRotationDeg - 2.1} objectPosition={cropPosition(variation, 2)} scenePhoto={resolved.scene?.photos[2]} />
        <div className="absolute bottom-[5%] left-[4%] max-w-[50%] -rotate-1 border-2 border-[#b3231d] bg-[#efe7d8] px-[3%] py-[2%] text-[#2a2118]">
          <p className="text-[clamp(9px,2vw,17px)] font-black uppercase leading-none">{design.headline}</p>
          <p className="mt-1 text-[clamp(4px,.75vw,6px)] font-bold uppercase tracking-[.15em]">Archive code {artworkCode(variation.seedHash)}</p>
        </div>
        <CommunityLogo identity={identity} className="right-[2%] bottom-[1%] h-[17%] w-[18%] -rotate-6" />
      </div>
    </DesignShell>
  );
}

type PhotoTreatment = "broadcast" | "card" | "newsprint" | "editorial" | "instant";

function photoTreatment(treatment: ResolvedFace["design"]["imageTreatment"]): PhotoTreatment {
  const treatments: Record<ResolvedFace["design"]["imageTreatment"], PhotoTreatment> = {
    "broadcast-crt": "broadcast",
    "score-card": "card",
    "halftone-newsprint": "newsprint",
    "editorial-duotone": "editorial",
    "instant-film": "instant",
  };
  return treatments[treatment];
}

function cropPosition(variation: SeededPostcardVariation, index: number): string {
  const crops = ["50% 34%", "30% 42%", "72% 38%", "46% 68%", "78% 66%", "24% 70%"];
  return crops[(variation.seedHash + index * 5) % crops.length]!;
}

function artworkCode(hash: number): string {
  return String(hash % 10000).padStart(4, "0");
}

function CommunityLogo({
  identity,
  className,
  placement = "absolute",
}: {
  identity: PostcardIdentity;
  className: string;
  placement?: "absolute" | "relative";
}) {
  return <img src={identity.media.communityLogo} alt="" className={`${placement} object-contain drop-shadow-[0_2px_5px_rgba(0,0,0,.65)] ${className}`} />;
}

function BroadcastScanlines() {
  return <div className="pointer-events-none absolute inset-0 opacity-30" style={{ background: "repeating-linear-gradient(0deg,transparent 0 3px,rgba(255,255,255,.12) 3px 4px)" }} />;
}

function BroadcastBug({ label }: { label: string }) {
  return (
    <div className="absolute left-[4%] top-[5%] flex items-center gap-2 rounded-sm bg-[#e1122e] px-[2.2%] py-[1%] text-[clamp(6px,1vw,9px)] font-black text-white">
      <span className="size-1.5 rounded-full bg-white" /> {label}
    </div>
  );
}

function CornerBrackets({ color }: { color: string }) {
  const base = "absolute size-[10%] border-current";
  return (
    <div className="pointer-events-none absolute inset-[5%]" style={{ color }}>
      <span className={`${base} left-0 top-0 border-l-2 border-t-2`} />
      <span className={`${base} right-0 top-0 border-r-2 border-t-2`} />
      <span className={`${base} bottom-0 left-0 border-b-2 border-l-2`} />
      <span className={`${base} bottom-0 right-0 border-b-2 border-r-2`} />
    </div>
  );
}

function NewspaperMasthead({
  identity,
  variation,
  compact,
}: {
  identity: PostcardIdentity;
  variation: SeededPostcardVariation;
  compact: boolean;
}) {
  return (
    <div className={`flex ${compact ? "h-[17%]" : "h-[18%]"} items-end justify-between border-b px-[1%] pb-[1%]`}>
      <span className="text-[clamp(5px,.9vw,8px)] font-bold uppercase">Late edition · Fan mail</span>
      <span className="text-[clamp(17px,4.5vw,38px)] font-black uppercase leading-none" style={fontStyle(identity.typography.display)}>THUGS DAILY</span>
      <span className="text-[clamp(5px,.9vw,8px)] font-bold uppercase">No. {String(variation.seedHash % 1000).padStart(3, "0")}</span>
    </div>
  );
}

function CardShell({
  identity,
  variation,
  design,
  scene,
  style,
  className = "",
  children,
}: {
  identity: PostcardIdentity;
  variation: SeededPostcardVariation;
  design?: ResolvedFace["design"];
  scene?: PostcardScene | null;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}) {
  const edge = scene?.visual.edge ?? variation.edgeTreatment;
  const distressedEdge = /deckled|rough|torn|thumbed|smudge|signal-tear|worn/.test(edge);
  const roundedEdge = edge === "rounded" || identity.paper.edge === "rounded";
  const texture = scene?.visual.textureBackground;
  const effectTokens = scene ? postcardEffectStyleTokens(scene) : null;
  const effects = scene?.visual.effects;
  return (
    <div
      className={`relative aspect-[3/2] w-full overflow-hidden rounded-[clamp(8px,2vw,18px)] shadow-[0_30px_60px_-25px_rgba(0,0,0,.55)] ring-1 ring-black/15 ${className}`}
      data-postcard-archetype={identity.archetype}
      data-postcard-layout={variation.layoutVariant}
      data-postcard-composition={design?.composition}
      data-photo-slots={design?.photoSlots}
      data-postcard-attachment={variation.attachmentStyle}
      data-postcard-edge={edge}
      data-postcard-registration-shift={variation.registrationShift ? "on" : "off"}
      data-postcard-draft={scene ? scene.draft.id : undefined}
      data-postcard-texture={scene?.visual.texture}
      data-postcard-frame={scene?.visual.frame}
      data-postcard-effect-grain={effects?.grainOpacity}
      data-postcard-effect-halftone={effects?.halftoneDotSizePx}
      data-postcard-effect-scanlines={effects?.scanlinePeriodPx}
      data-postcard-effect-signal={effects?.signalDistortionPx}
      data-postcard-effect-color-separation={effects?.colorSeparationPx}
      data-postcard-effect-ink-bleed={effects?.inkBleedPx}
      data-postcard-effect-registration={effects?.registrationOffsetPx}
      style={{
        color: identity.palette.ink,
        fontFamily: identity.typography.body.family,
        borderRadius: roundedEdge ? "clamp(14px,3vw,28px)" : distressedEdge ? "2px" : undefined,
        clipPath: scene?.visual.cardClipPath ?? (distressedEdge
          ? "polygon(0 .7%,2% 0,5% .55%,9% .1%,14% .65%,20% .15%,26% .75%,33% .2%,42% .7%,51% .1%,61% .65%,70% .2%,80% .75%,90% .1%,96% .65%,100% 0,99.4% 8%,100% 17%,99.35% 29%,100% 42%,99.35% 57%,100% 70%,99.4% 84%,100% 100%,94% 99.35%,86% 100%,74% 99.3%,63% 100%,51% 99.3%,39% 100%,27% 99.25%,15% 100%,6% 99.3%,0 100%,.65% 87%,0 74%,.6% 60%,0 48%,.65% 34%,0 20%,.55% 9%)"
          : undefined),
        border: scene?.visual.cardBorder ?? undefined,
        textShadow: effectTokens?.inkBleedShadow
          ?? (variation.inkBleedPx >= 0.2 ? `0 0 ${Math.max(.15, variation.inkBleedPx)}px currentColor` : undefined),
        ...style,
      }}
    >
      {children}
      <PostcardAttachmentMarks identity={identity} variation={variation} />
      <PostcardEdgeMarks identity={identity} variation={variation} scene={scene} />
      {variation.registrationShift ? (
        <RegistrationShift
          accent={design?.accent ?? identity.palette.primary}
          cyanTransform={effectTokens?.registrationCyanTransform ?? "translateX(1px)"}
          magentaTransform={effectTokens?.registrationMagentaTransform ?? "translateX(-1px)"}
        />
      ) : null}
      {texture ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 mix-blend-multiply"
          style={{
            backgroundImage: texture,
            backgroundSize: scene?.visual.textureBackgroundSize ?? undefined,
            opacity: scene?.visual.textureOpacity,
          }}
        />
      ) : null}
      {effectTokens?.halftoneBackground ? (
        <div
          aria-hidden
          data-postcard-effect-layer="halftone"
          className="pointer-events-none absolute inset-0 z-[22] mix-blend-multiply"
          style={{
            backgroundImage: effectTokens.halftoneBackground,
            backgroundSize: effectTokens.halftoneBackgroundSize ?? undefined,
            opacity: effects?.halftoneOpacity,
          }}
        />
      ) : null}
      {effectTokens?.scanlineBackground ? (
        <div
          aria-hidden
          data-postcard-effect-layer="scanlines"
          className="pointer-events-none absolute inset-0 z-[23] mix-blend-multiply"
          style={{ backgroundImage: effectTokens.scanlineBackground, opacity: effects?.scanlineOpacity }}
        />
      ) : null}
      {effectTokens?.signalBackground ? (
        <div
          aria-hidden
          data-postcard-effect-layer="signal-distortion"
          className="pointer-events-none absolute inset-0 z-[24] mix-blend-screen"
          style={{
            backgroundImage: effectTokens.signalBackground,
            opacity: effects?.signalDistortionOpacity,
            transform: effectTokens.signalTransform ?? undefined,
          }}
        />
      ) : null}
      {effectTokens?.colorSeparationBackground ? (
        <div
          aria-hidden
          data-postcard-effect-layer="color-separation"
          className="pointer-events-none absolute inset-0 z-[25] mix-blend-screen"
          style={{
            backgroundImage: effectTokens.colorSeparationBackground,
            boxShadow: effectTokens.colorSeparationShadow ?? undefined,
            opacity: effects?.colorSeparationOpacity,
          }}
        />
      ) : null}
      <div aria-hidden data-postcard-effect-layer="grain" className="pointer-events-none absolute inset-0 z-[21] mix-blend-multiply" style={{ opacity: variation.grainOpacity, backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.72' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E\")" }} />
    </div>
  );
}

function PostcardAttachmentMarks({ identity, variation }: { identity: PostcardIdentity; variation: SeededPostcardVariation }) {
  const treatment = variation.attachmentStyle;
  if (/tape/.test(treatment)) {
    return (
      <>
        <span aria-hidden className="pointer-events-none absolute -top-[1%] left-[18%] z-30 h-[8%] w-[23%] -rotate-3 bg-[#e7d39b]/70 shadow-sm mix-blend-screen" />
        <span aria-hidden className="pointer-events-none absolute -bottom-[1%] right-[14%] z-30 h-[7%] w-[20%] rotate-2 bg-[#e7d39b]/65 shadow-sm mix-blend-screen" />
      </>
    );
  }
  if (/corner|bracket/.test(treatment)) {
    const mark = "pointer-events-none absolute z-30 size-[9%] border-current opacity-70";
    return (
      <div aria-hidden className="absolute inset-[2.5%] z-30" style={{ color: identity.palette.highlight }}>
        <span className={`${mark} left-0 top-0 border-l-2 border-t-2`} />
        <span className={`${mark} right-0 top-0 border-r-2 border-t-2`} />
        <span className={`${mark} bottom-0 left-0 border-b-2 border-l-2`} />
        <span className={`${mark} bottom-0 right-0 border-b-2 border-r-2`} />
      </div>
    );
  }
  if (/staple|pin|clip/.test(treatment)) {
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute right-[7%] top-[3%] z-30 h-[9%] w-[2.2%] rotate-[14deg] rounded-full border-2 border-white/75 bg-black/20 shadow-sm"
      />
    );
  }
  if (/sleeve|mount|bound/.test(treatment)) {
    return <span aria-hidden className="pointer-events-none absolute inset-[2%] z-30 border-[clamp(2px,.45vw,4px)] border-white/35 shadow-[inset_0_0_18px_rgba(0,0,0,.28)]" />;
  }
  if (/crop|cut|proof/.test(treatment)) {
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-[2.2%] z-30 border border-dashed opacity-55"
        style={{ borderColor: identity.palette.highlight }}
      />
    );
  }
  return null;
}

function PostcardEdgeMarks({ identity, variation, scene }: { identity: PostcardIdentity; variation: SeededPostcardVariation; scene?: PostcardScene | null }) {
  const edge = scene?.visual.edge ?? variation.edgeTreatment;
  if (edge === "signal-tear") {
    return <span aria-hidden className="pointer-events-none absolute inset-x-0 top-[37%] z-30 h-[2.5%] -skew-x-12 opacity-50 mix-blend-screen" style={{ background: identity.palette.highlight }} />;
  }
  if (edge === "folded") {
    return <span aria-hidden className="pointer-events-none absolute right-0 top-0 z-30 size-[11%] bg-black/15 [clip-path:polygon(100%_0,0_0,100%_100%)]" />;
  }
  if (/smudge|thumbed|worn/.test(edge)) {
    return <span aria-hidden className="pointer-events-none absolute -bottom-[7%] -left-[3%] z-30 size-[24%] rounded-full bg-black/15 blur-md mix-blend-multiply" />;
  }
  if (/black-edge|black-keyline|inked/.test(edge)) {
    return <span aria-hidden className="pointer-events-none absolute inset-[1.4%] z-30 border-[clamp(2px,.55vw,5px)] border-black/80" />;
  }
  if (edge === "prismatic") {
    return <span aria-hidden className="pointer-events-none absolute inset-[1.3%] z-30 border-[clamp(2px,.55vw,5px)] border-white/60 shadow-[inset_0_0_16px_rgba(255,0,220,.28),0_0_12px_rgba(0,230,255,.3)]" />;
  }
  return null;
}

function RegistrationShift({
  accent,
  cyanTransform,
  magentaTransform,
}: {
  accent: string;
  cyanTransform: string;
  magentaTransform: string;
}) {
  return (
    <div aria-hidden data-postcard-effect-layer="registration" className="pointer-events-none absolute inset-[1.2%] z-30 opacity-30 mix-blend-screen">
      <span className="absolute inset-0 border" style={{ borderColor: "rgba(103,232,249,.8)", transform: cyanTransform }} />
      <span className="absolute inset-0 border" style={{ borderColor: "rgba(232,121,249,.8)", boxShadow: `0 0 5px ${accent}`, transform: magentaTransform }} />
    </div>
  );
}

function Photo({
  src,
  treatment,
  variation,
  objectPosition = "50% 50%",
  scenePhoto,
}: {
  src: string;
  treatment: PhotoTreatment;
  variation: SeededPostcardVariation;
  objectPosition?: string;
  scenePhoto?: PostcardScenePhoto;
}) {
  const filters: Record<PhotoTreatment, string> = {
    broadcast: "saturate(.88) contrast(1.12)",
    card: "saturate(1.08) contrast(1.05)",
    newsprint: "grayscale(.72) contrast(1.25)",
    editorial: "grayscale(.78) contrast(1.14)",
    instant: "saturate(.88) contrast(1.05) sepia(.08)",
  };
  if (!scenePhoto) {
    return <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ filter: filters[treatment], objectPosition, transform: `scale(${variation.imageScale})` }} />;
  }
  const actualSrc = scenePhoto.src || src;
  const clipPath = scenePhoto.clipPath ?? undefined;
  const borderStyle = photoBorderStyle(scenePhoto.border);
  return (
    <span
      className={`absolute inset-0 block ${scenePhoto.subjectOverlap ? "z-10 overflow-visible" : "overflow-hidden"}`}
      data-postcard-photo-slot={scenePhoto.id}
    >
      <img
        src={actualSrc}
        alt={scenePhoto.altText}
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          filter: `${filters[treatment]} ${scenePhoto.adjustmentFilter}`,
          objectPosition: scenePhoto.objectPosition,
          transform: scenePhoto.transform,
          clipPath,
        }}
      />
      {scenePhoto.duotone ? (
        <span
          aria-hidden
          data-postcard-effect-layer="duotone"
          className="pointer-events-none absolute inset-0 mix-blend-color"
          style={{
            background: `linear-gradient(135deg,${scenePhoto.duotone.shadow},${scenePhoto.duotone.highlight})`,
            clipPath,
            opacity: scenePhoto.duotone.strength,
          }}
        />
      ) : null}
      {borderStyle ? <span aria-hidden className="pointer-events-none absolute inset-0" style={{ ...borderStyle, clipPath }} /> : null}
      <PhotoAttachment photo={scenePhoto} />
      {scenePhoto.caption ? (
        <span className="absolute inset-x-[3%] bottom-[3%] z-20 bg-black/70 px-[3%] py-[1.5%] text-[clamp(5px,.9vw,8px)] font-bold leading-tight text-white">
          {scenePhoto.caption}
        </span>
      ) : null}
    </span>
  );
}

function ScrapPhoto({
  src,
  className,
  rotate,
  objectPosition = "50% 50%",
  scenePhoto,
}: {
  src: string;
  className: string;
  rotate: number;
  objectPosition?: string;
  scenePhoto?: PostcardScenePhoto;
}) {
  if (!scenePhoto) {
    return (
      <div className={`absolute bg-[#fffaf0] p-[1.5%] pb-[4%] shadow-[0_6px_14px_rgba(34,25,17,.28)] ${className}`} style={{ transform: `rotate(${rotate}deg)` }}>
        <img src={src} alt="" className="h-full w-full object-cover saturate-[.88] contrast-[1.05]" style={{ objectPosition }} />
        <span className="absolute -top-[6%] left-[36%] h-[13%] w-[30%] rotate-2 bg-[#dfc892]/70" />
      </div>
    );
  }
  const showTemplateTape = scenePhoto.attachment === "template";
  return (
    <div
      className={`absolute bg-[#fffaf0] p-[1.5%] pb-[4%] shadow-[0_6px_14px_rgba(34,25,17,.28)] ${className}`}
      data-postcard-photo-slot={scenePhoto.id}
      style={{ transform: `rotate(${rotate}deg)`, ...photoBorderStyle(scenePhoto.border) }}
    >
      <div className="relative h-full w-full overflow-hidden" style={{ clipPath: scenePhoto.clipPath ?? undefined }}>
        <img
          src={scenePhoto.src || src}
          alt={scenePhoto.altText}
          className="h-full w-full object-cover saturate-[.88] contrast-[1.05]"
          style={{
            filter: `saturate(.88) contrast(1.05) ${scenePhoto.adjustmentFilter}`,
            objectPosition: scenePhoto.objectPosition,
            transform: scenePhoto.transform,
          }}
        />
        {scenePhoto.duotone ? (
          <span
            aria-hidden
            data-postcard-effect-layer="duotone"
            className="pointer-events-none absolute inset-0 mix-blend-color"
            style={{
              background: `linear-gradient(135deg,${scenePhoto.duotone.shadow},${scenePhoto.duotone.highlight})`,
              opacity: scenePhoto.duotone.strength,
            }}
          />
        ) : null}
      </div>
      {showTemplateTape ? <span className="absolute -top-[6%] left-[36%] h-[13%] w-[30%] rotate-2 bg-[#dfc892]/70" /> : null}
      {!showTemplateTape ? <PhotoAttachment photo={scenePhoto} /> : null}
      {scenePhoto.caption ? <span className="absolute inset-x-[5%] bottom-[1%] truncate text-center text-[clamp(4px,.75vw,7px)] font-bold text-[#2a2118]">{scenePhoto.caption}</span> : null}
    </div>
  );
}

function photoBorderStyle(border: PostcardScenePhoto["border"]): CSSProperties | undefined {
  switch (border) {
    case "template":
      return undefined;
    case "none":
      return { border: "none", outline: "none", boxShadow: "none" };
    case "thin":
      return { border: "1px solid rgba(255,255,255,.82)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,.2)" };
    case "heavy":
      return { border: "clamp(3px,.65vw,6px) solid rgba(17,17,17,.9)" };
    case "neon":
      return { border: "2px solid #8ffcff", boxShadow: "inset 0 0 10px rgba(143,252,255,.7),0 0 10px rgba(255,73,214,.72)" };
    case "distressed":
      return { border: "2px dashed rgba(255,250,240,.82)", boxShadow: "inset 0 0 0 2px rgba(18,18,18,.36)" };
    case "double":
      return { border: "clamp(3px,.6vw,6px) double rgba(255,255,255,.88)" };
  }
}

function PhotoAttachment({ photo }: { photo: PostcardScenePhoto }) {
  switch (photo.attachment) {
    case "template":
    case "none":
      return null;
    case "tape":
      return <span aria-hidden className="pointer-events-none absolute -top-[2%] left-[34%] z-30 h-[10%] w-[32%] rotate-2 bg-[#e6cf93]/75 shadow-sm mix-blend-screen" />;
    case "staples":
      return (
        <>
          <span aria-hidden className="pointer-events-none absolute left-[8%] top-[3%] z-30 h-[8%] w-[2%] rotate-12 rounded-full border border-white/80 bg-black/25" />
          <span aria-hidden className="pointer-events-none absolute right-[8%] top-[3%] z-30 h-[8%] w-[2%] -rotate-12 rounded-full border border-white/80 bg-black/25" />
        </>
      );
    case "clips":
      return <span aria-hidden className="pointer-events-none absolute right-[7%] top-[-4%] z-30 h-[17%] w-[5%] rotate-[14deg] rounded-full border-2 border-white/80 bg-black/15 shadow-sm" />;
    case "brackets":
      return <CornerBrackets color="#ffffff" />;
    case "photo-corners":
      return (
        <span aria-hidden className="pointer-events-none absolute inset-[2%] z-30 border-[clamp(3px,.75vw,7px)] border-transparent [border-image:linear-gradient(135deg,rgba(255,255,255,.9)_0_12%,transparent_12%_88%,rgba(255,255,255,.9)_88%)_1]" />
      );
  }
}

function SceneMetadata({ scene }: { scene: PostcardScene | null }) {
  if (!scene) return null;
  const { fields } = scene;
  const tokens = [
    fields.issueNumber && `No. ${fields.issueNumber}`,
    fields.date,
    fields.score && `Score ${fields.score}`,
    fields.location,
    ...fields.stats.map((stat) => `${stat.label}: ${stat.value}`),
  ].filter(Boolean);
  const creatorFields = scene.creatorFields;
  if (!fields.caption.trim() && tokens.length === 0 && creatorFields.length === 0) return null;
  const badges = creatorFields.filter((field) => field.group === "badge");
  const headlines = creatorFields.filter((field) => field.group === "headline");
  const details = creatorFields.filter((field) => field.group === "detail");
  const notes = creatorFields.filter((field) => field.group === "note");
  const creatorPosition: Record<PostcardScene["draft"]["recipientSlug"], string> = {
    ron: "left-[3%] top-[3%] max-w-[48%] border-l-[3px]",
    jason: "right-[3%] bottom-[3%] max-w-[43%] border-r-[3px] text-right",
    lacy: "left-[3%] bottom-[3%] max-w-[52%] border-l-[3px]",
    marlon: "left-[3%] top-[3%] max-w-[42%] border-t-[3px]",
    adapt: "right-[3%] top-[3%] max-w-[48%] rotate-[-1deg] border-b-[3px]",
  };
  return (
    <>
      {fields.caption.trim() || tokens.length > 0 ? (
        <div className="pointer-events-none absolute right-[3%] top-[3%] z-40 max-w-[44%] bg-black/72 px-[2.5%] py-[1.6%] text-right text-white shadow-sm">
          {fields.caption.trim() ? <p className="text-[clamp(6px,1.05vw,9px)] font-bold leading-tight">{fields.caption}</p> : null}
          {tokens.length > 0 ? <p className="mt-0.5 text-[clamp(4px,.75vw,6px)] font-semibold uppercase tracking-[.1em] opacity-75">{tokens.join(" · ")}</p> : null}
        </div>
      ) : null}
      {creatorFields.length > 0 ? (
        <section
          data-creator-fields={scene.draft.recipientSlug}
          data-creator-design={scene.design.id}
          className={`pointer-events-none absolute z-50 border-current bg-black/80 px-[2.4%] py-[1.8%] text-white shadow-lg ${creatorPosition[scene.draft.recipientSlug]}`}
        >
          {badges.length > 0 ? (
            <div className="mb-[2%] flex flex-wrap gap-[3px]">
              {badges.map((field) => <span key={field.id} data-creator-field={field.id} className="border border-current/50 px-[3px] py-[1px] text-[clamp(4px,.68vw,6px)] font-black uppercase tracking-[.08em]">{field.value}</span>)}
            </div>
          ) : null}
          {headlines.map((field) => <strong key={field.id} data-creator-field={field.id} className="block text-[clamp(6px,1.1vw,10px)] font-black uppercase leading-[.95]">{field.value}</strong>)}
          {details.length > 0 ? (
            <dl className="mt-[3%] grid grid-cols-2 gap-x-[6px] gap-y-[2px] text-[clamp(4px,.7vw,6px)] leading-tight">
              {details.map((field) => <div key={field.id} data-creator-field={field.id}><dt className="uppercase opacity-60">{field.label}</dt><dd className="font-bold">{field.value}</dd></div>)}
            </dl>
          ) : null}
          {notes.map((field) => <p key={field.id} data-creator-field={field.id} className="mt-[3%] border-t border-current/30 pt-[2%] text-[clamp(4px,.72vw,6px)] italic leading-tight">{field.value}</p>)}
        </section>
      ) : null}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between gap-2 border-b border-current/25 pb-0.5"><span>{label}</span><strong>{value}</strong></div>;
}

function MotifPair({ identity, variation, scene }: { identity: PostcardIdentity; variation: SeededPostcardVariation; scene?: PostcardScene | null }) {
  const marks = (
    <>
      <span className="absolute left-[2.5%] top-[48%] -rotate-6 text-[clamp(7px,1.1vw,10px)] font-black uppercase opacity-70">{motifMark(identity, variation.motifIds[0])}</span>
      <span className="absolute right-[3%] top-[67%] rotate-6 text-[clamp(7px,1.1vw,10px)] font-black uppercase opacity-70">{motifMark(identity, variation.motifIds[1])}</span>
    </>
  );
  if (!scene?.visual.registrationTransform) return marks;
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 z-30 block" style={{ transform: scene.visual.registrationTransform }}>
      {marks}
    </span>
  );
}

function CreatorSeal({ identity, variation, scene }: { identity: PostcardIdentity; variation: SeededPostcardVariation; scene?: PostcardScene | null }) {
  if (scene && !scene.visual.stamp.visible) return null;
  const position = scene?.visual.stamp.position;
  const positionClass = position === "top-left"
    ? "top-[1%] left-0"
    : position === "top-right"
      ? "top-[1%] right-0"
      : position === "center-right"
        ? "right-0 top-[48%]"
        : position === "bottom-right"
          ? "bottom-[1%] right-0"
          : "bottom-[1%] left-0";
  return (
    <div
      className={`absolute inline-flex max-w-[92%] items-center gap-1.5 border-2 px-2 py-1 text-[clamp(6px,1vw,8px)] font-black uppercase tracking-[.12em] opacity-75 ${positionClass}`}
      style={{ borderColor: identity.postage.stamp.border, color: identity.postage.stamp.ink, background: identity.postage.stamp.background, transform: `rotate(${scene?.visual.stamp.rotationDeg ?? variation.stampRotationDeg}deg)` }}
    >
      <img src={identity.media.communityLogo} alt="" className="size-3 object-contain" />
      {identity.postage.stamp.label} · creator seal
    </div>
  );
}

function DispatchMark({ identity, variation }: { identity: PostcardIdentity; variation: SeededPostcardVariation }) {
  return (
    <div
      className="rounded-full border-2 px-3 py-2 text-center text-[clamp(5px,.9vw,8px)] font-black uppercase leading-tight opacity-55"
      style={{ borderColor: identity.palette.mutedInk, transform: `rotate(${variation.postmarkRotationDeg}deg)` }}
    >
      {identity.postage.postmark.topText}<br />CORE DISPATCH<br />#{String(variation.seedHash % 10000).padStart(4, "0")}
    </div>
  );
}

function BackTexture({ identity, variation }: { identity: PostcardIdentity; variation: SeededPostcardVariation }) {
  const backgrounds: Record<PostcardArchetype, string> = {
    "broadcast-freeze-frame": "repeating-linear-gradient(0deg,transparent 0 18px,rgba(46,170,232,.08) 18px 19px)",
    "creator-trading-card": "linear-gradient(rgba(17,17,17,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(17,17,17,.05) 1px,transparent 1px)",
    "newspaper-front-page": "repeating-linear-gradient(0deg,rgba(24,21,18,.022) 0 1px,transparent 1px 4px)",
    "editorial-magazine": "linear-gradient(110deg,transparent 0 67%,rgba(184,255,63,.08) 67% 68%,transparent 68%)",
    "scrapbook-contact-sheet": "repeating-linear-gradient(0deg,transparent 0 20px,rgba(38,77,133,.08) 20px 21px)",
  };
  return <div className="absolute inset-0" style={{ backgroundImage: backgrounds[identity.archetype], backgroundSize: identity.archetype === "creator-trading-card" ? "18px 18px" : undefined, opacity: .65 + variation.grainOpacity }} />;
}

function backPaperStyle(identity: PostcardIdentity, scene?: PostcardScene | null): CSSProperties {
  const paper = scene?.writing.paper ?? "template";
  const ink = scene?.identity.palette.ink ?? identity.palette.ink;
  const rule = `${ink}18`;
  const paperPatterns: Record<Exclude<PostcardScene["writing"]["paper"], "template" | "plain">, string> = {
    lined: `repeating-linear-gradient(0deg,transparent 0 23px,${rule} 23px 24px)`,
    notebook: `linear-gradient(90deg,transparent 0 11%,${identity.palette.primary}35 11% 11.5%,transparent 11.5%),repeating-linear-gradient(0deg,transparent 0 23px,${rule} 23px 24px)`,
    editorial: `linear-gradient(90deg,transparent 0 32%,${rule} 32% 32.5%,transparent 32.5% 67%,${rule} 67% 67.5%,transparent 67.5%)`,
    "stat-sheet": `linear-gradient(${rule} 1px,transparent 1px),linear-gradient(90deg,${rule} 1px,transparent 1px)`,
  };
  return {
    backgroundColor: identity.paper.baseColor,
    backgroundImage: paper === "template" || paper === "plain" ? undefined : paperPatterns[paper],
    backgroundSize: paper === "stat-sheet" ? "32px 24px" : undefined,
    color: ink,
    borderRadius: identity.paper.edge === "rounded" ? "clamp(12px,2.4vw,22px)" : undefined,
  };
}

function writingFontStyle(identity: PostcardIdentity, lettering: PostcardScene["writing"]["lettering"] | undefined): CSSProperties {
  switch (lettering) {
    case "handwritten":
      return { fontFamily: '"Segoe Print","Bradley Hand",cursive', fontWeight: 500, lineHeight: 1.55 };
    case "marker":
      return { fontFamily: '"Arial Rounded MT Bold",Impact,sans-serif', fontWeight: 800, letterSpacing: ".015em", lineHeight: 1.3 };
    case "ballpoint":
      return { fontFamily: '"Segoe Print","Bradley Hand",cursive', fontWeight: 400, fontStyle: "italic", lineHeight: 1.5 };
    case "label-maker":
      return { fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", fontWeight: 800, letterSpacing: ".08em", lineHeight: 1.55, textTransform: "uppercase" };
    case "typewriter":
      return { fontFamily: '"Courier New",Courier,monospace', fontWeight: 600, letterSpacing: ".025em", lineHeight: 1.5 };
    case "template":
    case undefined:
      return fontStyle(identity.typography.body);
  }
}

function formatGroupSigners(signers: readonly string[]): string {
  if (signers.length === 0) return "";
  if (signers.length === 1) return signers[0]!;
  if (signers.length === 2) return `${signers[0]} & ${signers[1]}`;
  return `${signers.slice(0, -1).join(", ")} & ${signers.at(-1)}`;
}

function motifMark(identity: PostcardIdentity, motifId: string) {
  return identity.motifs.find((motif) => motif.id === motifId)?.mark ?? "CORE";
}

function timecode(hash: number) {
  const hours = String(hash % 24).padStart(2, "0");
  const minutes = String(Math.floor(hash / 24) % 60).padStart(2, "0");
  const seconds = String(Math.floor(hash / 1440) % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function fontStyle(token: PostcardIdentity["typography"]["body"]): CSSProperties {
  return {
    fontFamily: token.family,
    fontWeight: token.weight,
    fontStyle: token.style,
    textTransform: token.transform,
    letterSpacing: `${token.letterSpacingEm}em`,
    lineHeight: token.lineHeight,
  };
}
