/**
 * Shared (client + server safe) types, pricing, and validation for the
 * automated print-and-mail postcard feature.
 *
 *   Fan customizes a postcard  →  pays via Stripe  →  webhook fulfils via
 *   the Print & Mail API (Lob)  →  physical postcard mailed to the chosen
 *   member's PO box.
 *
 * The destination is ALWAYS resolved from `MAIL_MEMBERS` (trusted data) by
 * slug — a fan never types a destination address. Only their (optional)
 * return address is user-supplied.
 *
 * Do NOT import server-only modules here — this file is pulled into the
 * client studio for pricing + design rendering.
 */
import { MAIL_MEMBERS } from "./fan-mail";
import { postcardIdentityFor } from "./postcard-identities";
import type { PostcardDraft } from "./postcard-draft";
import type { PostcardCollectibleSelection } from "./postcard-collectibles";

export const POSTCARD_LIMITS = {
  /** Max characters in the printed message. Keeps the back legible. */
  message: 380,
  /** Prevent line-break-heavy notes from being clipped by the print-safe pane. */
  messageLines: 10,
  senderName: 60,
  /** Max bytes for an uploaded-art data URL (~600 KB after client resize). */
  imageBytes: 650_000,
  /** Stable per-card seed used for intentional print-safe variation. */
  variationSeed: 80,
} as const;

/** Cents. $3.00 text-only, $4.50 with a custom image. */
export const PRICING = { textCents: 300, imageCents: 450, currency: "usd" } as const;

