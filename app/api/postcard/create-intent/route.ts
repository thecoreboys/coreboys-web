import { NextResponse } from "next/server";
import {
  validatePostcardInput,
  validatePostcardDraftBridge,
  validatePostcardSchedule,
  collectPostcardDraftModerationText,
  computePriceCents,
  PRICING,
  type PostcardInput,
} from "@/lib/postcard";
import {
  PostcardDraftSchema,
  type PostcardDraft,
} from "@/lib/postcard-draft";
import { moderateText } from "@/lib/moderation";
import { getStripe } from "@/lib/stripe";
import {
  insertPostcardOrder,
  attachPaymentIntent,
  getPostcardOrder,
  setOrderStatus,
} from "@/lib/postcard-store";
import { fulfillOrder } from "@/lib/postcard-fulfill";
import { resolvePostcardProviderMode } from "@/lib/postcard-mode";
import {
  createPostcardCreativeSnapshot,
  hasPostcardReturnAddress,
} from "@/lib/print-mail";
import {
  MAX_POSTCARD_SIGNATURE_BYTES,
  normalizePostcardImage,
  normalizePostcardSignature,
} from "@/lib/postcard-image";
import { resolveAuthorizedPostcardMoment } from "@/lib/postcard-moments";
import {
  createPostcardStatusToken,
  hashPostcardStatusToken,
} from "@/lib/postcard-access";
import {
  consumePostcardRequest,
  isTrustedPostcardRequest,
  postcardRequestKey,
} from "@/lib/postcard-request-guard";
import { PostcardCollectibleCheckoutSelectionSchema } from "@/lib/postcard-collectibles";
import {
  PostcardCollectibleInfrastructureError,
  PostcardCollectibleUnavailableError,
} from "@/lib/postcard-collectible-store";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { materializeManagedPostcardAssetSource } from "@/lib/postcard-managed-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Six schema-bounded image slots plus the temporary V1 first-image alias.
// Both the declared length and bytes actually read are enforced.
const MAX_POSTCARD_REQUEST_BYTES = 6_750_000;
const MAX_POSTCARD_ASSET_BYTES = 650_000;
const MAX_POSTCARD_ASSET_COUNT = 6;
const MAX_POSTCARD_AGGREGATE_IMAGE_BYTES =
  MAX_POSTCARD_ASSET_BYTES * MAX_POSTCARD_ASSET_COUNT + MAX_POSTCARD_SIGNATURE_BYTES;

function dataUrlBytes(value: string): number {
  const comma = value.indexOf(",");
  const base64 = comma >= 0 ? value.slice(comma + 1) : "";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, (base64.length / 4) * 3 - padding);
}

async function readBoundedJson(req: Request): Promise<unknown> {
  if (!req.body) throw new Error("Missing request body.");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_POSTCARD_REQUEST_BYTES) {
      await reader.cancel("Postcard request is too large.");
      throw new RangeError("Postcard request is too large.");
    }
    chunks.push(value);
  }
  if (total === 0) throw new SyntaxError("Missing request body.");
  return JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total).toString("utf8")) as unknown;
}

function momentImageUrl(value: string): string {
  if (value.startsWith("/") && !value.startsWith("//")) {
    return `https://media.thecoreboys.com${value}`;
  }
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Authorized moment image URL is not safe.");
  }
  return url.toString();
}

function imageMime(value: string | null, bytes: Uint8Array): "jpeg" | "png" | "webp" {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "png";
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "webp";
  // Keep the header only for a useful diagnostic; bytes remain authoritative.
  const mime = value?.split(";", 1)[0]?.trim().toLowerCase();
  if (mime === "image/jpeg" || mime === "image/jpg" || mime === "image/png" || mime === "image/webp") {
    throw new Error("Authorized moment image data did not match its content type.");
  }
  throw new Error("Authorized moment did not return a supported image.");
}

