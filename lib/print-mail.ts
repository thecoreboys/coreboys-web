/**
 * Server-only Lob rendering and fulfilment.
 *
 * Destinations come only from trusted member data. Creative choices come
 * from the recipient-scoped identity catalog, and a persisted seed makes the
 * printed result deterministic.
 */
import { createHash } from "node:crypto";
import { MAIL_MEMBERS_BY_SLUG, type MailMember } from "./fan-mail";
import {
  createSeededPostcardVariation,
  POSTCARD_IDENTITY_CATALOG_VERSION,
  POSTCARD_VARIATION_ALGORITHM_VERSION,
  postcardIdentityFor,
  type PostcardFrontDesign,
  type PostcardIdentity,
  type SeededPostcardVariation,
} from "./postcard-identities";
import { resolvePostcardProviderMode, type PostcardProviderMode } from "./postcard-mode";
import { POSTCARD_RENDERER_VERSION } from "./postcard-render-version";
import {
  validatePostcardDraftBridge,
  validatePostcardSchedule,
  validatePostcardInput,
  type PostcardInput,
  type ReturnAddress,
} from "./postcard";
import { PostcardDraftSchema } from "./postcard-draft";
import {
  postcardEffectStyleTokens,
  resolvePostcardScene,
  type PostcardScene,
  type PostcardScenePhoto,
} from "./postcard-scene";

export const LOB_POSTCARD_CANVAS = Object.freeze({ widthIn: 6.25, heightIn: 4.25 });

/** Lob's reserved address + postage area for a landscape 4x6 postcard. */
export const LOB_POSTAL_CLEAR_ZONE = Object.freeze({
  leftIn: 2.6915,
  topIn: 1.625,
  widthIn: 3.2835,
  heightIn: 2.375,
});

export type FulfillResult = {
  provider: "lob";
  id: string;
  status: string;
  url?: string;
  /** True only when Lob can create physical mail. Test mode creates a proof. */
  live: boolean;
  mode: PostcardProviderMode;
};

type LobAddress = {
  name: string;
  address_line1: string;
  address_line2?: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  address_country: "US";
};

function parseCityStateZip(line: string): { city: string; state: string; zip: string } | null {
  const match = /^(.+?),\s*([A-Za-z]{2})\.?\s+(\d{5})(?:-\d{4})?$/.exec(line.trim());
  if (!match) return null;
  return { city: match[1]!.trim(), state: match[2]!.toUpperCase(), zip: match[3]! };
}

function destinationFor(member: MailMember): LobAddress | null {
  const line1 = member.addressLines[0];
  const cityStateZip = member.addressLines[1];
  if (!line1 || !cityStateZip) return null;
  const parsed = parseCityStateZip(cityStateZip);
  if (!parsed) return null;
  return {
    name: member.mailRecipient,
    address_line1: line1,
    address_city: parsed.city,
    address_state: parsed.state,
    address_zip: parsed.zip,
    address_country: "US",
  };
}

function suppliedReturnAddress(address: ReturnAddress | null | undefined): LobAddress | null {
  if (address?.line1 && address.city && address.state && address.zip) {
    return {
      name: address.name?.trim().slice(0, 60) || "CORE fan",
      address_line1: address.line1.trim(),
      address_line2: address.line2?.trim() || undefined,
      address_city: address.city.trim(),
      address_state: address.state.trim().toUpperCase(),
      address_zip: address.zip.trim(),
      address_country: "US",
    };
  }
  return null;
}

function configuredReturnAddress(): LobAddress | null {
  const name = process.env.LOB_RETURN_NAME?.trim();
  const line1 = process.env.LOB_RETURN_LINE1?.trim();
  const line2 = process.env.LOB_RETURN_LINE2?.trim();
  const city = process.env.LOB_RETURN_CITY?.trim();
  const state = process.env.LOB_RETURN_STATE?.trim().toUpperCase();
  const zip = process.env.LOB_RETURN_ZIP?.trim();
  if (!name || !line1 || !city || !state || !zip) return null;
  if ([name, line1, line2, city, state, zip].some((value) => value && /[\u0000-\u001f\u007f]/.test(value))) return null;
  if (name.length > 60 || line1.length > 100 || (line2?.length ?? 0) > 100 || city.length > 50) return null;
  if (!/^[A-Z]{2}$/.test(state) || !/^\d{5}(?:-\d{4})?$/.test(zip)) return null;
  return {
    name,
    address_line1: line1,
    address_line2: line2 || undefined,
    address_city: city,
    address_state: state,
    address_zip: zip,
    address_country: "US",
  };
}

/** Test/live checkout needs an authorized return address before charging. */
export function hasPostcardReturnAddress(address: ReturnAddress | null | undefined): boolean {
  return Boolean(suppliedReturnAddress(address) || configuredReturnAddress());
}

function returnAddressFor(address: ReturnAddress | null | undefined): LobAddress {
  const resolved = suppliedReturnAddress(address) || configuredReturnAddress();
  if (!resolved) throw new Error("A verified postcard return address is required.");
  return resolved;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}

function publicAssetUrl(path: string): string {
  if (!path.startsWith("/")) throw new Error("Postcard catalog assets must be root-relative.");
  return `https://media.thecoreboys.com${path}`;
}

function commonHead(identity: PostcardIdentity): string {
  return `<meta charset="utf-8"/><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${LOB_POSTCARD_CANVAS.widthIn}in;height:${LOB_POSTCARD_CANVAS.heightIn}in;overflow:hidden}
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    img{display:block}.card{position:relative;width:${LOB_POSTCARD_CANVAS.widthIn}in;height:${LOB_POSTCARD_CANVAS.heightIn}in;overflow:hidden}.logo{object-fit:contain}
    :root{--display:${identity.typography.print.displayFamily};--body:${identity.typography.print.bodyFamily};--accent:${identity.typography.print.accentFamily};--numeric:${identity.typography.print.numericFamily}}
  </style>`;
}

type RenderPostcardFrontDesign = Omit<PostcardFrontDesign, "print"> & {
  print: { background: string; ink: string; accent: string };
};

type FrontContext = {
  identity: PostcardIdentity;
  design: RenderPostcardFrontDesign;
  variation: SeededPostcardVariation;
  art: string;
  logo: string;
  motifMarks: readonly [string, string];
  scene: PostcardScene | null;
};

function draftFrameStyle(context: FrontContext): string {
  if (!context.scene) return "";
  const style = [`background:${context.design.background}`];
  if (context.scene.visual.cardClipPath) style.push(`clip-path:${context.scene.visual.cardClipPath}`);
  if (context.scene.visual.cardBorder) style.push(`border:${context.scene.visual.cardBorder}`);
  const inkBleed = postcardEffectStyleTokens(context.scene).inkBleedShadow;
  if (inkBleed) style.push(`text-shadow:${inkBleed}`);
  return style.join(";");
}

function draftTexture(context: FrontContext): string {
  const visual = context.scene?.visual;
  if (!visual?.textureBackground) return "";
  return `<span class="draft-texture" aria-hidden="true" style="background:${esc(visual.textureBackground)};${visual.textureBackgroundSize ? `background-size:${visual.textureBackgroundSize};` : ""}opacity:${visual.textureOpacity}"></span>`;
}

function draftEffectData(context: FrontContext): string {
  const effect = context.scene?.visual.effects;
  if (!effect) return "";
  return [
    ` data-postcard-effect-grain="${effect.grainOpacity}"`,
    ` data-postcard-effect-halftone="${effect.halftoneDotSizePx}"`,
    ` data-postcard-effect-scanlines="${effect.scanlinePeriodPx}"`,
    ` data-postcard-effect-signal="${effect.signalDistortionPx}"`,
    ` data-postcard-effect-color-separation="${effect.colorSeparationPx}"`,
    ` data-postcard-effect-ink-bleed="${effect.inkBleedPx}"`,
    ` data-postcard-effect-registration="${effect.registrationOffsetPx}"`,
  ].join("");
}

function draftEffectLayers(context: FrontContext): string {
  const scene = context.scene;
  if (!scene) return "";
  const effect = scene.visual.effects;
  const tokens = postcardEffectStyleTokens(scene);
  const layers: string[] = [];
  if (effect.grainOpacity > 0) {
    layers.push(`<span aria-hidden="true" data-postcard-effect-layer="grain" class="draft-effect draft-grain" style="opacity:${effect.grainOpacity}"></span>`);
  }
  if (tokens.halftoneBackground) {
    layers.push(`<span aria-hidden="true" data-postcard-effect-layer="halftone" class="draft-effect draft-halftone" style="background-image:${tokens.halftoneBackground};background-size:${tokens.halftoneBackgroundSize};opacity:${effect.halftoneOpacity}"></span>`);
  }
  if (tokens.scanlineBackground) {
    layers.push(`<span aria-hidden="true" data-postcard-effect-layer="scanlines" class="draft-effect draft-scanlines" style="background-image:${tokens.scanlineBackground};opacity:${effect.scanlineOpacity}"></span>`);
  }
  if (tokens.signalBackground) {
    layers.push(`<span aria-hidden="true" data-postcard-effect-layer="signal-distortion" class="draft-effect draft-signal" style="background-image:${tokens.signalBackground};opacity:${effect.signalDistortionOpacity};transform:${tokens.signalTransform}"></span>`);
  }
  if (tokens.colorSeparationBackground) {
    layers.push(`<span aria-hidden="true" data-postcard-effect-layer="color-separation" class="draft-effect draft-color-separation" style="background-image:${tokens.colorSeparationBackground};box-shadow:${tokens.colorSeparationShadow};opacity:${effect.colorSeparationOpacity}"></span>`);
  }
  if (tokens.registrationCyanTransform && tokens.registrationMagentaTransform) {
    layers.push(`<span aria-hidden="true" data-postcard-effect-layer="registration" class="draft-effect draft-registration"><i style="border-color:rgba(103,232,249,.8);transform:${tokens.registrationCyanTransform}"></i><i style="border-color:rgba(232,121,249,.8);box-shadow:0 0 5px ${context.design.accent};transform:${tokens.registrationMagentaTransform}"></i></span>`);
  }
  return layers.join("");
}