export function computePriceCents(hasImage: boolean): number {
  return hasImage ? PRICING.imageCents : PRICING.textCents;
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Optional return address the fan may provide (printed as the sender). */
export type ReturnAddress = {
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  zip?: string;
};

/** The payload the client sends to /api/postcard/create-intent. */
export type PostcardInput = {
  /** Slug into MAIL_MEMBERS — resolves the (trusted) destination. */
  recipientSlug: string;
  message: string;
  designId: string;
  /** Optional uploaded art as a normalized JPEG/PNG/WebP data URL. */
  imageDataUrl?: string | null;
  senderName?: string;
  returnAddress?: ReturnAddress | null;
  /** Stable random token so preview and physical output use the same variation. */
  variationSeed?: string;
  /**
   * Optional V2 editor state. The API validates this with PostcardDraftSchema,
   * reconciles every duplicated V1 field, and sanitizes its image assets before
   * it is ever rendered or persisted. Kept optional so paid V1 orders and old
   * clients remain valid.
   */
  draft?: PostcardDraft | null;
  /** Optional server-catalog choice. Serial numbers are never client input. */
  collectibleSelection?: PostcardCollectibleSelection | null;
};

export type PostcardStatus =
  | "created" // order row written, awaiting payment
  | "paid" // payment captured, fulfilment pending
  | "review" // paid custom artwork awaiting an authorized safety review
  | "fulfilling" // atomically claimed by one fulfilment worker
  | "proof" // Lob test proof created; no physical mail was sent
  | "printing" // handed to the print API (live)
  | "mailed" // print API reports in transit / delivered
  | "sent" // sandbox / simulated success
  | "refunding" // an authorized decline leased to one Stripe refund worker
  | "refunded" // custom art was declined and the captured payment refunded
  | "failed";

export type PostcardValidation = { ok: true } | { ok: false; error: string };
export const POSTCARD_SCHEDULE_MAX_DAYS = 180;

const UNSAFE_CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const BASE64_IMAGE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

function decodedImagePrefix(base64: string): Uint8Array | null {
  try {
    const length = Math.min(base64.length, 32);
    const alignedLength = length - (length % 4);
    const decoded = globalThis.atob(base64.slice(0, alignedLength));
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function imageMatchesMime(mime: string, bytes: Uint8Array): boolean {
  if (mime === "jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "png") {
    return bytes.length >= 8
      && bytes[0] === 0x89
      && bytes[1] === 0x50
      && bytes[2] === 0x4e
      && bytes[3] === 0x47
      && bytes[4] === 0x0d
      && bytes[5] === 0x0a
      && bytes[6] === 0x1a
      && bytes[7] === 0x0a;
  }
  return bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50;
}

function validateReturnAddress(address: ReturnAddress | null | undefined): string | null {
  if (!address) return null;
  if (typeof address !== "object" || Array.isArray(address)) return "Bad return address.";

  const limits: ReadonlyArray<[keyof ReturnAddress, number]> = [
    ["name", 60],
    ["line1", 100],
    ["line2", 100],
    ["city", 50],
    ["state", 2],
    ["zip", 10],
  ];
  for (const [key, maximum] of limits) {
    const value = address[key];
    if (value === undefined || value === "") continue;
    if (typeof value !== "string" || value.length > maximum || UNSAFE_CONTROL_CHARACTERS.test(value)) {
      return "Bad return address.";
    }
  }

  const hasAnyValue = limits.some(([key]) => Boolean(address[key]?.trim()));
  if (!hasAnyValue) return null;
  if (!address.line1?.trim() || !address.city?.trim() || !address.state?.trim() || !address.zip?.trim()) {
    return "Complete the street, city, state, and ZIP in your return address.";
  }
  if (!/^[A-Za-z]{2}$/.test(address.state.trim())) return "Use a two-letter state code.";
  if (!/^\d{5}(?:-\d{4})?$/.test(address.zip.trim())) return "Use a valid US ZIP code.";
  return null;
}

/** Server + client input validation (no I/O). */
export function validatePostcardInput(i: Partial<PostcardInput>): PostcardValidation {
  if (!i || typeof i !== "object") return { ok: false, error: "Missing postcard data." };
  if (typeof i.recipientSlug !== "string" || !MAIL_MEMBERS.some((m) => m.slug === i.recipientSlug)) {
    return { ok: false, error: "Pick who you're sending to." };
  }
  const identity = postcardIdentityFor(i.recipientSlug);
  if (!identity || typeof i.designId !== "string" || !identity.frontDesigns.some((design) => design.id === i.designId)) {
    return { ok: false, error: "Pick a design made for this recipient." };
  }
  if (typeof i.message !== "string") return { ok: false, error: "Write a message first." };
  const msg = i.message.trim();
  if (msg.length < 2) return { ok: false, error: "Write a message first." };
  if (msg.length > POSTCARD_LIMITS.message) {
    return { ok: false, error: `Message is too long (max ${POSTCARD_LIMITS.message} characters).` };
  }
  if (msg.split(/\r\n?|\n/).length > POSTCARD_LIMITS.messageLines) {
    return { ok: false, error: `Message has too many lines (max ${POSTCARD_LIMITS.messageLines}).` };
  }
  if (UNSAFE_CONTROL_CHARACTERS.test(msg)) return { ok: false, error: "Message contains unsupported characters." };
  if (
    i.senderName !== undefined
    && (typeof i.senderName !== "string"
      || i.senderName.length > POSTCARD_LIMITS.senderName
      || UNSAFE_CONTROL_CHARACTERS.test(i.senderName))
  ) {
    return { ok: false, error: "Your name is too long." };
  }
  if (
    i.variationSeed !== undefined
    && (typeof i.variationSeed !== "string"
      || i.variationSeed.length === 0
      || i.variationSeed.length > POSTCARD_LIMITS.variationSeed
      || !/^[A-Za-z0-9_-]+$/.test(i.variationSeed))
  ) {
    return { ok: false, error: "Bad postcard variation." };
  }
  if (i.imageDataUrl !== undefined && i.imageDataUrl !== null && i.imageDataUrl !== "") {
    if (typeof i.imageDataUrl !== "string") return { ok: false, error: "Bad image." };
    const match = BASE64_IMAGE.exec(i.imageDataUrl);
    if (!match || match[2]!.length % 4 !== 0) {
      return { ok: false, error: "Image must be a JPEG, PNG, or WebP upload." };
    }
    const base64 = match[2]!;
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    const decodedBytes = (base64.length / 4) * 3 - padding;
    if (decodedBytes > POSTCARD_LIMITS.imageBytes) {
      return { ok: false, error: "Image is too large — try a smaller file." };
    }
    const prefix = decodedImagePrefix(base64);
    if (!prefix || !imageMatchesMime(match[1]!, prefix)) {
      return { ok: false, error: "Image data does not match its file type." };
    }
  }
  const returnAddressError = validateReturnAddress(i.returnAddress);
  if (returnAddressError) return { ok: false, error: returnAddressError };
  if (i.draft !== undefined && i.draft !== null && (typeof i.draft !== "object" || Array.isArray(i.draft))) {
    return { ok: false, error: "Bad postcard draft." };
  }
  return { ok: true };
}

function sameCheckoutText(left: string | null | undefined, right: string | null | undefined): boolean {
  return (left ?? "").trim() === (right ?? "").trim();
}

/**
 * Reconcile the compatibility payload with an already schema-validated draft.
 * A rich draft may never silently override the recipient, design, copy, sender,
 * or deterministic variation shown by the established checkout fields.
 */
export function validatePostcardDraftBridge(
  input: Pick<PostcardInput, "recipientSlug" | "designId" | "message" | "senderName" | "variationSeed" | "imageDataUrl">,
  draft: PostcardDraft,
): PostcardValidation {
  if (draft.recipientSlug !== input.recipientSlug) {
    return { ok: false, error: "Postcard draft recipient does not match checkout." };
  }
  if (draft.designId !== input.designId) {
    return { ok: false, error: "Postcard draft design does not match checkout." };
  }
  if (!sameCheckoutText(draft.writing.message, input.message)) {
    return { ok: false, error: "Postcard draft message does not match checkout." };
  }
  if (!sameCheckoutText(draft.writing.senderName, input.senderName)) {
    return { ok: false, error: "Postcard draft sender does not match checkout." };
  }
  if (!input.variationSeed || draft.variationSeed !== input.variationSeed) {
    return { ok: false, error: "Postcard draft variation does not match checkout." };
  }
  if (draft.collectible.serial !== null) {
    return { ok: false, error: "Collectible serials are issued only after checkout." };
  }
  if (draft.writing.signatureAssetId) {
    return { ok: false, error: "Saved signature assets are not available for print checkout yet." };
  }
  const writingSideText = [
    draft.writing.greeting,
    draft.writing.message,
    draft.writing.featuredQuote,
    draft.writing.whyMomentMattered,
    draft.writing.secondaryMessage,
    draft.writing.signoff,
    ...draft.writing.groupSigners,
  ].filter(Boolean).join("\n");
  if (writingSideText.length > 720 || writingSideText.split(/\r\n?|\n/).length > 22) {
    return { ok: false, error: "The writing side has too much copy to print safely." };
  }

  // `imageDataUrl` is retained as a V1 compatibility alias. When a V2 draft is
  // present it may only repeat the first embedded slot, never smuggle a hidden
  // image into pricing, moderation, or the review queue.
  if (input.imageDataUrl) {
    const first = [...draft.photoSlots]
      .sort((left, right) => left.position - right.position)
      .find((slot) => slot.asset?.source.kind === "embedded");
    if (first?.asset?.source.kind !== "embedded" || first.asset.source.dataUrl !== input.imageDataUrl) {
      return { ok: false, error: "Postcard image does not match the draft." };
    }
  }
  return { ok: true };
}

/** Lob accepts a future mailing date no more than 180 days ahead. */
export function validatePostcardSchedule(
  scheduledFor: string | null | undefined,
  now = new Date(),
): PostcardValidation {
  if (!scheduledFor) return { ok: true };
  const scheduled = new Date(scheduledFor);
  if (Number.isNaN(scheduled.getTime())) {
    return { ok: false, error: "Scheduled mailing date is invalid." };
  }
  // Lob's send_date is a calendar date (YYYY-MM-DD), not a delivery time.
  // Compare normalized UTC calendar days so a time later today cannot be
  // misleadingly reduced to today's date at provider submission.
  const scheduledDay = Date.UTC(scheduled.getUTCFullYear(), scheduled.getUTCMonth(), scheduled.getUTCDate());
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const delta = scheduledDay - today;
  if (delta <= 0) return { ok: false, error: "Scheduled mailing date must be a future day." };
  if (delta > POSTCARD_SCHEDULE_MAX_DAYS * 24 * 60 * 60 * 1_000) {
    return { ok: false, error: `Scheduled mailing date must be within ${POSTCARD_SCHEDULE_MAX_DAYS} days.` };
  }
  return { ok: true };
}

/** Every fan-editable string sent through the same moderation gate. */
export function collectPostcardDraftModerationText(draft: PostcardDraft): string[] {
  const values = [
    draft.writing.message,
    draft.writing.greeting,
    draft.writing.signoff,
    draft.writing.senderName,
    draft.writing.savedSignatureLabel,
    ...draft.writing.groupSigners,
    draft.writing.featuredQuote,
    draft.writing.whyMomentMattered,
    draft.writing.secondaryMessage,
    ...draft.writing.contentWarnings,
    draft.fields.headline,
    draft.fields.caption,
    draft.fields.issueNumber,
    draft.fields.date,
    draft.fields.score,
    draft.fields.location,
    ...draft.fields.stats.flatMap((stat) => [stat.label, stat.value]),
    ...Object.entries(draft.creatorFields.values).flatMap(([fieldId, value]) => [fieldId, value]),
    draft.memory.occasion,
    draft.memory.happenedOn,
    draft.memory.location,
    draft.memory.people,
    draft.memory.favoriteMoment,
    draft.memory.whyItMattered,
    draft.memory.insideJoke,
    ...draft.photoSlots.flatMap((slot) => [
      slot.caption,
      slot.asset?.altText ?? "",
      slot.asset?.source.kind === "core-moment" ? slot.asset.source.attribution : "",
    ]),
  ];
  return values.map((value) => value.trim()).filter(Boolean);
}