async function downloadAuthorizedMomentImage(value: string): Promise<string> {
  const response = await fetch(momentImageUrl(value), {
    headers: { Accept: "image/jpeg,image/png,image/webp" },
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok || !response.body) throw new Error("Authorized moment image was unavailable.");
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_POSTCARD_ASSET_BYTES) {
    throw new Error("Authorized moment image is too large.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    total += chunk.byteLength;
    if (total > MAX_POSTCARD_ASSET_BYTES) {
      await reader.cancel("Authorized moment image is too large.");
      throw new Error("Authorized moment image is too large.");
    }
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
  if (bytes.length === 0) throw new Error("Authorized moment image was empty.");
  const mime = imageMime(response.headers.get("content-type"), bytes);
  return `data:image/${mime};base64,${bytes.toString("base64")}`;
}

type NormalizedDraftResult = {
  draft: PostcardDraft;
  assetCount: number;
  firstImage: string | null;
  hasPrivateSignature: boolean;
};

/** Resolve all source authority and sanitize each independently editable slot. */
async function normalizeDraftForCheckout(value: PostcardDraft): Promise<NormalizedDraftResult> {
  const draft = structuredClone(value);
  let assetCount = 0;
  let aggregateBytes = 0;
  let firstImage: string | null = null;
  const normalizedSignature = await normalizePostcardSignature(draft.writing.signatureDataUrl);
  draft.writing.signatureDataUrl = normalizedSignature;
  if (normalizedSignature) aggregateBytes += dataUrlBytes(normalizedSignature);
  const slots = [...draft.photoSlots].sort((left, right) => left.position - right.position);
  for (const slot of slots) {
    const asset = slot.asset;
    if (!asset) continue;
    assetCount += 1;
    if (assetCount > MAX_POSTCARD_ASSET_COUNT) throw new Error("Too many postcard images.");

    let submittedImage: string;
    if (asset.source.kind === "embedded") {
      submittedImage = asset.source.dataUrl;
    } else if (asset.source.kind === "core-moment") {
      // Ignore every client-provided URL and attribution field. Only the opaque
      // moment ID is accepted, then re-resolved from the current server catalog.
      const moment = await resolveAuthorizedPostcardMoment(asset.source.momentId);
      if (!moment) throw new Error("That CORE moment is no longer available.");
      submittedImage = await downloadAuthorizedMomentImage(moment.imageUrl);
      if (!asset.altText.trim()) asset.altText = `${moment.title} — ${moment.attribution}`.slice(0, 240);
    } else {
      // The client preview is display-only. Resolve the opaque ID against the
      // current recipient-scoped published revision and download its approved
      // server URL before the standard image sanitizer runs.
      submittedImage = await materializeManagedPostcardAssetSource(asset.source, {
        recipientSlug: draft.recipientSlug,
        designId: draft.designId,
      });
    }

    const normalized = await normalizePostcardImage(submittedImage, {
      preserveAlpha: slot.adjustments.backgroundRemoved,
    });
    if (!normalized) throw new Error("Postcard image normalization returned no image.");
    aggregateBytes += dataUrlBytes(normalized);
    if (aggregateBytes > MAX_POSTCARD_AGGREGATE_IMAGE_BYTES) {
      throw new Error("Postcard images are too large together.");
    }
    asset.source = { kind: "embedded", origin: "upload", dataUrl: normalized };
    firstImage ??= normalized;
  }
  return {
    draft: PostcardDraftSchema.parse(draft),
    assetCount,
    firstImage,
    hasPrivateSignature: Boolean(normalizedSignature),
  };
}

/**
 * Starts a postcard order:
 *   1. validate + moderate the message
 *   2. persist the order (status `created`)
 *   3. if Stripe is configured → create a PaymentIntent, return clientSecret
 *      (the frontend confirms with Stripe Elements; the webhook fulfils)
 *   4. if NOT configured (sandbox) → simulate success + fulfil immediately
 */
export async function POST(req: Request) {
  if (!isTrustedPostcardRequest(req)) {
    return NextResponse.json({ error: "Postcard request origin was not accepted." }, { status: 403 });
  }
  const requestLimit = consumePostcardRequest(postcardRequestKey(req));
  if (!requestLimit.ok) {
    const retryAfter = Math.max(1, Math.ceil((requestLimit.resetAt - Date.now()) / 1_000));
    return NextResponse.json(
      { error: "Too many postcard attempts. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": new Date(requestLimit.resetAt).toISOString(),
        },
      },
    );
  }
  const contentLengthHeader = req.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : Number.NaN;
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
    return NextResponse.json({ error: "A content length is required." }, { status: 411 });
  }
  if (contentLength > MAX_POSTCARD_REQUEST_BYTES) {
    return NextResponse.json({ error: "Postcard request is too large." }, { status: 413 });
  }
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Postcard request must be JSON." }, { status: 415 });
  }

  let input: Partial<PostcardInput>;
  try {
    input = (await readBoundedJson(req)) as Partial<PostcardInput>;
  } catch (error) {
    if (error instanceof RangeError) {
      return NextResponse.json({ error: "Postcard request is too large." }, { status: 413 });
    }
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const v = validatePostcardInput(input);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const data = input as PostcardInput;

  let draft: PostcardDraft | null = null;
  if (data.draft !== undefined && data.draft !== null) {
    const parsed = PostcardDraftSchema.safeParse(data.draft);
    if (!parsed.success) {
      return NextResponse.json({ error: "Postcard draft is invalid." }, { status: 400 });
    }
    draft = parsed.data;
    const bridge = validatePostcardDraftBridge(data, draft);
    if (!bridge.ok) return NextResponse.json({ error: bridge.error }, { status: 400 });
    const schedule = validatePostcardSchedule(draft.writing.scheduledFor);
    if (!schedule.ok) return NextResponse.json({ error: schedule.error }, { status: 400 });
    if (draft.writing.scheduledFor && process.env.LOB_SCHEDULED_MAIL_ENABLED !== "true") {
      return NextResponse.json(
        { error: "Scheduled postcard mailing is not enabled for this print account." },
        { status: 503 },
      );
    }
  }

  let collectibleSelection = null;
  if (data.collectibleSelection !== undefined && data.collectibleSelection !== null) {
    const parsed = PostcardCollectibleCheckoutSelectionSchema.safeParse(data.collectibleSelection);
    if (!parsed.success) {
      return NextResponse.json({ error: "Collectible selection is invalid." }, { status: 400 });
    }
    collectibleSelection = parsed.data;
    if (
      !draft
      || draft.collectible.releaseId !== collectibleSelection.releaseId
      || draft.collectible.variantId !== collectibleSelection.variantId
      || !draft.collectible.setId
    ) {
      return NextResponse.json({ error: "Collectible selection does not match the postcard draft." }, { status: 400 });
    }
  }

  const fanUserId = await getCurrentFanUserId();
  if (collectibleSelection && !fanUserId) {
    return NextResponse.json({ error: "Sign in before choosing a collectible release." }, { status: 401 });
  }

  const configuration = resolvePostcardProviderMode();
  if (!configuration.ok) {
    console.error("[postcard] invalid provider configuration:", configuration.reason);
    return NextResponse.json({ error: "Postcard checkout is temporarily unavailable." }, { status: 503 });
  }
  if (configuration.mode !== "sandbox" && !hasPostcardReturnAddress(data.returnAddress)) {
    return NextResponse.json(
      { error: "Add a complete US return address before paying for this postcard." },
      { status: 400 },
    );
  }
  if (collectibleSelection && configuration.mode !== "live") {
    return NextResponse.json(
      { error: "Collectible releases are available only for live mailed postcards." },
      { status: 409 },
    );
  }

  const moderationText = draft
    ? collectPostcardDraftModerationText(draft).join("\n")
    : [data.message, data.senderName].filter(Boolean).join("\n");
  const mod = await moderateText(moderationText);
  if (!mod.ok) {
    return NextResponse.json({ error: mod.reason ?? "Message rejected." }, { status: 422 });
  }

  let normalizedImage: string | null;
  let normalizedDraft: PostcardDraft | null = null;
  let assetCount = 0;
  let hasPrivateSignature = false;
  try {
    if (draft) {
      const normalized = await normalizeDraftForCheckout(draft);
      normalizedDraft = normalized.draft;
      normalizedImage = normalized.firstImage;
      assetCount = normalized.assetCount;
      hasPrivateSignature = normalized.hasPrivateSignature;
    } else {
      normalizedImage = await normalizePostcardImage(data.imageDataUrl);
      assetCount = normalizedImage ? 1 : 0;
    }
  } catch (error) {
    console.error("[postcard] image normalization rejected upload", error);
    return NextResponse.json({ error: "That image could not be prepared safely for print." }, { status: 400 });
  }

  const hasCustomArt = assetCount > 0 || hasPrivateSignature;
  const amountCents = computePriceCents(hasCustomArt);
  const orderId = globalThis.crypto.randomUUID();
  const orderInput: PostcardInput = {
    ...data,
    imageDataUrl: normalizedImage,
    draft: normalizedDraft,
    variationSeed: data.variationSeed ?? orderId.replaceAll("-", "_"),
    collectibleSelection,
  };
  const statusToken = createPostcardStatusToken();

  let creative: ReturnType<typeof createPostcardCreativeSnapshot>;
  try {
    // Freeze the exact HTML before payment so a later deployment or catalog
    // edit cannot silently change a card the fan already purchased.
    creative = createPostcardCreativeSnapshot({ id: orderId, ...orderInput });
  } catch (error) {
    console.error("[postcard] creative snapshot failed", error);
    return NextResponse.json({ error: "Could not prepare that postcard for print." }, { status: 500 });
  }

  try {
    await insertPostcardOrder({
      id: orderId,
      input: orderInput,
      amountCents,
      moderation: "passed",
      providerMode: configuration.mode,
      creative,
      statusTokenHash: hashPostcardStatusToken(statusToken),
      hasCustomArt,
      assetCount,
      fanUserId,
      collectibleSelection,
    });
  } catch (err) {
    if (err instanceof PostcardCollectibleUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof PostcardCollectibleInfrastructureError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (collectibleSelection) {
      console.error("[postcard] collectible order insert failed", err);
      return NextResponse.json({ error: "Could not reserve that collectible selection. Try again." }, { status: 503 });
    }
    if (configuration.mode === "sandbox") {
      console.warn(
        "[postcard] sandbox ledger unavailable; continuing with an ephemeral simulation",
        err instanceof Error ? err.message : err,
      );
      // Local demos remain usable while offline or before Postgres is wired.
      // The creative was fully validated/rendered above, and this branch has
      // no payment or print-provider credentials, so it can only simulate.
      return NextResponse.json({
        sandbox: true,
        orderId,
        statusToken,
        amountCents,
        status: "sent",
        providerMode: "sandbox",
        ephemeral: true,
      });
    }
    console.error("[postcard] insert failed", err);
    return NextResponse.json({ error: "Could not start your order. Try again." }, { status: 500 });
  }

  // Fully keyless sandbox. A Lob key without a matched Stripe key was already
  // rejected above, so this branch can never spend money or create real mail.
  if (configuration.mode === "sandbox") {
    let status = "sent";
    const order = await getPostcardOrder(orderId);
    if (order) {
      const f = await fulfillOrder(order);
      status = f.status;
      if (!f.ok) {
        return NextResponse.json(
          { error: "Could not complete the local postcard simulation." },
          { status: 500 },
        );
      }
    }
    return NextResponse.json({
      sandbox: true,
      orderId,
      statusToken,
      amountCents,
      status,
      providerMode: "sandbox",
    });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Postcard checkout is temporarily unavailable." }, { status: 503 });
  }

  try {
    const pi = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: PRICING.currency,
      metadata: {
        orderId,
        kind: "postcard",
        recipient: orderInput.recipientSlug,
        providerMode: configuration.mode,
      },
      description: `CORE fan postcard → ${orderInput.recipientSlug}`,
      automatic_payment_methods: { enabled: true },
    });
    if (!pi.client_secret) throw new Error("Stripe did not return a PaymentIntent client secret.");
    await attachPaymentIntent(orderId, pi.id);
    return NextResponse.json({
      clientSecret: pi.client_secret,
      orderId,
      statusToken,
      amountCents,
      providerMode: configuration.mode,
    });
  } catch (err) {
    console.error("[postcard] paymentIntent failed", err);
    await setOrderStatus(orderId, "failed").catch((statusError) => {
      console.error("[postcard] could not close failed order", statusError);
    });
    return NextResponse.json({ error: "Payment setup failed." }, { status: 502 });
  }
}