function draftFieldOverlay(context: FrontContext): string {
  if (!context.scene) return "";
  const fields = context.scene.fields;
  const primary = [fields.caption, fields.issueNumber, fields.date, fields.score, fields.location]
    .map((value) => value.trim())
    .filter(Boolean);
  const stats = fields.stats
    .map((stat) => `${stat.label.trim()}: ${stat.value.trim()}`.trim())
    .filter((value) => value !== ":");
  const items = [...primary, ...stats];
  if (items.length === 0) return "";
  return `<aside class="draft-fields">${items.map((item) => `<span>${esc(item)}</span>`).join("")}</aside>`;
}

function draftCreatorFieldOverlay(context: FrontContext): string {
  const scene = context.scene;
  if (!scene || scene.creatorFields.length === 0) return "";
  const fieldsFor = (group: "badge" | "headline" | "detail" | "note") =>
    scene.creatorFields.filter((field) => field.group === group);
  const badges = fieldsFor("badge");
  const headlines = fieldsFor("headline");
  const details = fieldsFor("detail");
  const notes = fieldsFor("note");
  return `<aside class="creator-fields creator-fields-${scene.draft.recipientSlug}" data-creator-fields="${scene.draft.recipientSlug}" data-creator-design="${esc(scene.design.id)}">
    ${badges.length ? `<div class="creator-badges">${badges.map((field) => `<span data-creator-field="${esc(field.id)}">${esc(field.value)}</span>`).join("")}</div>` : ""}
    ${headlines.map((field) => `<strong data-creator-field="${esc(field.id)}">${esc(field.value)}</strong>`).join("")}
    ${details.length ? `<dl>${details.map((field) => `<div data-creator-field="${esc(field.id)}"><dt>${esc(field.label)}</dt><dd>${esc(field.value)}</dd></div>`).join("")}</dl>` : ""}
    ${notes.map((field) => `<p data-creator-field="${esc(field.id)}">${esc(field.value)}</p>`).join("")}
  </aside>`;
}

function frontDocument(
  context: FrontContext,
  body: string,
  css: string,
): string {
  const { identity, design, variation, motifMarks } = context;
  return `<!DOCTYPE html><html><head>${commonHead(identity)}<style>${css}
    figure{position:relative}.motif-mark{position:absolute;z-index:20;font:900 6.5pt var(--display);text-transform:uppercase;opacity:.7}.motif-left{left:2.5%;top:48%;transform:rotate(-6deg)}.motif-right{right:3%;top:67%;transform:rotate(6deg)}
    .draft-texture{position:absolute;inset:0;z-index:20;pointer-events:none;background-size:auto;mix-blend-mode:multiply}.draft-effect{position:absolute;inset:0;pointer-events:none}.draft-grain{z-index:21;mix-blend-mode:multiply;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.72' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E")}.draft-halftone,.draft-scanlines{mix-blend-mode:multiply}.draft-halftone{z-index:22}.draft-scanlines{z-index:23}.draft-signal,.draft-color-separation{mix-blend-mode:screen}.draft-signal{z-index:24}.draft-color-separation{z-index:25}.draft-registration{z-index:30;inset:1.2%;opacity:.3;mix-blend-mode:screen}.draft-registration i{position:absolute;inset:0;border:1px solid}.draft-duotone{position:absolute;inset:0;z-index:10;pointer-events:none;mix-blend-mode:color}.draft-fields{position:absolute;z-index:48;left:3%;right:3%;bottom:2%;display:flex;gap:.045in;align-items:flex-end;flex-wrap:wrap;pointer-events:none}.draft-fields span,.draft-photo-caption{background:rgba(8,8,8,.84);color:#fff;padding:.035in .065in;font:700 5.5pt/1.1 var(--body);letter-spacing:.03em}.draft-photo-caption{position:absolute;z-index:46;left:3%;max-width:44%;bottom:3%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.draft-attachment{position:absolute;z-index:47;pointer-events:none;color:${design.accent};font:900 7pt var(--display)}
    .creator-fields{position:absolute;z-index:52;max-width:48%;padding:.09in .11in;background:rgba(5,5,5,.86);color:#fff;font-family:var(--body);box-shadow:0 .03in .09in rgba(0,0,0,.24)}.creator-fields-ron{left:3%;top:3%;border-left:.035in solid ${design.accent}}.creator-fields-jason{right:3%;bottom:3%;border-right:.035in solid ${design.accent};text-align:right}.creator-fields-lacy{left:3%;bottom:3%;border-left:.035in solid ${design.accent}}.creator-fields-marlon{left:3%;top:3%;border-top:.035in solid ${design.accent}}.creator-fields-adapt{right:3%;top:3%;border-bottom:.035in solid ${design.accent};transform:rotate(-1deg)}.creator-badges{display:flex;flex-wrap:wrap;gap:.025in;margin-bottom:.035in}.creator-badges span{border:1px solid rgba(255,255,255,.55);padding:.018in .035in;font:900 4.4pt var(--display);text-transform:uppercase;letter-spacing:.07em}.creator-fields>strong{display:block;font:900 7pt/.95 var(--display);text-transform:uppercase}.creator-fields dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.025in .06in;margin-top:.045in}.creator-fields dt{font:700 3.8pt var(--body);text-transform:uppercase;opacity:.62}.creator-fields dd{font:700 4.5pt/1.1 var(--body)}.creator-fields>p{margin-top:.045in;padding-top:.035in;border-top:1px solid rgba(255,255,255,.3);font:italic 4.4pt/1.15 var(--body)}
  </style></head><body>
    <main class="card composition-${design.composition}" data-archetype="${identity.archetype}" data-composition="${design.composition}" data-print-layout="${design.composition}" data-photo-slots="${design.photoSlots}" data-design="${design.id}" data-seed-hash="${variation.seedHash}"${context.scene ? ` data-draft-schema="${context.scene.draft.schemaVersion}"${draftEffectData(context)} style="${draftFrameStyle(context)}"` : ""}>${body}${draftTexture(context)}${draftEffectLayers(context)}${draftFieldOverlay(context)}${draftCreatorFieldOverlay(context)}<span class="motif-mark motif-left">${esc(motifMarks[0])}</span><span class="motif-mark motif-right">${esc(motifMarks[1])}</span></main>
  </body></html>`;
}

function printCropPosition(variation: SeededPostcardVariation, index: number): string {
  const crops = ["50% 34%", "30% 42%", "72% 38%", "46% 68%", "78% 66%", "24% 70%"];
  return crops[(variation.seedHash + index * 5) % crops.length]!;
}

function printPhoto(context: FrontContext, index: number, className = "art"): string {
  const scenePhoto = context.scene?.photos[index % context.scene.photos.length];
  if (!scenePhoto) {
    return `<img class="${className}" src="${esc(context.art)}" alt="" style="object-position:${printCropPosition(context.variation, index)};transform:scale(${context.variation.imageScale})"/>`;
  }
  const source = scenePhoto.src.startsWith("/") ? publicAssetUrl(scenePhoto.src) : scenePhoto.src;
  const border = printPhotoBorder(scenePhoto, context.design.accent);
  const style = [
    `object-position:${scenePhoto.objectPosition}`,
    `transform:${scenePhoto.transform}`,
    `filter:${photoFilter(context)} ${scenePhoto.adjustmentFilter}`,
    scenePhoto.clipPath ? `clip-path:${scenePhoto.clipPath}` : "",
    border.border,
    border.shadow,
    scenePhoto.subjectOverlap ? "z-index:35" : "",
  ].filter(Boolean).join(";");
  const caption = scenePhoto.caption
    ? `<span class="draft-photo-caption draft-photo-caption-${index}">${esc(scenePhoto.caption)}</span>`
    : "";
  const duotone = scenePhoto.duotone
    ? `<span aria-hidden="true" data-postcard-effect-layer="duotone" class="draft-duotone" style="background:linear-gradient(135deg,${scenePhoto.duotone.shadow},${scenePhoto.duotone.highlight});${scenePhoto.clipPath ? `clip-path:${scenePhoto.clipPath};` : ""}opacity:${scenePhoto.duotone.strength}"></span>`
    : "";
  return `<img class="${className}" data-draft-slot="${esc(scenePhoto.id)}" src="${esc(source)}" alt="" style="${style}"/>${duotone}${caption}${printPhotoAttachment(scenePhoto, index)}`;
}

function printPhotoBorder(photo: PostcardScenePhoto, color: string): { border: string; shadow: string } {
  switch (photo.border) {
    case "none": return { border: "border:none", shadow: "" };
    case "thin": return { border: `border:1px solid ${color}`, shadow: "" };
    case "heavy": return { border: `border:.055in solid ${color}`, shadow: "" };
    case "neon": return { border: `border:2px solid ${color}`, shadow: `box-shadow:0 0 .12in ${color}` };
    case "distressed": return { border: `border:.035in dashed ${color}`, shadow: "" };
    case "double": return { border: `border:.055in double ${color}`, shadow: "" };
    case "template": return { border: "", shadow: "" };
  }
}

function printPhotoAttachment(photo: PostcardScenePhoto, index: number): string {
  const position = `left:${4 + (index % 4) * 22}%;top:${3 + (index % 3) * 4}%`;
  switch (photo.attachment) {
    case "none":
    case "template": return "";
    case "tape": return `<i class="draft-attachment" style="${position};width:.45in;height:.1in;background:rgba(255,245,190,.72);transform:rotate(-7deg)"></i>`;
    case "staples": return `<i class="draft-attachment" style="${position}">∪ ∪</i>`;
    case "clips": return `<i class="draft-attachment" style="${position}">⌇</i>`;
    case "brackets": return `<i class="draft-attachment" style="${position}">[ ]</i>`;
    case "photo-corners": return `<i class="draft-attachment" style="${position}">⌜ ⌝</i>`;
  }
}

function printLogo(context: FrontContext, className = "logo"): string {
  return `<img class="${className}" src="${esc(context.logo)}" alt=""/>`;
}

