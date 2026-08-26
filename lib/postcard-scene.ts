/**
 * Client/server-safe resolution of rich postcard editor state into the small,
 * deterministic scene consumed by the React preview. This module performs no
 * I/O and never accepts arbitrary CSS: every emitted style is assembled from
 * schema-bounded numbers and an allow-listed visual vocabulary.
 */
import {
  PostcardDraftSchema,
  type PostcardDraft,
  type PostcardPhotoSlot,
} from "./postcard-draft";
import {
  createSeededPostcardVariation,
  postcardIdentityFor,
  type PostcardFrontDesign,
  type PostcardIdentity,
  type SeededPostcardVariation,
} from "./postcard-identities";
import {
  creatorFieldDefinitionsFor,
  type PostcardCreatorFieldGroup,
} from "./postcard-creator-fields";

export type PostcardScenePhoto = {
  id: string;
  position: number;
  src: string;
  altText: string;
  objectPosition: string;
  transform: string;
  adjustmentFilter: string;
  clipPath: string | null;
  border: PostcardPhotoSlot["border"];
  attachment: PostcardPhotoSlot["attachment"];
  caption: string;
  subjectOverlap: boolean;
  duotone: { shadow: string; highlight: string; strength: number } | null;
};

export type PostcardSceneWriting = PostcardDraft["writing"] & {
  /** Human-readable, catalog-owned labels assembled without locale-dependent output. */
  secondaryLanguageLabel: string | null;
  requestedDeliveryLabel: string | null;
  contentNote: string | null;
};
export type PostcardSceneFields = PostcardDraft["fields"];
export type PostcardSceneCreatorField = {
  id: string;
  label: string;
  value: string;
  group: PostcardCreatorFieldGroup;
};

/**
 * Bounded, renderer-neutral effect values. Both the React proof and the Lob
 * HTML renderer consume these numbers so an editor slider cannot silently
 * become a screen-only decoration.
 */
export type PostcardSceneEffects = {
  grainOpacity: number;
  halftoneDotSizePx: number;
  halftoneCellSizePx: number;
  halftoneOpacity: number;
  scanlinePeriodPx: number;
  scanlineThicknessPx: number;
  scanlineOpacity: number;
  signalDistortionPx: number;
  signalDistortionOpacity: number;
  colorSeparationPx: number;
  colorSeparationOpacity: number;
  inkBleedPx: number;
  registrationOffsetPx: number;
};

export type PostcardScene = {
  draft: PostcardDraft;
  identity: PostcardIdentity;
  design: PostcardFrontDesign;
  variation: SeededPostcardVariation;
  photos: readonly PostcardScenePhoto[];
  fields: PostcardSceneFields;
  creatorFields: readonly PostcardSceneCreatorField[];
  writing: PostcardSceneWriting;
  visual: {
    texture: PostcardDraft["visual"]["texture"];
    edge: Exclude<PostcardDraft["visual"]["edge"], "template"> | PostcardIdentity["paper"]["edge"];
    frame: PostcardDraft["visual"]["frame"];
    cardClipPath: string | null;
    cardBorder: string | null;
    textureBackground: string | null;
    textureBackgroundSize: string | null;
    textureOpacity: number;
    registrationTransform: string | null;
    effects: PostcardSceneEffects;
    stamp: PostcardDraft["visual"]["stamp"];
  };
};

export type PostcardEffectStyleTokens = {
  halftoneBackground: string | null;
  halftoneBackgroundSize: string | null;
  scanlineBackground: string | null;
  signalBackground: string | null;
  signalTransform: string | null;
  colorSeparationBackground: string | null;
  colorSeparationShadow: string | null;
  inkBleedShadow: string | null;
  registrationCyanTransform: string | null;
  registrationMagentaTransform: string | null;
};