function printTimecode(hash: number): string {
  const hours = String(hash % 24).padStart(2, "0");
  const minutes = String(Math.floor(hash / 24) % 60).padStart(2, "0");
  const seconds = String(Math.floor(hash / 1440) % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function printSerial(hash: number): string {
  return String(hash % 10_000).padStart(4, "0");
}

function photoFilter(context: FrontContext): string {
  switch (context.design.imageTreatment) {
    case "broadcast-crt": return "saturate(.88) contrast(1.12)";
    case "score-card": return "saturate(1.08) contrast(1.05)";
    case "halftone-newsprint": return "grayscale(.72) contrast(1.25)";
    case "editorial-duotone": return "grayscale(.78) contrast(1.14)";
    case "instant-film": return "saturate(.88) contrast(1.05) sepia(.08)";
  }
}

function broadcastLowerThirdPrint(context: FrontContext): string {
  const { design, variation } = context;
  return frontDocument(context, `
    ${printPhoto(context, 0)}<div class="shade"></div><div class="scan"></div>
    <div class="rec"><i></i> REC</div>${printLogo(context, "channel-logo")}
    <section class="lower"><small>CORE SIGNAL · CH 02 · ${printTimecode(variation.seedHash)}</small><h1>${esc(design.headline)}</h1></section>`, `
    .card{background:${design.print.background};color:${design.print.ink};font-family:var(--body)}.art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:${photoFilter(context)}}.shade{position:absolute;inset:0;background:${design.overlay}}.scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 3px,rgba(255,255,255,.12) 3px 4px);opacity:.3}.rec{position:absolute;left:4%;top:5%;background:#e1122e;color:#fff;padding:.07in .12in;font:900 7pt var(--display)}.rec i{display:inline-block;width:.06in;height:.06in;border-radius:50%;background:#fff;margin-right:.05in}.channel-logo{position:absolute;right:4%;top:4%;width:24%;height:17%;object-fit:contain}.lower{position:absolute;left:4%;right:4%;bottom:5%;border-left:.07in solid ${design.print.accent};background:#080808;color:#fff;padding:.13in .2in}.lower small{font:700 6pt var(--numeric);letter-spacing:.18em;opacity:.72}.lower h1{margin-top:.04in;font:900 25pt/.9 var(--display);text-transform:uppercase;letter-spacing:-.03em}`);
}

function broadcastAlertPrint(context: FrontContext): string {
  const { design, variation } = context;
  const score = 100 + (variation.seedHash % 900);
  return frontDocument(context, `
    <section class="alert-copy"><div class="bug">OVERTIME</div><small>LIVE STATUS ALERT</small><h1>${esc(design.headline)}</h1><div class="runtime"><b>${score}</b><span>MINUTES<br/>STILL LIVE</span></div></section>
    <figure class="alert-photo">${printPhoto(context, 1)}<div class="scan"></div></figure>${printLogo(context, "channel-logo")}
    <footer>BREAKING · FEED REMAINS ACTIVE</footer>`, `
    .card{background:${design.print.background};color:#fff;font-family:var(--body)}.alert-copy{position:absolute;inset-y:0;left:0;width:43%;background:#080808;padding:.27in .3in}.bug{display:inline-block;background:#e1122e;padding:.06in .1in;font:900 7pt var(--display)}.alert-copy small{display:block;margin-top:.7in;color:${design.print.accent};font:800 6pt var(--numeric);letter-spacing:.2em}.alert-copy h1{margin-top:.1in;font:900 28pt/.82 var(--display);text-transform:uppercase}.runtime{display:flex;align-items:flex-end;gap:.1in;margin-top:.3in;border-top:1px solid #555;padding-top:.14in}.runtime b{font:900 27pt var(--numeric)}.runtime span{font:700 6pt/1.2 var(--body);opacity:.7}.alert-photo{position:absolute;right:4%;top:13%;bottom:8%;width:55%;overflow:hidden;border:2px solid ${design.print.accent}}.alert-photo .art{width:100%;height:100%;object-fit:cover;filter:${photoFilter(context)}}.scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 3px,rgba(255,255,255,.12) 3px 4px);opacity:.3}.channel-logo{position:absolute;right:5%;top:3%;width:21%;height:9%;object-fit:contain}footer{position:absolute;right:4%;bottom:2.5%;width:55%;background:#e1122e;padding:.045in .1in;font:900 6.5pt var(--display);letter-spacing:.16em}`);
}

function broadcastNightPrint(context: FrontContext): string {
  const { design, variation } = context;
  return frontDocument(context, `
    <section class="monitor"><div class="screen">${printPhoto(context, 2)}<div class="green"></div><div class="scan"></div><span class="tc">CAM 02 · ${printTimecode(variation.seedHash)}</span><span class="motion">MOTION DETECTED</span><div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div></div></section>
    ${printLogo(context, "channel-logo")}<h1>${esc(design.headline)}</h1>`, `
    .card{background:${design.print.background};color:#d8ffe4;font-family:var(--body)}.monitor{position:absolute;inset:5%;border:.07in solid #244d35;background:#010604;padding:3%}.screen{position:relative;width:100%;height:100%;overflow:hidden;border:1px solid #57ff8a}.art{width:100%;height:100%;object-fit:cover;filter:${photoFilter(context)}}.green{position:absolute;inset:0;background:#0dff64;opacity:.16}.scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 3px,rgba(255,255,255,.12) 3px 4px);opacity:.3}.tc,.motion{position:absolute;font:700 6.5pt var(--numeric);color:#b8ffc9}.tc{left:3%;top:3%}.motion{right:3%;bottom:3%}.corner{position:absolute;width:10%;height:10%;border-color:${design.print.accent}}.tl{left:5%;top:5%;border-left:2px solid;border-top:2px solid}.tr{right:5%;top:5%;border-right:2px solid;border-top:2px solid}.bl{left:5%;bottom:5%;border-left:2px solid;border-bottom:2px solid}.br{right:5%;bottom:5%;border-right:2px solid;border-bottom:2px solid}.channel-logo{position:absolute;right:7%;top:7%;width:20%;height:12%;object-fit:contain}.card>h1{position:absolute;left:8%;bottom:8%;max-width:60%;background:#000;padding:.1in .16in;font:900 22pt/1 var(--display);text-transform:uppercase}`);
}

function broadcastReplayPrint(context: FrontContext): string {
  const { design, variation } = context;
  const hero = variation.seedHash % design.photoSlots;
  const frames = Array.from({ length: design.photoSlots }, (_, index) =>
    `<figure>${printPhoto(context, index)}<div class="scan"></div><figcaption>ANGLE ${String(index + 1).padStart(2, "0")}</figcaption>${index === hero ? "<b>HERO FRAME</b>" : ""}</figure>`).join("");
  return frontDocument(context, `
    <header><h1>${esc(design.headline)}</h1>${printLogo(context)}</header><section class="replay-grid">${frames}</section>`, `
    .card{background:${design.print.background};color:#fff;font-family:var(--body);padding:4%}.card>header{height:14%;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #777;background:#080808;padding:0 .15in}.card>header h1{font:900 20pt var(--display);text-transform:uppercase}.card>header .logo{width:18%;height:72%;object-fit:contain}.replay-grid{height:76%;margin-top:2%;display:grid;grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(2,1fr);gap:1.5%}.replay-grid figure{position:relative;overflow:hidden;border:1px solid #777;background:#000}.replay-grid .art{width:100%;height:100%;object-fit:cover;filter:${photoFilter(context)}}.scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 3px,rgba(255,255,255,.12) 3px 4px);opacity:.3}.replay-grid figcaption,.replay-grid b{position:absolute;background:#080808;color:#fff;padding:.03in .06in;font:700 5.5pt var(--numeric)}.replay-grid figcaption{left:3%;top:3%}.replay-grid b{right:3%;bottom:4%;background:#e1122e}`);
}

function tradingRookiePrint(context: FrontContext): string {
  const { design, variation } = context;
  const rating = 90 + (variation.seedHash % 10);
  return frontDocument(context, `
    <div class="edge"></div><figure class="rookie-photo">${printPhoto(context, 0)}</figure><div class="rating"><b>${rating}</b><span>ROOKIE</span></div>${printLogo(context, "channel-logo")}
    <footer><h1>${esc(design.headline)}</h1><small>PLAYER FILE · ART ${printSerial(variation.seedHash)}</small></footer>`, `
    .card{background:${design.print.background};color:${design.print.ink};font-family:var(--body)}.edge{position:absolute;inset:4%;border:.06in solid ${design.print.accent};border-radius:5%}.rookie-photo{position:absolute;left:18%;right:18%;top:9%;bottom:12%;overflow:hidden;border:.045in solid #111;border-radius:42% 42% 0 0;background:#000;box-shadow:0 .08in .16in #333}.rookie-photo .art{width:100%;height:100%;object-fit:cover;filter:${photoFilter(context)}}.rating{position:absolute;left:6%;top:7%;width:.72in;height:.72in;border:2px solid #111;border-radius:50%;background:#fff;color:#111;text-align:center;padding-top:.12in}.rating b{display:block;font:900 20pt/.75 var(--numeric)}.rating span{font:900 5pt var(--display)}.channel-logo{position:absolute;right:6%;top:7%;width:22%;height:18%;object-fit:contain}.card>footer{position:absolute;left:7%;right:7%;bottom:5%;background:#111;color:#fff;border:2px solid #111;padding:.09in .16in;text-align:center;transform:skewX(-6deg)}.card>footer>*{transform:skewX(6deg)}.card>footer h1{font:900 21pt/.9 var(--display);text-transform:uppercase}.card>footer small{display:block;margin-top:.03in;font:700 5.5pt var(--numeric);letter-spacing:.18em}`);
}

function tradingStatPrint(context: FrontContext): string {
  const { design, variation } = context;
  const rating = 90 + (variation.seedHash % 10);
  const stats = [["COLLAB", 98], ["CLUTCH", rating], ["QUEST", 96], ["CHAOS", 97]];
  return frontDocument(context, `
    <div class="edge"></div><figure class="stat-photo">${printPhoto(context, 1)}<figcaption>${esc(design.headline)}</figcaption></figure>
    <section class="stat-copy"><b class="overall">${rating}</b><small>OVERALL</small>${stats.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("")}</section>${printLogo(context, "channel-logo")}`, `
    .card{background:${design.print.background};color:${design.print.ink};font-family:var(--body)}.edge{position:absolute;inset:4%;border:.045in solid ${design.print.accent}}.stat-photo{position:absolute;left:6%;top:8%;bottom:5%;width:53%;overflow:hidden;border:2px solid ${design.print.accent};background:#000}.stat-photo .art{width:100%;height:100%;object-fit:cover;filter:${photoFilter(context)}}.stat-photo figcaption{position:absolute;left:0;right:0;bottom:0;background:#080808;color:#fff;padding:.1in .13in;font:900 14pt var(--display);text-transform:uppercase}.stat-copy{position:absolute;right:6%;top:8%;width:30%;text-align:right}.overall{display:block;font:900 48pt/.8 var(--numeric)}.stat-copy small{font:900 6pt var(--display);letter-spacing:.15em}.stat-copy div{display:flex;justify-content:space-between;border-bottom:1px solid currentColor;padding:.07in 0;font:700 6pt var(--body);text-align:left}.channel-logo{position:absolute;right:8%;bottom:7%;width:24%;height:17%;object-fit:contain}`);
}

function tradingQuestPrint(context: FrontContext): string {
  const { design, variation } = context;
  return frontDocument(context, `
    <header><div><small>SIDE QUEST #${String(variation.seedHash % 100).padStart(2, "0")}</small><h1>${esc(design.headline)}</h1></div>${printLogo(context)}</header>
    <figure class="primary">${printPhoto(context, 0)}<figcaption>PRIMARY OBJECTIVE</figcaption></figure><figure class="secondary">${printPhoto(context, 1)}</figure>
    <section class="quest-copy"><b>QUEST CLEARED</b><p>Two scenes collected. Community XP secured.</p><div class="bar"><i></i></div><small>100%</small></section>`, `
    .card{background:${design.print.background};color:${design.print.ink};font-family:var(--body);padding:5%}.card>header{height:17%;display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid ${design.print.accent};padding:0 2%}.card>header small{font:700 5.5pt var(--numeric);letter-spacing:.18em}.card>header h1{font:900 21pt/.9 var(--display);text-transform:uppercase}.card>header .logo{width:18%;height:75%;object-fit:contain}.primary,.secondary{position:absolute;overflow:hidden;border:2px solid #ddd;border-radius:.08in}.primary{left:5%;top:25%;bottom:9%;width:57%}.secondary{right:5%;top:25%;width:30%;height:31%}.primary .art,.secondary .art{width:100%;height:100%;object-fit:cover;filter:${photoFilter(context)}}.primary figcaption{position:absolute;left:3%;bottom:4%;background:#111;color:#fff;padding:.04in .08in;font:700 5.5pt var(--display)}.quest-copy{position:absolute;right:5%;bottom:9%;width:30%;background:#111;color:#fff;border-radius:.08in;padding:.12in}.quest-copy b{font:900 6pt var(--display);color:${design.print.accent}}.quest-copy p{margin-top:.05in;font:6pt/1.25 var(--body);opacity:.8}.bar{height:.06in;margin-top:.1in;background:#555;border-radius:.04in;overflow:hidden}.bar i{display:block;width:100%;height:100%;background:${design.print.accent}}.quest-copy small{display:block;text-align:right;font:700 5pt var(--numeric);margin-top:.03in}`);
}

function tradingHoloPrint(context: FrontContext): string {
  const { design, variation } = context;
  return frontDocument(context, `
    <section class="holo-frame"><div class="prism"></div><figure>${printPhoto(context, 3)}</figure><span class="one">HOLO</span>${printLogo(context, "channel-logo")}<footer><h1>${esc(design.headline)}</h1><small>PRISMATIC PRINT ARTWORK · CODE ${printSerial(variation.seedHash)}</small></footer></section>`, `
    .card{background:${design.print.background};color:${design.print.ink};font-family:var(--body)}.holo-frame{position:absolute;inset:3%;overflow:hidden;border:.07in solid #fff;border-radius:7%;background:#fff2}.prism{position:absolute;inset:0;background:${design.overlay};opacity:.55}.holo-frame figure{position:absolute;left:23%;right:23%;top:8%;bottom:8%;overflow:hidden;border:2px solid #fff;clip-path:polygon(18% 0,82% 0,100% 17%,92% 100%,8% 100%,0 17%)}.holo-frame figure .art{width:100%;height:100%;object-fit:cover;filter:${photoFilter(context)}}.one{position:absolute;left:5%;top:6%;border:1px solid #111;border-radius:.2in;background:#fffb;color:#111;padding:.04in .09in;font:900 6pt var(--display)}.channel-logo{position:absolute;right:5%;top:5%;width:22%;height:18%;object-fit:contain}.holo-frame footer{position:absolute;left:7%;right:7%;bottom:5%;background:#080808;color:#fff;padding:.1in .16in;text-align:center}.holo-frame footer h1{font:900 21pt/.9 var(--display);text-transform:uppercase}.holo-frame footer small{display:block;margin-top:.03in;font:700 5pt var(--numeric);letter-spacing:.18em}`);
}

function newspaperMastheadPrint(context: FrontContext): string {
  const { identity, variation } = context;
  return `<div class="masthead"><span>LATE EDITION</span><div><b>${esc(identity.communityName)} DAILY</b><small>${printTimecode(variation.seedHash)} · PRICE ONE W</small></div>${printLogo(context)}</div>`;
}

function newspaperBannerPrint(context: FrontContext): string {
  const { design } = context;
  return frontDocument(context, `
    <section class="newspaper">${newspaperMastheadPrint(context)}<h1>${esc(design.headline)}</h1><div class="lead"><figure>${printPhoto(context, 0)}</figure><article><b>EXCLUSIVE</b><p>A community dispatch, printed before the timeline could refresh.</p><hr/><strong>THE VERDICT</strong><p>One moment. One front page. No corrections after deadline.</p>${printLogo(context, "desk-logo")}</article></div></section>`, `
    .card{background:${design.print.background};color:${design.print.ink};font-family:var(--body);padding:4%}.newspaper{height:100%;border-top:.055in double currentColor;border-bottom:.055in double currentColor}.masthead{height:18%;display:flex;align-items:center;justify-content:space-between;text-align:center;border-bottom:1px solid currentColor}.masthead>span{font:700 5pt var(--numeric)}.masthead div b{display:block;font:900 21pt/.85 var(--display);text-transform:uppercase}.masthead div small{font:6pt var(--numeric);letter-spacing:.1em}.masthead .logo{width:12%;height:70%;object-fit:contain;filter:grayscale(1)}.newspaper>h1{height:22%;padding:.08in .05in;border-bottom:1px solid currentColor;text-align:center;font:900 25pt/.88 var(--display);text-transform:uppercase}.lead{height:56%;display:grid;grid-template-columns:1.5fr .75fr;gap:3%;padding-top:2%}.lead figure{overflow:hidden;border:1px solid #555}.lead figure .art{width:100%;height:100%;object-fit:cover;filter:${photoFilter(context)}}.lead article{position:relative;font:7pt/1.2 var(--body)}.lead article>b{color:${design.print.accent}}.lead article strong{font-size:7pt}.lead article p{margin-top:.05in}.lead article hr{margin:.09in 0;border:0;border-top:1px solid currentColor;opacity:.35}.desk-logo{position:absolute;right:0;bottom:0;width:100%;height:28%;object-fit:contain;object-position:right;filter:grayscale(1)}`);
}

function newspaperSportsPrint(context: FrontContext): string {
  const { design, variation } = context;
  const home = 2 + (variation.seedHash % 6);
  const away = variation.seedHash % 3;
  return frontDocument(context, `
    <section class="newspaper">${newspaperMastheadPrint(context)}<header><div><small>SPORTS EXTRA</small><h1>${esc(design.headline)}</h1></div><div class="score"><b>${home}</b><span>FINAL</span><b>${away}</b></div></header><div class="sports-grid"><figure class="winner">${printPhoto(context, 0)}<figcaption>THE WINNING FRAME</figcaption></figure><aside><figure>${printPhoto(context, 1)}</figure><p>Analysis: the final boss had no answer after halftime.</p></aside></div></section>`, `
    .card{background:${design.print.background};color:${design.print.ink};font-family:var(--body);padding:4%}.newspaper{height:100%;border-top:.055in double currentColor;border-bottom:.055in double currentColor}.masthead{height:17%;display:flex;align-items:center;justify-content:space-between;text-align:center;border-bottom:1px solid currentColor}.masthead>span{font:700 5pt var(--numeric)}.masthead div b{display:block;font:900 18pt/.85 var(--display);text-transform:uppercase}.masthead div small{font:5.5pt var(--numeric)}.masthead .logo{width:12%;height:70%;object-fit:contain;filter:grayscale(1)}.newspaper>header{height:20%;display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid currentColor;padding:0 2%}.newspaper>header small{font:900 6pt var(--display);color:${design.print.accent}}.newspaper>header h1{font:900 17pt/.9 var(--display);text-transform:uppercase}.score{display:flex;align-items:center;gap:.1in}.score b{font:900 30pt var(--numeric)}.score span{font:800 6pt var(--display);opacity:.5}.sports-grid{height:58%;display:grid;grid-template-columns:1.45fr .75fr;gap:2%;padding-top:2%}.sports-grid figure{position:relative;overflow:hidden;border:1px solid #555}.sports-grid .art{width:100%;height:100%;object-fit:cover;filter:${photoFilter(context)}}.winner figcaption{position:absolute;left:0;bottom:0;background:#111;color:#fff;padding:.04in .08in;font:700 5pt var(--display)}.sports-grid aside{display:grid;grid-template-rows:1fr auto;gap:5%}.sports-grid aside p{border-top:1px solid currentColor;padding-top:.05in;font:700 6pt/1.2 var(--body)}`);
}

function newspaperClassifiedsPrint(context: FrontContext): string {
  const { design, variation } = context;
  const ads = ["WANTED", "FOR TRADE", "LATE FEES", "FOUND", "OPEN CALL", "ONE NIGHT ONLY"];
  const cells = Array.from({ length: design.photoSlots }, (_, index) => `<article><figure>${printPhoto(context, index)}</figure><b>${ads[index]}</b><p>Community lore, lightly used.</p>${index === variation.seedHash % design.photoSlots ? "<em>✓</em>" : ""}</article>`).join("");
  return frontDocument(context, `
    <section class="newspaper">${newspaperMastheadPrint(context)}<header><h1>${esc(design.headline)}</h1><span>SIX FRESH LISTINGS</span></header><div class="classified-grid">${cells}</div></section>`, `
    .card{background:${design.print.background};color:${design.print.ink};font-family:var(--body);padding:4%}.newspaper{height:100%;border-top:.055in double currentColor;border-bottom:.055in double currentColor}.masthead{height:17%;display:flex;align-items:center;justify-content:space-between;text-align:center;border-bottom:1px solid currentColor}.masthead>span{font:700 5pt var(--numeric)}.masthead div b{display:block;font:900 18pt/.85 var(--display);text-transform:uppercase}.masthead div small{font:5.5pt var(--numeric)}.masthead .logo{width:12%;height:70%;object-fit:contain;filter:grayscale(1)}.newspaper>header{height:16%;display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid currentColor}.newspaper>header h1{font:900 19pt var(--display);text-transform:uppercase}.newspaper>header span{border:2px solid ${design.print.accent};color:${design.print.accent};padding:.05in .08in;font:900 5.5pt var(--display)}.classified-grid{height:64%;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr);gap:1.3%;padding-top:1.5%}.classified-grid article{position:relative;overflow:hidden;border:1px solid #777;padding:3%}.classified-grid figure{height:64%;overflow:hidden;border:1px solid #888}.classified-grid .art{width:100%;height:100%;object-fit:cover;filter:${photoFilter(context)}}.classified-grid b{display:block;margin-top:3%;font:900 6pt var(--display);color:${design.print.accent}}.classified-grid p{font:700 4.5pt var(--body);opacity:.65}.classified-grid em{position:absolute;right:3%;top:2%;color:${design.print.accent};font:900 11pt var(--display);transform:rotate(6deg)}`);
}

function newspaperLatePrint(context: FrontContext): string {
  const { design, variation } = context;
  return frontDocument(context, `
    <header><span>LATE EDITION</span><h2>THUGS NIGHT</h2><span>AFTER DEADLINE</span></header><figure>${printPhoto(context, 3)}<div class="shade"></div><figcaption><h1>${esc(design.headline)}</h1><small>PHOTO DESK EXCLUSIVE · ${printTimecode(variation.seedHash)}</small></figcaption></figure>${printLogo(context, "channel-logo")}`, `
    .card{background:${design.print.background};color:${design.print.ink};font-family:var(--body);padding:4%}.card>header{height:14%;display:flex;align-items:flex-end;justify-content:space-between;border-top:.055in double currentColor;border-bottom:.055in double currentColor;padding-bottom:1%}.card>header span{font:700 5.5pt var(--display)}.card>header h2{font:900 27pt/.8 var(--display);text-transform:uppercase}.card>figure{position:absolute;left:4%;right:4%;top:20%;bottom:5%;overflow:hidden;border:1px solid #777}.card>figure .art{width:100%;height:100%;object-fit:cover;filter:${photoFilter(context)}}.shade{position:absolute;inset:0;background:${design.overlay}}.card>figure figcaption{position:absolute;left:0;right:0;bottom:0;background:#080808;color:#f2ead7;padding:.14in .2in;border-top:.06in solid ${design.print.accent}}.card>figure h1{font:900 25pt/.88 var(--display);text-transform:uppercase}.card>figure small{display:block;margin-top:.04in;color:${design.print.accent};font:700 5.5pt var(--numeric);letter-spacing:.16em}.channel-logo{position:absolute;right:6%;top:22%;width:20%;height:13%;object-fit:contain}`);
}

function editorialCoverPrint(context: FrontContext): string {
  const { design, variation } = context;
  return frontDocument(context, `
    ${printPhoto(context, 0)}<div class="shade"></div>${printLogo(context, "channel-logo")}<div class="volume">M3 EDITION<br/>VOL. ${String(variation.seedHash % 100).padStart(2, "0")}</div><section><small>CULTURE · MOTION · COMPETITION</small><h1>${esc(design.headline)}</h1></section><i class="rule"></i>`, `
    .card{background:${design.print.background};color:${design.print.ink};font-family:var(--body)}.art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:${photoFilter(context)}}.shade{position:absolute;inset:0;background:${design.overlay}}.channel-logo{position:absolute;left:4%;top:4%;width:27%;height:24%;object-fit:contain;object-position:left}.volume{position:absolute;right:4%;top:5%;text-align:right;font:700 6pt/1.4 var(--body);letter-spacing:.17em}.card>section{position:absolute;left:5%;bottom:7%;max-width:70%}.card>section small{font:700 7pt var(--body);letter-spacing:.18em;color:${design.print.accent}}.card>section h1{margin-top:.04in;font:900 31pt/.86 var(--display);text-transform:uppercase}.rule{position:absolute;right:4%;bottom:6%;width:1px;height:28%;background:${design.print.accent}}`);
}

function editorialStreetPrint(context: FrontContext): string {
  const { design, variation } = context;
  return frontDocument(context, `
    <figure>${printPhoto(context, 1)}</figure><section><small>LOCATION STUDY · 003</small><h1>${esc(design.headline)}</h1><div><b>SUBJECT: M3</b><p>Motion captured between destinations.</p></div></section><p class="vertical">STREET STYLE / FIELD NO. ${String(variation.seedHash % 99).padStart(2, "0")}</p>${printLogo(context, "channel-logo")}`, `
    .card{background:${design.print.background};color:#101112;font-family:var(--body)}.card>figure{position:absolute;inset-y:0;left:0;width:64%;overflow:hidden}.card>figure .art{width:100%;height:100%;object-fit:cover;filter:${photoFilter(context)}}.card>section{position:absolute;inset-y:0;right:0;width:36%;background:#d9d7d0;padding:.25in .28in}.card>section>small{font:700 5.5pt var(--numeric);letter-spacing:.2em}.card>section h1{margin-top:.55in;font:900 23pt/.82 var(--display);text-transform:uppercase;overflow-wrap:anywhere}.card>section>div{position:absolute;left:14%;right:14%;bottom:7%;border-top:1px solid #777;padding-top:.1in;font:6pt/1.2 var(--body)}.card>section>div b{display:block}.vertical{position:absolute;left:4%;top:5%;writing-mode:vertical-rl;color:#fff;font:700 6.5pt var(--body);letter-spacing:.24em}.channel-logo{position:absolute;right:5%;top:5%;width:24%;height:17%;object-fit:contain}`);
}

function editorialMatchPrint(context: FrontContext): string {
  const { design, variation } = context;
  const score = 1 + (variation.seedHash % 5);
  return frontDocument(context, `
    <header><div><small>M3 MATCH DAY</small><h1>${esc(design.headline)}</h1></div><div class="score"><b>${score}</b><span>—</span><b>0</b></div></header><figure class="primary">${printPhoto(context, 0)}</figure><figure class="secondary">${printPhoto(context, 1)}</figure><section><b>QUIET ANALYSIS</b><p>Composure, movement, and the decisive frame.</p></section><footer><span>FINAL WHISTLE · SPECIAL EDITION</span>${printLogo(context)}</footer>`, `
    .card{background:${design.print.background};color:#111;font-family:var(--body);padding:5%}.card>header{height:15%;display:flex;align-items:flex-start;justify-content:space-between;border-bottom:2px solid #555}.card>header small{font:700 5.5pt var(--numeric);letter-spacing:.18em}.card>header h1{font:900 17pt var(--display);text-transform:uppercase}.score{display:flex;align-items:baseline;gap:.06in}.score b{font:900 34pt/.8 var(--numeric)}.score span{font:700 7pt var(--body)}.card>figure{position:absolute;overflow:hidden;border:1px solid #777}.card>figure .art{width:100%;height:100%;object-fit:cover;filter:${photoFilter(context)}}.primary{left:5%;top:23%;bottom:17%;width:55%}.secondary{right:5%;top:23%;width:33%;height:31%}.card>section{position:absolute;right:5%;bottom:17%;width:33%;border-left:2px solid ${design.print.accent};padding-left:.12in}.card>section b{font:900 6pt var(--display)}.card>section p{margin-top:.04in;font:5.5pt/1.2 var(--body)}.card>footer{position:absolute;left:5%;right:5%;bottom:5%;height:8%;display:flex;align-items:center;justify-content:space-between;border-top:1px solid #999;padding-top:2%;font:700 5pt var(--body);letter-spacing:.16em}.card>footer .logo{width:16%;height:.32in;object-fit:contain}`);
}

function editorialNoirPrint(context: FrontContext): string {
  const { design, variation } = context;
  return frontDocument(context, `
    ${printPhoto(context, 4)}<div class="shade"></div><i class="rule"></i><section><small>M3 / NOIR PROFILE</small><h1>${esc(design.headline)}</h1></section><aside>HIGH CONTRAST<br/>LOW NOISE<br/>NO. ${String(variation.seedHash % 100).padStart(2, "0")}</aside>${printLogo(context, "channel-logo")}`, `
    .card{background:${design.print.background};color:#fff;font-family:var(--body)}.art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:${photoFilter(context)}}.shade{position:absolute;inset:0;background:${design.overlay}}.rule{position:absolute;left:4%;top:5%;bottom:5%;width:1px;background:${design.print.accent}}.card>section{position:absolute;left:7%;top:6%;max-width:48%}.card>section small{font:700 5.5pt var(--body);letter-spacing:.26em;color:${design.print.accent}}.card>section h1{margin-top:.1in;font:900 29pt/.82 var(--display);text-transform:uppercase}.card>aside{position:absolute;right:5%;bottom:6%;max-width:34%;border-top:1px solid #aaa;padding-top:.08in;text-align:right;font:700 5.5pt/1.5 var(--body);letter-spacing:.14em;color:#bbb}.channel-logo{position:absolute;left:6%;bottom:5%;width:20%;height:15%;object-fit:contain}`);
}

function scrapPhotoPrint(
  context: FrontContext,
  index: number,
  className: string,
  rotation: number,
  crop?: string,
): string {
  // Rich drafts own an independently normalized source and crop for every
  // slot. The legacy fallback still repeats the single V1 image, but a V2
  // scrapbook must never silently collapse all of its slots to `context.art`.
  const photo = context.scene
    ? printPhoto(context, index)
    : `<img class="art" src="${esc(context.art)}" alt="" style="object-position:${crop ?? printCropPosition(context.variation, index)}"/>`;
  return `<figure class="scrap-photo ${className}" style="transform:rotate(${rotation}deg)">${photo}<i></i></figure>`;
}

function scrapbookPolaroidPrint(context: FrontContext): string {
  const { design, variation } = context;
  return frontDocument(context, `
    <div class="texture"></div>${scrapPhotoPrint(context, 0, "one", variation.artworkRotationDeg - 2.2, "50% 50%")} ${scrapPhotoPrint(context, 1, "two", variation.artworkRotationDeg + 3.4, "70% 30%")} ${scrapPhotoPrint(context, 2, "three", variation.artworkRotationDeg - 1.1, "30% 70%")}
    <span class="field">FLOCK FIELD NOTES</span><section><h1>${esc(design.headline)}</h1><small>FILED #${printSerial(variation.seedHash)}</small></section>${printLogo(context, "channel-logo")}`, `
    .card{background:${design.print.background};color:${design.print.ink};font-family:var(--body)}.texture{position:absolute;inset:0;background:${design.overlay};opacity:.35}.scrap-photo{position:absolute;background:#fffaf0;padding:1.5% 1.5% 4%;box-shadow:0 .06in .14in #3329}.scrap-photo img{width:100%;height:100%;object-fit:cover;filter:${photoFilter(context)}}.scrap-photo i{position:absolute;left:36%;top:-6%;width:30%;height:13%;background:#dfc892;opacity:.75;transform:rotate(2deg)}.one{left:8%;top:14%;width:43%;height:60%}.two{right:9%;top:9%;width:30%;height:38%}.three{right:16%;bottom:8%;width:32%;height:35%}.field{position:absolute;left:5%;top:4%;color:${design.print.accent};font:800 8pt var(--body);letter-spacing:.14em;transform:rotate(-2deg)}.card>section{position:absolute;left:5%;bottom:6%;max-width:48%;background:#fffaf0;color:#201b18;padding:.1in .14in;transform:rotate(-1deg)}.card>section h1{font:900 16pt/.9 var(--display);text-transform:uppercase}.card>section small{font:700 5.5pt var(--numeric);opacity:.65}.channel-logo{position:absolute;right:3%;top:52%;width:24%;height:19%;object-fit:contain;transform:rotate(-6deg)}`);
}

function scrapbookContactPrint(context: FrontContext): string {
  const { design, variation } = context;
  const hero = variation.seedHash % design.photoSlots;
  const frames = Array.from({ length: design.photoSlots }, (_, index) => `<figure>${printPhoto(context, index)}<figcaption>${String(index + 1).padStart(2, "0")} / ${printTimecode(variation.seedHash + index * 97)}</figcaption>${index === hero ? "<i></i>" : ""}</figure>`).join("");
  return frontDocument(context, `
    <section class="contact"><header><div><small>FLOCK CONTACT SHEET</small><h1>${esc(design.headline)}</h1></div>${printLogo(context)}</header><div class="contact-grid">${frames}</div></section>`, `
    .card{background:${design.print.background};color:${design.print.ink};font-family:var(--body)}.contact{position:absolute;inset:5%;background:#11100f;color:#fffaf0;padding:3%;box-shadow:0 .08in .18in #2228}.contact>header{height:12%;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #777;padding-bottom:1%}.contact>header small{font:700 5pt var(--body);letter-spacing:.18em}.contact>header h1{font:900 13pt var(--display);text-transform:uppercase}.contact>header .logo{width:17%;height:100%;object-fit:contain}.contact-grid{height:75%;margin-top:2%;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr);gap:2%}.contact-grid figure{position:relative;overflow:hidden;border:1px solid #777;background:#000}.contact-grid .art{width:100%;height:100%;object-fit:cover;filter:${photoFilter(context)}}.contact-grid figcaption{position:absolute;left:3%;bottom:3%;background:#080808;color:#fff;padding:.02in .04in;font:5pt var(--numeric)}.contact-grid i{position:absolute;inset:6%;border:.025in solid ${design.print.accent};border-radius:50%;transform:rotate(${variation.artworkRotationDeg}deg)}`);
}

function scrapbookTourPrint(context: FrontContext): string {
  const { design, variation } = context;
  return frontDocument(context, `
    <div class="texture"></div><svg class="route" viewBox="0 0 600 400" preserveAspectRatio="none"><path d="M85 86 C200 20 265 160 370 95 S490 160 520 285 C420 360 300 250 175 330" fill="none" stroke="${design.print.accent}" stroke-width="3" stroke-dasharray="9 7"/><circle cx="85" cy="86" r="6" fill="${design.print.accent}"/><circle cx="520" cy="285" r="6" fill="${design.print.accent}"/></svg>
    ${scrapPhotoPrint(context, 0, "p1", variation.artworkRotationDeg - 1.8)}${scrapPhotoPrint(context, 1, "p2", variation.artworkRotationDeg + 2.4)}${scrapPhotoPrint(context, 2, "p3", variation.artworkRotationDeg - 1.8)}${scrapPhotoPrint(context, 3, "p4", variation.artworkRotationDeg + 2.4)}
    <span class="field">FLOCK TOUR NOTES</span><section><h1>${esc(design.headline)}</h1><small>FOUR STOPS · ONE FIELD PAGE</small></section>${printLogo(context, "channel-logo")}`, `
    .card{background:${design.print.background};color:${design.print.ink};font-family:var(--body)}.texture{position:absolute;inset:0;background:${design.overlay};opacity:.5}.route{position:absolute;inset:0;width:100%;height:100%;opacity:.65}.scrap-photo{position:absolute;background:#fffaf0;padding:1.5% 1.5% 4%;box-shadow:0 .06in .14in #3329}.scrap-photo img{width:100%;height:100%;object-fit:cover;filter:${photoFilter(context)}}.scrap-photo i{position:absolute;left:36%;top:-6%;width:30%;height:13%;background:#dfc892;opacity:.75}.p1{left:6%;top:16%;width:32%;height:34%}.p2{right:8%;top:8%;width:29%;height:30%}.p3{left:18%;bottom:8%;width:30%;height:31%}.p4{right:8%;bottom:10%;width:30%;height:34%}.field{position:absolute;left:5%;top:4%;color:${design.print.accent};font:800 8pt var(--body);letter-spacing:.14em;transform:rotate(-2deg)}.card>section{position:absolute;left:5%;top:54%;max-width:28%;background:#fffaf0;color:#201b18;padding:.1in .13in;transform:rotate(-2deg)}.card>section h1{font:900 11pt/.9 var(--display);text-transform:uppercase}.card>section small{font:700 4.5pt var(--body)}.channel-logo{position:absolute;left:2%;bottom:2%;width:20%;height:17%;object-fit:contain;transform:rotate(-6deg)}`);
}

function scrapbookArchivePrint(context: FrontContext): string {
  const { design, variation } = context;
  return frontDocument(context, `
    <section class="folder"><div class="tab">FLOCK FILES / 03</div><div class="inner"></div>${scrapPhotoPrint(context, 0, "p1", variation.artworkRotationDeg - 1.2)}${scrapPhotoPrint(context, 1, "p2", variation.artworkRotationDeg + 2.6)}${scrapPhotoPrint(context, 2, "p3", variation.artworkRotationDeg - 2.1)}<div class="label"><h1>${esc(design.headline)}</h1><small>ARCHIVE CODE ${printSerial(variation.seedHash)}</small></div>${printLogo(context, "channel-logo")}</section>`, `
    .card{background:${design.print.background};color:#2a2118;font-family:var(--body)}.folder{position:absolute;inset:4%;border:1px solid #6d512d;background:#d6b477;box-shadow:0 .08in .2in #35241266}.tab{position:absolute;left:3%;top:-6%;width:30%;height:9%;border-radius:.05in .05in 0 0;background:#d6b477;padding:.03in .1in;font:900 5pt var(--display)}.inner{position:absolute;inset:3%;border:1px solid #76572e;background:#caaa73;opacity:.45}.scrap-photo{position:absolute;background:#fffaf0;padding:1.5% 1.5% 4%;box-shadow:0 .06in .14in #3329}.scrap-photo img{width:100%;height:100%;object-fit:cover;filter:${photoFilter(context)}}.scrap-photo i{position:absolute;left:36%;top:-6%;width:30%;height:13%;background:#dfc892;opacity:.75}.p1{left:6%;top:9%;width:48%;height:70%}.p2{right:8%;top:12%;width:30%;height:34%}.p3{right:13%;bottom:9%;width:31%;height:34%}.label{position:absolute;left:4%;bottom:5%;max-width:50%;border:2px solid #b3231d;background:#efe7d8;padding:.1in .14in;transform:rotate(-1deg)}.label h1{font:900 12pt/.9 var(--display);text-transform:uppercase}.label small{font:700 4.5pt var(--numeric);letter-spacing:.14em}.channel-logo{position:absolute;right:2%;bottom:1%;width:18%;height:17%;object-fit:contain;transform:rotate(-6deg)}`);
}

function broadcastFront(context: FrontContext): string {
  switch (context.design.composition) {
    case "lower-third": return broadcastLowerThirdPrint(context);
    case "full-frame-alert": return broadcastAlertPrint(context);
    case "night-vision-monitor": return broadcastNightPrint(context);
    case "split-screen-recap": return broadcastReplayPrint(context);
    default: throw new Error(`Unsupported broadcast composition: ${context.design.composition}`);
  }
}

function tradingCardFront(context: FrontContext): string {
  switch (context.design.composition) {
    case "rookie-card": return tradingRookiePrint(context);
    case "stat-leader": return tradingStatPrint(context);
    case "quest-card": return tradingQuestPrint(context);
    case "holographic-mvp": return tradingHoloPrint(context);
    default: throw new Error(`Unsupported trading-card composition: ${context.design.composition}`);
  }
}

function newspaperFront(context: FrontContext): string {
  switch (context.design.composition) {
    case "banner-headline": return newspaperBannerPrint(context);
    case "sports-extra": return newspaperSportsPrint(context);
    case "classified-collage": return newspaperClassifiedsPrint(context);
    case "late-edition-photo": return newspaperLatePrint(context);
    default: throw new Error(`Unsupported newspaper composition: ${context.design.composition}`);
  }
}

function editorialFront(context: FrontContext): string {
  switch (context.design.composition) {
    case "cover-story": return editorialCoverPrint(context);
    case "street-style-cover": return editorialStreetPrint(context);
    case "match-day-editorial": return editorialMatchPrint(context);
    case "noir-profile": return editorialNoirPrint(context);
    default: throw new Error(`Unsupported editorial composition: ${context.design.composition}`);
  }
}

function scrapbookFront(context: FrontContext): string {
  switch (context.design.composition) {
    case "polaroid-stack": return scrapbookPolaroidPrint(context);
    case "contact-sheet": return scrapbookContactPrint(context);
    case "tour-notes": return scrapbookTourPrint(context);
    case "archive-folder": return scrapbookArchivePrint(context);
    default: throw new Error(`Unsupported scrapbook composition: ${context.design.composition}`);
  }
}

function frontHtml(context: FrontContext): string {
  switch (context.identity.archetype) {
    case "broadcast-freeze-frame": return broadcastFront(context);
    case "creator-trading-card": return tradingCardFront(context);
    case "newspaper-front-page": return newspaperFront(context);
    case "editorial-magazine": return editorialFront(context);
    case "scrapbook-contact-sheet": return scrapbookFront(context);
  }
}

function backHeader(identity: PostcardIdentity, variation: SeededPostcardVariation): string {
  const number = String(variation.seedHash).slice(-4);
  switch (identity.back.layout) {
    case "split-broadcast-log": return `<div class="back-heading"><b>TRANSMISSION LOG</b><span>CAM 02 / TC ${number}</span></div>`;
    case "stats-and-message": return `<div class="back-heading"><b>PLAYER MESSAGE</b><span>EDITION ${number} / FAN +99</span></div>`;
    case "late-edition-columns": return `<div class="back-heading"><b>${esc(identity.communityName)} DAILY</b><span>LATE EDITION / ${number}</span></div>`;
    case "editor-letter": return `<div class="back-heading"><b>LETTER FROM THE EDITOR</b><span>ISSUE ${number} / M3</span></div>`;
    case "pinned-scrapbook-note": return `<div class="back-heading"><b>PINNED FOR THE ARCHIVE</b><span>FLOCK FILE ${number}</span></div>`;
  }
}

function backHtml(
  input: FulfillInput,
  member: MailMember,
  identity: PostcardIdentity,
  variation: SeededPostcardVariation,
  scene: PostcardScene | null,
): string {
  const writing = scene?.writing;
  const messageParts = [
    writing?.greeting.trim() || "",
    (writing?.message ?? input.message).trim(),
    writing?.featuredQuote.trim() ? `“${writing.featuredQuote.trim()}”` : "",
    writing?.whyMomentMattered.trim() || "",
    writing?.secondaryMessage.trim()
      ? `${writing.secondaryLanguage === "none" ? "SECOND LANGUAGE" : writing.secondaryLanguage.toUpperCase()}: ${writing.secondaryMessage.trim()}`
      : "",
    writing?.signoff.trim() || "",
  ].filter(Boolean);
  const message = messageParts.map((part) => esc(part).replace(/\r?\n/g, "<br/>")).join("<br/><br/>");
  const printableCharacterCount = messageParts.join(" ").length;
  const visibleSender = (writing?.senderName ?? input.senderName ?? "").trim();
  const sender = writing?.senderVisibility === "anonymous"
    ? "— Anonymous CORE fan"
    : visibleSender
      ? `— ${esc(visibleSender)}`
      : "— A CORE fan";
  const groupSigners = writing?.groupSigners.length
    ? `<span class="group-signers">With ${writing.groupSigners.map(esc).join(" · ")}</span>`
    : "";
  const warnings = writing?.contentWarnings.length
    ? `<div class="content-warnings">Note: ${writing.contentWarnings.map(esc).join(" · ")}</div>`
    : "";
  const signature = writing?.signatureDataUrl
    ? `<img class="private-signature" src="${esc(writing.signatureDataUrl)}" alt=""/>`
    : "";
  const lettering = writing?.lettering ?? "template";
  const alignment = writing?.alignment ?? "left";
  const paper = writing?.paper ?? "template";
  const letteringFont = lettering === "handwritten" || lettering === "ballpoint"
    ? "var(--accent)"
    : lettering === "marker"
      ? "var(--display)"
      : lettering === "label-maker" || lettering === "typewriter"
        ? "var(--numeric)"
        : "var(--body)";
  const paperBackground = paper === "lined"
    ? `repeating-linear-gradient(0deg,${identity.paper.baseColor} 0 .28in,${identity.palette.mutedInk}35 .285in)`
    : paper === "notebook"
      ? `linear-gradient(90deg,transparent .27in,${identity.palette.primary}55 .275in,transparent .285in),repeating-linear-gradient(0deg,${identity.paper.baseColor} 0 .28in,${identity.palette.mutedInk}30 .285in)`
      : paper === "editorial"
        ? `linear-gradient(135deg,${identity.paper.baseColor},#fff)`
        : paper === "stat-sheet"
          ? `linear-gradient(${identity.palette.mutedInk}22 1px,transparent 1px),linear-gradient(90deg,${identity.palette.mutedInk}22 1px,${identity.paper.baseColor} 1px)`
          : identity.paper.baseColor;
  const motif = identity.motifs.find((candidate) => candidate.id === variation.motifIds[0]);
  return `<!DOCTYPE html><html><head>${commonHead(identity)}<style>
    .card{background:#fff;color:#181818;font-family:var(--body)}.message-panel{position:absolute;left:0;top:0;width:2.56in;height:4.25in;background:${paperBackground};background-size:${paper === "stat-sheet" ? ".25in .25in" : "auto"};color:${identity.palette.ink};padding:.38in .24in .3in .4in;border-right:.045in ${identity.back.divider === "double-rule" ? "double" : "solid"} ${identity.palette.primary}}
    .back-heading{height:.52in;border-bottom:${identity.back.layout === "late-edition-columns" ? ".045in double" : "2px solid"} ${identity.palette.ink};text-transform:uppercase}.back-heading b{display:block;font:800 10pt/1 var(--display);letter-spacing:.05em}.back-heading span{display:block;margin-top:.06in;font:6pt var(--numeric);letter-spacing:.12em;color:${identity.palette.mutedInk}}.message-label{margin-top:.14in;font:700 6.5pt var(--numeric);letter-spacing:.16em;text-transform:uppercase;color:${identity.palette.primary}}.message{margin-top:.08in;width:1.91in;max-height:${signature ? "2.1in" : "2.45in"};overflow:hidden;font:${printableCharacterCount > 520 ? "6.5pt/1.18" : printableCharacterCount > 360 ? "7.7pt/1.25" : "9.5pt/1.36"} ${letteringFont};text-align:${alignment === "center" ? "center" : "left"};overflow-wrap:break-word;white-space:normal}.private-signature{position:absolute;left:.4in;bottom:.77in;width:1.05in;height:.29in;object-fit:contain;object-position:left center}.sender{position:absolute;left:.4in;bottom:.42in;width:1.85in;font:italic 8.5pt var(--accent)}.group-signers{display:block;margin-top:.035in;font:5.5pt/1.15 var(--body);max-height:.22in;overflow:hidden}.content-warnings{position:absolute;left:${signature ? "1.5in" : ".4in"};right:.24in;bottom:.78in;font:700 5pt var(--numeric);text-transform:uppercase;color:${identity.palette.mutedInk}}.decoration{position:absolute;left:.4in;bottom:.18in;font:700 5.5pt var(--numeric);letter-spacing:.09em;text-transform:uppercase;color:${identity.palette.mutedInk}}
    .dispatch{position:absolute;left:2.91in;right:.35in;top:.34in;height:.72in;display:flex;align-items:center;border-top:2px solid ${identity.palette.primary};border-bottom:1px solid #aaa;padding:.1in 0;color:#222}.dispatch img{width:.43in;height:.43in;object-fit:contain;margin-right:.12in}.dispatch b{display:block;font:800 9pt var(--display);letter-spacing:.08em;text-transform:uppercase}.dispatch span{display:block;font:6.5pt var(--numeric);letter-spacing:.08em;margin-top:.04in;color:#666}.for{position:absolute;left:2.91in;top:1.25in;font:7pt var(--numeric);letter-spacing:.11em;text-transform:uppercase;color:#777}
    /* This exact rectangle is intentionally empty. Lob adds USPS postage and the destination address here. */
    .postal-clear{position:absolute;left:${LOB_POSTAL_CLEAR_ZONE.leftIn}in;top:${LOB_POSTAL_CLEAR_ZONE.topIn}in;width:${LOB_POSTAL_CLEAR_ZONE.widthIn}in;height:${LOB_POSTAL_CLEAR_ZONE.heightIn}in;background:#fff}
  </style></head><body><main class="card" data-back-layout="${identity.back.layout}" data-seed-hash="${variation.seedHash}">
    <section class="message-panel">${backHeader(identity, variation)}<div class="message-label">${esc(identity.back.messageLabel)}</div><div class="message">${message}</div>${signature}${warnings}<div class="sender">${sender}${groupSigners}</div><div class="decoration">${esc(motif?.mark ?? identity.back.decoration)} · ${esc(identity.back.senderLabel)}</div></section>
    <section class="dispatch"><img src="${esc(publicAssetUrl(identity.media.communityLogo))}" alt=""/><div><b>${esc(identity.communityName)} creator dispatch</b><span>Decorative identity mark — not postage</span></div></section><div class="for">Prepared for ${esc(member.mailRecipient)} / address applied by USPS partner</div><div class="postal-clear" aria-hidden="true"></div>
  </main></body></html>`;
}

export type FulfillInput = PostcardInput & { id: string };

export type RenderedPostcardCreative = {
  front: string;
  back: string;
  identityId: string;
  archetypeId: PostcardIdentity["archetype"];
  templateId: string;
  variation: SeededPostcardVariation;
};

export type StoredPostcardCreative = {
  snapshotVersion?: number | null;
  identityId: string | null;
  identityVersion: number | null;
  archetypeId: string | null;
  templateId: string | null;
  rendererVersion: number;
  variationAlgorithmVersion: number;
  resolvedVariation: SeededPostcardVariation | null;
  /** Immutable HTML purchased at checkout. Required outside local sandbox. */
  frontHtml?: string | null;
  backHtml?: string | null;
  creativeHash?: string | null;
};

export const POSTCARD_CREATIVE_SNAPSHOT_VERSION = 1 as const;

export type PostcardCreativeSnapshot = Required<StoredPostcardCreative> & {
  snapshotVersion: typeof POSTCARD_CREATIVE_SNAPSHOT_VERSION;
  identityId: string;
  identityVersion: number;
  archetypeId: PostcardIdentity["archetype"];
  templateId: string;
  resolvedVariation: SeededPostcardVariation;
  frontHtml: string;
  backHtml: string;
  creativeHash: string;
};

export class PostcardPermanentFulfillmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostcardPermanentFulfillmentError";
  }
}