/** Safe CSS tokens shared byte-for-byte by browser proof and physical HTML. */
export function postcardEffectStyleTokens(scene: PostcardScene): PostcardEffectStyleTokens {
  const effect = scene.visual.effects;
  const halftoneRadius = fixed(effect.halftoneDotSizePx, 2);
  const halftoneFade = fixed(effect.halftoneDotSizePx + 0.5, 2);
  const scanlineGap = fixed(Math.max(0, effect.scanlinePeriodPx - effect.scanlineThicknessPx), 2);
  const scanlinePeriod = fixed(effect.scanlinePeriodPx, 2);
  const signalShift = fixed(effect.signalDistortionPx, 2);
  const separation = fixed(effect.colorSeparationPx, 2);
  const registration = fixed(effect.registrationOffsetPx, 2);
  return {
    halftoneBackground: effect.halftoneDotSizePx > 0
      ? `radial-gradient(circle,${scene.design.ink} 0 ${halftoneRadius}px,transparent ${halftoneFade}px)`
      : null,
    halftoneBackgroundSize: effect.halftoneCellSizePx > 0
      ? `${fixed(effect.halftoneCellSizePx, 2)}px ${fixed(effect.halftoneCellSizePx, 2)}px`
      : null,
    scanlineBackground: effect.scanlinePeriodPx > 0
      ? `repeating-linear-gradient(0deg,transparent 0 ${scanlineGap}px,rgba(0,0,0,.72) ${scanlineGap}px ${scanlinePeriod}px)`
      : null,
    signalBackground: effect.signalDistortionPx > 0
      ? `repeating-linear-gradient(0deg,transparent 0 7%,${scene.design.accent} 7.2% 7.8%,transparent 8% 15%)`
      : null,
    signalTransform: effect.signalDistortionPx > 0
      ? `translateX(${signalShift}px) skewX(${fixed(effect.signalDistortionPx * 0.22, 2)}deg)`
      : null,
    colorSeparationBackground: effect.colorSeparationPx > 0
      ? "linear-gradient(90deg,rgba(0,235,255,.72),transparent 13%,transparent 87%,rgba(255,0,170,.72))"
      : null,
    colorSeparationShadow: effect.colorSeparationPx > 0
      ? `inset ${separation}px 0 rgba(0,235,255,.72),inset -${separation}px 0 rgba(255,0,170,.72)`
      : null,
    inkBleedShadow: effect.inkBleedPx >= 0.2
      ? `0 0 ${fixed(Math.max(0.15, effect.inkBleedPx), 2)}px currentColor`
      : null,
    registrationCyanTransform: effect.registrationOffsetPx > 0
      ? `translateX(${registration}px)`
      : null,
    registrationMagentaTransform: effect.registrationOffsetPx > 0
      ? `translateX(-${registration}px)`
      : null,
  };
}

const MASK_CLIP_PATHS: Readonly<Record<PostcardPhotoSlot["mask"], string | null>> = {
  template: null,
  rectangle: null,
  arch: "polygon(12% 100%,12% 31%,18% 16%,31% 6%,50% 2%,69% 6%,82% 16%,88% 31%,88% 100%)",
  shield: "polygon(50% 0,92% 13%,86% 72%,50% 100%,14% 72%,8% 13%)",
  ticket: "polygon(4% 0,96% 0,96% 12%,100% 18%,96% 24%,96% 76%,100% 82%,96% 88%,96% 100%,4% 100%,4% 88%,0 82%,4% 76%,4% 24%,0 18%,4% 12%)",
  circle: "circle(49% at 50% 50%)",
  monitor: "polygon(4% 0,96% 0,100% 7%,100% 93%,96% 100%,4% 100%,0 93%,0 7%)",
  "torn-paper": "polygon(0 3%,8% 0,16% 4%,25% 1%,35% 5%,46% 1%,57% 4%,68% 0,79% 4%,90% 1%,100% 4%,98% 96%,89% 100%,80% 96%,69% 99%,58% 95%,47% 100%,36% 96%,24% 99%,13% 95%,2% 98%)",
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function fixed(value: number, digits = 3): string {
  return Number(value.toFixed(digits)).toString();
}

function sceneSource(slot: PostcardPhotoSlot, fallback: string): string {
  const source = slot.asset?.source;
  if (!source) return fallback;
  switch (source.kind) {
    case "embedded":
      return source.dataUrl;
    case "managed":
      return source.previewUrl || fallback;
    case "core-moment":
      return source.imageUrl;
  }
}

function slotObjectPosition(slot: PostcardPhotoSlot): string {
  // Focal point is the direct-manipulation control. A non-default crop still
  // contributes to the resolved center, keeping imported crop rectangles useful.
  const cropCenterX = slot.crop.x + slot.crop.width / 2;
  const cropCenterY = slot.crop.y + slot.crop.height / 2;
  const focalIsDefault = slot.focalPoint.x === 0.5 && slot.focalPoint.y === 0.5;
  const x = focalIsDefault ? cropCenterX : slot.focalPoint.x;
  const y = focalIsDefault ? cropCenterY : slot.focalPoint.y;
  return `${fixed(clamp(x, 0, 1) * 100, 2)}% ${fixed(clamp(y, 0, 1) * 100, 2)}%`;
}

function slotTransform(slot: PostcardPhotoSlot): string {
  const cropScale = Math.max(1 / slot.crop.width, 1 / slot.crop.height);
  const scale = clamp(slot.zoom * cropScale, 1, 8);
  const flipX = slot.flipHorizontal ? -1 : 1;
  const flipY = slot.flipVertical ? -1 : 1;
  return `scale(${fixed(scale)}) rotate(${fixed(slot.rotationDeg, 2)}deg) scaleX(${flipX}) scaleY(${flipY})`;
}

function slotAdjustmentFilter(slot: PostcardPhotoSlot): string {
  const adjustment = slot.adjustments;
  const brightness = clamp(1 + adjustment.exposure * 0.45, 0.5, 1.5);
  const contrast = clamp(1 + adjustment.contrast * 0.5, 0.5, 1.5);
  const saturation = clamp(1 + adjustment.saturation * 0.65, 0.35, 1.75);
  const warmth = adjustment.warmth;
  const sepia = Math.max(0, warmth) * 0.28;
  const hue = warmth * -12;
  const strength = adjustment.filterId ? adjustment.filterStrength : 0;
  const filterContrast = 1 + strength * 0.12;
  return [
    `brightness(${fixed(brightness)})`,
    `contrast(${fixed(contrast * filterContrast)})`,
    `saturate(${fixed(saturation)})`,
    `sepia(${fixed(sepia)})`,
    `hue-rotate(${fixed(hue, 2)}deg)`,
  ].join(" ");
}

function resolvePhoto(slot: PostcardPhotoSlot, fallback: string): PostcardScenePhoto {
  return {
    id: slot.id,
    position: slot.position,
    src: sceneSource(slot, fallback),
    altText: slot.asset?.altText ?? "",
    objectPosition: slotObjectPosition(slot),
    transform: slotTransform(slot),
    adjustmentFilter: slotAdjustmentFilter(slot),
    clipPath: MASK_CLIP_PATHS[slot.mask],
    border: slot.border,
    attachment: slot.attachment,
    caption: slot.caption.trim(),
    subjectOverlap: slot.subjectOverlap,
    duotone: slot.adjustments.duotone
      ? {
          shadow: slot.adjustments.duotone.shadow,
          highlight: slot.adjustments.duotone.highlight,
          strength: slot.adjustments.filterStrength || 0.55,
        }
      : null,
  };
}

function resolveBackground(draft: PostcardDraft, design: PostcardFrontDesign): string {
  const background = draft.visual.background;
  const colors = background.colors;
  const angle = fixed(background.angleDeg, 2);
  switch (background.type) {
    case "template":
      return draft.visual.palette.background ?? design.background;
    case "solid":
      return colors[0]!;
    case "linear-gradient":
      return `linear-gradient(${angle}deg,${colors.join(",")})`;
    case "radial-gradient":
      return `radial-gradient(circle at 50% 45%,${colors.join(",")})`;
    case "striped":
      return `repeating-linear-gradient(${angle}deg,${colors[0]} 0 12px,${colors[1]} 12px 24px)`;
    case "grid":
      return `linear-gradient(${colors[1]}55 1px,transparent 1px),linear-gradient(90deg,${colors[1]}55 1px,${colors[0]} 1px)`;
    case "checker":
      return `conic-gradient(${colors[0]} 25%,${colors[1]} 0 50%,${colors[0]} 0 75%,${colors[1]} 0) 0 0/28px 28px`;
    case "starburst":
      return `repeating-conic-gradient(from ${angle}deg at 50% 50%,${colors[0]} 0deg 12deg,${colors[1]} 12deg 24deg)`;
  }
}

function textureBackground(texture: PostcardDraft["visual"]["texture"], color: string): string | null {
  switch (texture) {
    case "template":
    case "none":
    case "smooth":
      return null;
    case "grain":
      return "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.72' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E\")";
    // Halftone and CRT are resolved as bounded effect overlays below. Keeping
    // them out of this generic texture layer guarantees that their size and
    // density controls use identical CSS in preview and print.
    case "halftone":
    case "crt":
      return null;
    case "paper-fibers":
      return `repeating-linear-gradient(107deg,transparent 0 9px,${color}20 10px,transparent 11px 17px)`;
    case "newsprint":
      return `repeating-linear-gradient(0deg,${color}16 0 1px,transparent 1px 4px)`;
  }
}

function resolveEffects(draft: PostcardDraft, baseVariation: SeededPostcardVariation): PostcardSceneEffects {
  const effects = draft.visual.effects;
  const grain = clamp(effects.grain, 0, 1);
  const halftone = clamp(
    effects.halftoneDotSize > 0 ? effects.halftoneDotSize : draft.visual.texture === "halftone" ? 0.24 : 0,
    0,
    1,
  );
  const scanlines = clamp(
    effects.scanlineDensity > 0 ? effects.scanlineDensity : draft.visual.texture === "crt" ? 0.32 : 0,
    0,
    1,
  );
  const signal = clamp(effects.signalDistortion, 0, 1);
  const separation = clamp(effects.colorSeparation, 0, 1);
  const inkBleed = clamp(effects.inkBleed, 0, 1);
  const registration = clamp(effects.registrationOffset, 0, 1);

  return {
    // An explicit slider value overrides even a smooth/none texture choice;
    // texture selects the base stock while the effect control adds grain.
    grainOpacity: grain > 0
      ? fixedNumber(grain * 0.45, 3)
      : draft.visual.texture === "none" || draft.visual.texture === "smooth"
        ? 0
        : baseVariation.grainOpacity,
    halftoneDotSizePx: halftone > 0 ? fixedNumber(0.6 + halftone * 2.9, 2) : 0,
    halftoneCellSizePx: halftone > 0 ? fixedNumber(5 + halftone * 11, 2) : 0,
    halftoneOpacity: halftone > 0 ? fixedNumber(0.12 + halftone * 0.34, 3) : 0,
    // Greater density means a shorter period and slightly heavier scanline.
    scanlinePeriodPx: scanlines > 0 ? fixedNumber(11 - scanlines * 7, 2) : 0,
    scanlineThicknessPx: scanlines > 0 ? fixedNumber(0.55 + scanlines * 1.2, 2) : 0,
    scanlineOpacity: scanlines > 0 ? fixedNumber(0.1 + scanlines * 0.32, 3) : 0,
    signalDistortionPx: signal > 0 ? fixedNumber(signal * 7, 2) : 0,
    signalDistortionOpacity: signal > 0 ? fixedNumber(0.08 + signal * 0.34, 3) : 0,
    colorSeparationPx: separation > 0 ? fixedNumber(separation * 6, 2) : 0,
    colorSeparationOpacity: separation > 0 ? fixedNumber(0.12 + separation * 0.38, 3) : 0,
    inkBleedPx: inkBleed > 0
      ? fixedNumber(inkBleed * 2.5, 2)
      : baseVariation.inkBleedPx,
    registrationOffsetPx: registration > 0
      ? fixedNumber(registration * 1.8, 2)
      : baseVariation.registrationShift ? 1 : 0,
  };
}

function edgeClipPath(edge: PostcardScene["visual"]["edge"]): string | null {
  if (edge === "deckled" || edge === "worn") {
    return "polygon(0 2%,3% 0,9% 1.5%,16% .4%,24% 1.2%,31% 0,41% 1%,50% .2%,60% 1.4%,69% 0,79% 1.1%,88% .3%,97% 1.4%,100% 0,99% 18%,100% 35%,99% 52%,100% 70%,99% 88%,100% 100%,84% 99%,68% 100%,51% 99%,34% 100%,16% 99%,0 100%,1% 82%,0 65%,1% 48%,0 30%)";
  }
  return null;
}

function frameBorder(frame: PostcardDraft["visual"]["frame"], color: string): string | null {
  switch (frame) {
    case "template": return null;
    case "frameless": return "none";
    case "keyline": return `2px solid ${color}`;
    case "collector": return `clamp(4px,.8vw,8px) double ${color}`;
    case "full-bleed": return "none";
  }
}

const SECONDARY_LANGUAGE_LABELS: Readonly<Record<PostcardDraft["writing"]["secondaryLanguage"], string | null>> = {
  none: null,
  spanish: "Spanish",
  french: "French",
  portuguese: "Portuguese",
};

const CONTENT_WARNING_LABELS: Readonly<Record<PostcardDraft["writing"]["contentWarnings"][number], string>> = {
  grief: "grief",
  illness: "illness",
  loss: "loss",
  "mental-health": "mental health",
  violence: "violence",
  other: "sensitive content",
};

const UTC_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function requestedDeliveryLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return `Mailing date · ${UTC_MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function resolveWriting(writing: PostcardDraft["writing"]): PostcardSceneWriting {
  const groupSigners = writing.groupSigners
    .map((signer) => signer.trim())
    .filter((signer, index, signers) => signer.length > 0 && signers.indexOf(signer) === index);
  const contentWarnings = writing.contentWarnings.filter(
    (warning, index, warnings) => warnings.indexOf(warning) === index,
  );
  const secondaryMessage = writing.secondaryMessage.trim();
  const secondaryLanguageLabel = secondaryMessage
    ? SECONDARY_LANGUAGE_LABELS[writing.secondaryLanguage] ?? "Translation"
    : null;
  return {
    ...writing,
    groupSigners,
    contentWarnings,
    featuredQuote: writing.featuredQuote.trim(),
    whyMomentMattered: writing.whyMomentMattered.trim(),
    secondaryMessage,
    secondaryLanguageLabel,
    requestedDeliveryLabel: requestedDeliveryLabel(writing.scheduledFor),
    contentNote: contentWarnings.length > 0
      ? `Content note · ${contentWarnings.map((warning) => CONTENT_WARNING_LABELS[warning]).join(", ")}`
      : null,
  };
}

/** Resolve one validated draft into deterministic, render-ready scene data. */
export function resolvePostcardScene(value: PostcardDraft): PostcardScene | null {
  const parsed = PostcardDraftSchema.safeParse(value);
  if (!parsed.success) return null;
  const draft = parsed.data;
  // The schema already established the scoped design. Resolve it once more to
  // obtain the catalog objects used by existing render components.
  const identity = postcardIdentityFor(draft.recipientSlug);
  if (!identity) return null;
  const catalogDesign = identity.frontDesigns.find((candidate) => candidate.id === draft.designId);
  if (!catalogDesign) return null;

  const baseVariation = createSeededPostcardVariation(identity, draft.variationSeed, catalogDesign.id);
  const palette = {
    ...identity.palette,
    ...Object.fromEntries(
      Object.entries(draft.visual.palette)
        .filter(([key, color]) => key !== "sampleAccentFromSlotId" && typeof color === "string"),
    ),
  } as PostcardIdentity["palette"];
  const identityWithVisuals: PostcardIdentity = {
    ...identity,
    palette,
    paper: {
      ...identity.paper,
      edge: draft.visual.edge === "template" ? identity.paper.edge : draft.visual.edge,
    },
  };
  const validMotifs = draft.visual.motifIds.filter((id, index, ids) =>
    ids.indexOf(id) === index && identity.motifs.some((motif) => motif.id === id));
  const motifIds = [
    validMotifs[0] ?? baseVariation.motifIds[0],
    validMotifs[1] ?? baseVariation.motifIds[1],
  ] as const;
  const layoutVariant = draft.visual.layoutVariant
    && identity.variation.layoutVariants.includes(draft.visual.layoutVariant)
    ? draft.visual.layoutVariant
    : baseVariation.layoutVariant;
  const effects = resolveEffects(draft, baseVariation);
  const variation: SeededPostcardVariation = {
    ...baseVariation,
    motifIds,
    layoutVariant,
    stampRotationDeg: draft.visual.stamp.rotationDeg,
    grainOpacity: effects.grainOpacity,
    inkBleedPx: effects.inkBleedPx,
    registrationShift: effects.registrationOffsetPx > 0
      ? true
      : baseVariation.registrationShift,
  };
  const design: PostcardFrontDesign = {
    ...catalogDesign,
    background: resolveBackground(draft, catalogDesign),
    ink: draft.visual.palette.ink ?? palette.ink,
    accent: draft.visual.palette.primary ?? palette.primary,
    headline: draft.fields.headline.trim() || catalogDesign.headline,
  };
  const edge = draft.visual.edge === "template" ? identity.paper.edge : draft.visual.edge;
  const texture = draft.visual.texture;

  return {
    draft,
    identity: identityWithVisuals,
    design,
    variation,
    photos: Object.freeze(
      [...draft.photoSlots]
        .sort((left, right) => left.position - right.position)
        .map((slot) => resolvePhoto(slot, identity.media.portrait)),
    ),
    fields: draft.fields,
    creatorFields: Object.freeze(
      creatorFieldDefinitionsFor(draft.recipientSlug, draft.designId)
        .map((definition) => ({
          id: definition.id,
          label: definition.label,
          value: draft.creatorFields.values[definition.id]?.trim() ?? "",
          group: definition.group,
        }))
        .filter((field) => field.value.length > 0),
    ),
    writing: resolveWriting(draft.writing),
    visual: {
      texture,
      edge,
      frame: draft.visual.frame,
      cardClipPath: edgeClipPath(edge),
      cardBorder: frameBorder(draft.visual.frame, design.accent),
      textureBackground: textureBackground(texture, design.ink),
      textureBackgroundSize: texture === "grain" ? "80px 80px" : "auto",
      textureOpacity: texture === "none" ? 0 : clamp(0.18 + draft.visual.effects.grain * 0.5, 0.18, 0.68),
      registrationTransform: effects.registrationOffsetPx > 0
        ? `translate(${fixed(effects.registrationOffsetPx, 2)}px,${fixed(effects.registrationOffsetPx * -2 / 3, 2)}px)`
        : null,
      effects,
      stamp: draft.visual.stamp,
    },
  };
}

function fixedNumber(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}