export class PostcardCreativeSnapshotError extends PostcardPermanentFulfillmentError {
  constructor(message: string) {
    super(message);
    this.name = "PostcardCreativeSnapshotError";
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function creativeHashPayload(
  creative: Omit<PostcardCreativeSnapshot, "creativeHash">,
): string {
  return canonicalJson({
    snapshotVersion: creative.snapshotVersion,
    identityId: creative.identityId,
    identityVersion: creative.identityVersion,
    archetypeId: creative.archetypeId,
    templateId: creative.templateId,
    rendererVersion: creative.rendererVersion,
    variationAlgorithmVersion: creative.variationAlgorithmVersion,
    resolvedVariation: creative.resolvedVariation,
    frontHtml: creative.frontHtml,
    backHtml: creative.backHtml,
  });
}

export function hashPostcardCreativeSnapshot(
  creative: Omit<PostcardCreativeSnapshot, "creativeHash">,
): string {
  return createHash("sha256").update(creativeHashPayload(creative), "utf8").digest("hex");
}

function verifiedStoredVariation(
  stored: StoredPostcardCreative | undefined,
  identity: PostcardIdentity,
  design: Pick<PostcardFrontDesign, "id">,
  computed: SeededPostcardVariation,
): SeededPostcardVariation {
  if (!stored) return computed;
  const versionsMatch = stored.rendererVersion === POSTCARD_RENDERER_VERSION
    && stored.identityVersion === POSTCARD_IDENTITY_CATALOG_VERSION
    && stored.variationAlgorithmVersion === POSTCARD_VARIATION_ALGORITHM_VERSION;
  const identityMatches = stored.identityId === identity.slug
    && stored.archetypeId === identity.archetype
    && stored.templateId === design.id;
  const variationMatches = Boolean(stored.resolvedVariation)
    && canonicalJson(stored.resolvedVariation) === canonicalJson(computed);
  if (!versionsMatch || !identityMatches || !variationMatches) {
    throw new Error("Stored postcard creative no longer matches this renderer; refusing to alter paid mail.");
  }
  return stored.resolvedVariation!;
}

/** Build the canonical HTML used for Lob test proofs and physical mail. */
export function renderPostcardCreative(
  input: FulfillInput,
  stored?: StoredPostcardCreative,
): RenderedPostcardCreative {
  const validation = validatePostcardInput(input);
  if (!validation.ok) throw new Error(validation.error);
  const member = MAIL_MEMBERS_BY_SLUG[input.recipientSlug];
  const catalogIdentity = postcardIdentityFor(input.recipientSlug);
  if (!member || !catalogIdentity) throw new Error(`Unknown recipient: ${input.recipientSlug}`);

  let scene: PostcardScene | null = null;
  if (input.draft) {
    const parsed = PostcardDraftSchema.safeParse(input.draft);
    if (!parsed.success) throw new Error("Postcard draft is invalid.");
    const bridge = validatePostcardDraftBridge(input, parsed.data);
    if (!bridge.ok) throw new Error(bridge.error);
    scene = resolvePostcardScene(parsed.data);
    if (!scene) throw new Error("Postcard draft could not be resolved for print.");
  }

  const identity = scene?.identity ?? catalogIdentity;
  const catalogDesign = identity.frontDesigns.find((candidate) => candidate.id === input.designId);
  if (!catalogDesign) throw new Error(`Design ${input.designId} does not belong to ${input.recipientSlug}.`);
  const design = scene
    ? {
        ...scene.design,
        print: {
          ...scene.design.print,
          background: scene.design.background,
          ink: scene.design.ink,
          accent: scene.design.accent,
        },
      }
    : catalogDesign;
  const computedVariation = scene?.variation
    ?? createSeededPostcardVariation(identity, input.variationSeed ?? input.id, design.id);
  const variation = verifiedStoredVariation(stored, identity, design, computedVariation);
  const motifMarks = variation.motifIds.map((motifId) =>
    identity.motifs.find((motif) => motif.id === motifId)?.mark ?? motifId) as [string, string];
  const context: FrontContext = {
    identity,
    design,
    variation,
    art: input.imageDataUrl || publicAssetUrl(identity.media.portrait),
    logo: publicAssetUrl(identity.media.communityLogo),
    motifMarks,
    scene,
  };
  return {
    front: frontHtml(context),
    back: backHtml(input, member, identity, variation, scene),
    identityId: identity.slug,
    archetypeId: identity.archetype,
    templateId: design.id,
    variation,
  };
}

/** Freeze the exact front/back HTML that the fan purchased. */
export function createPostcardCreativeSnapshot(input: FulfillInput): PostcardCreativeSnapshot {
  const rendered = renderPostcardCreative(input);
  const snapshotWithoutHash: Omit<PostcardCreativeSnapshot, "creativeHash"> = {
    snapshotVersion: POSTCARD_CREATIVE_SNAPSHOT_VERSION,
    identityId: rendered.identityId,
    identityVersion: POSTCARD_IDENTITY_CATALOG_VERSION,
    archetypeId: rendered.archetypeId,
    templateId: rendered.templateId,
    rendererVersion: POSTCARD_RENDERER_VERSION,
    variationAlgorithmVersion: POSTCARD_VARIATION_ALGORITHM_VERSION,
    resolvedVariation: rendered.variation,
    frontHtml: rendered.front,
    backHtml: rendered.back,
  };
  return {
    ...snapshotWithoutHash,
    creativeHash: hashPostcardCreativeSnapshot(snapshotWithoutHash),
  };
}

function creativeFromStoredSnapshot(
  input: FulfillInput,
  stored: StoredPostcardCreative | undefined,
): RenderedPostcardCreative {
  if (
    !stored
    || stored.snapshotVersion !== POSTCARD_CREATIVE_SNAPSHOT_VERSION
    || !stored.identityId
    || !stored.identityVersion
    || !stored.archetypeId
    || !stored.templateId
    || !stored.resolvedVariation
    || !stored.frontHtml
    || !stored.backHtml
    || !stored.creativeHash
  ) {
    throw new PostcardCreativeSnapshotError("A complete immutable postcard creative is required.");
  }
  if (
    stored.identityId !== input.recipientSlug
    || stored.templateId !== input.designId
    || stored.resolvedVariation.designId !== input.designId
  ) {
    throw new PostcardCreativeSnapshotError("Stored postcard identity does not match the paid order.");
  }
  const snapshotWithoutHash: Omit<PostcardCreativeSnapshot, "creativeHash"> = {
    snapshotVersion: POSTCARD_CREATIVE_SNAPSHOT_VERSION,
    identityId: stored.identityId,
    identityVersion: stored.identityVersion,
    archetypeId: stored.archetypeId as PostcardIdentity["archetype"],
    templateId: stored.templateId,
    rendererVersion: stored.rendererVersion,
    variationAlgorithmVersion: stored.variationAlgorithmVersion,
    resolvedVariation: stored.resolvedVariation,
    frontHtml: stored.frontHtml,
    backHtml: stored.backHtml,
  };
  const expectedHash = hashPostcardCreativeSnapshot(snapshotWithoutHash);
  if (expectedHash !== stored.creativeHash) {
    throw new PostcardCreativeSnapshotError("Stored postcard creative hash did not verify.");
  }
  return {
    front: stored.frontHtml,
    back: stored.backHtml,
    identityId: stored.identityId,
    archetypeId: snapshotWithoutHash.archetypeId,
    templateId: stored.templateId,
    variation: stored.resolvedVariation,
  };
}

/** Send one already-authorized order to Lob (or simulate in local sandbox). */
export async function sendPostcard(
  input: FulfillInput,
  expectedMode?: PostcardProviderMode,
  stored?: StoredPostcardCreative,
): Promise<FulfillResult> {
  const configuration = resolvePostcardProviderMode();
  if (!configuration.ok) throw new Error(configuration.reason);
  if (expectedMode && expectedMode !== configuration.mode) {
    throw new Error(`Postcard provider mode changed from ${expectedMode} to ${configuration.mode}.`);
  }
  const validation = validatePostcardInput(input);
  if (!validation.ok) throw new PostcardPermanentFulfillmentError(validation.error);
  let sendDate: string | null = null;
  if (input.draft) {
    const parsed = PostcardDraftSchema.safeParse(input.draft);
    if (!parsed.success) throw new PostcardPermanentFulfillmentError("Stored postcard draft is invalid.");
    const bridge = validatePostcardDraftBridge(input, parsed.data);
    if (!bridge.ok) throw new PostcardPermanentFulfillmentError(bridge.error);
    const schedule = validatePostcardSchedule(parsed.data.writing.scheduledFor);
    if (!schedule.ok) throw new PostcardPermanentFulfillmentError(schedule.error);
    if (parsed.data.writing.scheduledFor) {
      if (process.env.LOB_SCHEDULED_MAIL_ENABLED !== "true") {
        throw new PostcardPermanentFulfillmentError("Scheduled postcard mailing is not enabled for this print account.");
      }
      sendDate = new Date(parsed.data.writing.scheduledFor).toISOString().slice(0, 10);
    }
  }
  const member = MAIL_MEMBERS_BY_SLUG[input.recipientSlug];
  if (!member) throw new PostcardPermanentFulfillmentError(`Unknown recipient: ${input.recipientSlug}`);
  const to = destinationFor(member);
  if (!to) {
    throw new PostcardPermanentFulfillmentError(
      `Could not resolve a mailable address for ${input.recipientSlug}`,
    );
  }
  const creative = configuration.mode === "sandbox" && !stored?.frontHtml
    ? renderPostcardCreative(input)
    : creativeFromStoredSnapshot(input, stored);

  if (configuration.mode === "sandbox") {
    return { provider: "lob", id: `sandbox_${input.id}`, status: "sandbox", live: false, mode: "sandbox" };
  }

  if (!hasPostcardReturnAddress(input.returnAddress)) {
    throw new PostcardPermanentFulfillmentError("A verified postcard return address is required.");
  }

  const key = process.env.LOB_API_KEY!;
  const body = {
    description: `CORE fan postcard → ${member.displayName} (${input.id})`,
    to,
    from: returnAddressFor(input.returnAddress),
    front: creative.front,
    back: creative.back,
    size: "4x6",
    mail_type: "usps_first_class",
    use_type: "operational",
    ...(sendDate ? { send_date: sendDate } : {}),
  };
  const response = await fetch("https://api.lob.com/v1/postcards", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.id,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const message = `Lob postcard create failed (${response.status}): ${detail.slice(0, 300)}`;
    if (response.status >= 400 && response.status < 500 && ![408, 409, 425, 429].includes(response.status)) {
      throw new PostcardPermanentFulfillmentError(message);
    }
    throw new Error(message);
  }
  const json = (await response.json()) as { id: string; url?: string };
  return {
    provider: "lob",
    id: json.id,
    status: configuration.mode === "live" ? "printing" : "proof",
    url: json.url,
    live: configuration.mode === "live",
    mode: configuration.mode,
  };
}
