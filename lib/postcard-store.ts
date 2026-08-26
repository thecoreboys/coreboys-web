/**
 * Server-only persistence for postcard orders — a permanent ledger of
 * every fan postcard processed and the revenue it generated. Schema is
 * created lazily + idempotently (mirrors ensureInstagramSchema in db.ts);
 * no standalone migration runner is required.
 */
import { query, withTransaction } from "./db";
import {
  type PostcardArchetype,
  type SeededPostcardVariation,
} from "./postcard-identities";
import type { PostcardProviderMode } from "./postcard-mode";
import type { PostcardInput, PostcardStatus, ReturnAddress } from "./postcard";
import type { PostcardDraft } from "./postcard-draft";
import type { PostcardCreativeSnapshot } from "./print-mail";
import type { PostcardCollectibleSelection } from "./postcard-collectibles";
import {
  cancelPostcardCollectibleReservation,
  insertPostcardCollectibleOrderIntent,
} from "./postcard-collectible-store";

export type PostcardOrder = {
  id: string;
  fanUserId: string | null;
  recipientSlug: string;
  message: string;
  designId: string;
  imageUrl: string | null;
  draftCreative: PostcardDraft | null;
  hasCustomArt: boolean;
  assetCount: number;
  senderName: string | null;
  returnAddress: ReturnAddress | null;
  variationSeed: string | null;
  providerMode: PostcardProviderMode;
  snapshotVersion: number | null;
  identityId: string | null;
  identityVersion: number | null;
  archetypeId: PostcardArchetype | null;
  templateId: string | null;
  rendererVersion: number;
  variationAlgorithmVersion: number;
  resolvedVariation: SeededPostcardVariation | null;
  creativeFrontHtml: string | null;
  creativeBackHtml: string | null;
  creativeHash: string | null;
  amountCents: number;
  currency: string;
  status: PostcardStatus;
  stripePaymentIntent: string | null;
  providerId: string | null;
  providerUrl: string | null;
  statusTokenHash: string | null;
  fulfillmentAttempts: number;
  lastFulfillmentError: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  moderation: string | null;
  createdAt: string;
  updatedAt: string;
};

let __schemaReady: Promise<void> | null = null;

export async function ensurePostcardSchema(): Promise<void> {
  if (__schemaReady) return __schemaReady;
  __schemaReady = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS postcard_orders (
        id                    TEXT PRIMARY KEY,
        fan_user_id           TEXT,
        recipient_slug        TEXT NOT NULL,
        message               TEXT NOT NULL,
        design_id             TEXT,
        image_url             TEXT,
        draft_creative        JSONB,
        has_custom_art        BOOLEAN NOT NULL DEFAULT FALSE,
        asset_count           INTEGER NOT NULL DEFAULT 0,
        sender_name           TEXT,
        return_address        JSONB,
        variation_seed        TEXT,
        provider_mode         TEXT NOT NULL DEFAULT 'sandbox',
        snapshot_version      INTEGER,
        identity_id           TEXT,
        identity_version      INTEGER,
        archetype_id          TEXT,
        template_id           TEXT,
        renderer_version      INTEGER NOT NULL DEFAULT 1,
        variation_algorithm_version INTEGER NOT NULL DEFAULT 1,
        resolved_variation    JSONB,
        creative_front_html   TEXT,
        creative_back_html    TEXT,
        creative_hash         TEXT,
        amount_cents          INTEGER NOT NULL,
        currency              TEXT NOT NULL DEFAULT 'usd',
        status                TEXT NOT NULL DEFAULT 'created',
        stripe_payment_intent TEXT UNIQUE,
        provider_id           TEXT,
        provider_url          TEXT,
        status_token_hash     TEXT,
        fulfillment_attempts  INTEGER NOT NULL DEFAULT 0,
        last_fulfillment_error TEXT,
        reviewed_by           TEXT,
        reviewed_at           TIMESTAMPTZ,
        moderation            TEXT,
        tracking              JSONB,
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(
      `CREATE INDEX IF NOT EXISTS postcard_orders_pi_idx ON postcard_orders (stripe_payment_intent)`,
    );
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS variation_seed TEXT`);
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS fan_user_id TEXT`);
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS draft_creative JSONB`);
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS has_custom_art BOOLEAN NOT NULL DEFAULT FALSE`);
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS asset_count INTEGER NOT NULL DEFAULT 0`);
    await query(`UPDATE postcard_orders SET has_custom_art = TRUE, asset_count = GREATEST(asset_count, 1) WHERE image_url IS NOT NULL AND (NOT has_custom_art OR asset_count = 0)`);
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS provider_mode TEXT NOT NULL DEFAULT 'sandbox'`);
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS snapshot_version INTEGER`);
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS identity_id TEXT`);
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS identity_version INTEGER`);
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS archetype_id TEXT`);
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS template_id TEXT`);
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS renderer_version INTEGER NOT NULL DEFAULT 1`);
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS variation_algorithm_version INTEGER NOT NULL DEFAULT 1`);
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS resolved_variation JSONB`);
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS creative_front_html TEXT`);
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS creative_back_html TEXT`);
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS creative_hash TEXT`);
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS provider_url TEXT`);
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS status_token_hash TEXT`);
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS fulfillment_attempts INTEGER NOT NULL DEFAULT 0`);
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS last_fulfillment_error TEXT`);
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS reviewed_by TEXT`);
    await query(`ALTER TABLE postcard_orders ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`);
    await query(`CREATE INDEX IF NOT EXISTS postcard_orders_status_idx ON postcard_orders (status, created_at DESC)`);
  })().catch((err) => {
    __schemaReady = null;
    throw err;
  });
  return __schemaReady;
}

type Row = {
  id: string;
  fan_user_id: string | null;
  recipient_slug: string;
  message: string;
  design_id: string | null;
  image_url: string | null;
  draft_creative: PostcardDraft | null;
  has_custom_art: boolean;
  asset_count: number;
  sender_name: string | null;
  return_address: ReturnAddress | null;
  variation_seed: string | null;
  provider_mode: PostcardProviderMode;
  snapshot_version: number | null;
  identity_id: string | null;
  identity_version: number | null;
  archetype_id: PostcardArchetype | null;
  template_id: string | null;
  renderer_version: number;
  variation_algorithm_version: number;
  resolved_variation: SeededPostcardVariation | null;
  creative_front_html: string | null;
  creative_back_html: string | null;
  creative_hash: string | null;
  amount_cents: number;
  currency: string;
  status: PostcardStatus;
  stripe_payment_intent: string | null;
  provider_id: string | null;
  provider_url: string | null;
  status_token_hash: string | null;
  fulfillment_attempts: number;
  last_fulfillment_error: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  moderation: string | null;
  created_at: string;
  updated_at: string;
};

function toOrder(r: Row): PostcardOrder {
  return {
    id: r.id,
    fanUserId: r.fan_user_id,
    recipientSlug: r.recipient_slug,
    message: r.message,
    designId: r.design_id ?? "ironbow",
    imageUrl: r.image_url,
    draftCreative: r.draft_creative,
    hasCustomArt: r.has_custom_art,
    assetCount: r.asset_count,
    senderName: r.sender_name,
    returnAddress: r.return_address,
    variationSeed: r.variation_seed,
    providerMode: r.provider_mode,
    snapshotVersion: r.snapshot_version,
    identityId: r.identity_id,
    identityVersion: r.identity_version,
    archetypeId: r.archetype_id,
    templateId: r.template_id,
    rendererVersion: r.renderer_version,
    variationAlgorithmVersion: r.variation_algorithm_version,
    resolvedVariation: r.resolved_variation,
    creativeFrontHtml: r.creative_front_html,
    creativeBackHtml: r.creative_back_html,
    creativeHash: r.creative_hash,
    amountCents: r.amount_cents,
    currency: r.currency,
    status: r.status,
    stripePaymentIntent: r.stripe_payment_intent,
    providerId: r.provider_id,
    providerUrl: r.provider_url,
    statusTokenHash: r.status_token_hash,
    fulfillmentAttempts: r.fulfillment_attempts,
    lastFulfillmentError: r.last_fulfillment_error,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at
      ? (typeof r.reviewed_at === "string" ? r.reviewed_at : new Date(r.reviewed_at).toISOString())
      : null,
    moderation: r.moderation,
    createdAt: typeof r.created_at === "string" ? r.created_at : new Date(r.created_at).toISOString(),
    updatedAt: typeof r.updated_at === "string" ? r.updated_at : new Date(r.updated_at).toISOString(),
  };
}

export async function insertPostcardOrder(args: {
  id: string;
  input: PostcardInput;
  amountCents: number;
  moderation: string;
  providerMode: PostcardProviderMode;
  creative: PostcardCreativeSnapshot;
  statusTokenHash: string;
  hasCustomArt: boolean;
  assetCount: number;
  fanUserId?: string | null;
  collectibleSelection?: PostcardCollectibleSelection | null;
}): Promise<void> {
  await ensurePostcardSchema();
  const {
    id,
    input,
    amountCents,
    moderation,
    providerMode,
    creative,
    statusTokenHash,
    hasCustomArt,
    assetCount,
    fanUserId = null,
    collectibleSelection = null,
  } = args;
  if (
    creative.identityId !== input.recipientSlug
    || creative.templateId !== input.designId
    || creative.resolvedVariation.designId !== input.designId
    || !creative.frontHtml
    || !creative.backHtml
    || !/^[0-9a-f]{64}$/i.test(creative.creativeHash)
  ) {
    throw new Error("Postcard creative snapshot does not match the order input.");
  }
  if (!/^[0-9a-f]{64}$/i.test(statusTokenHash)) {
    throw new Error("Postcard status token hash is invalid.");
  }
  const draftAssetCount = input.draft?.photoSlots.filter((slot) => Boolean(slot.asset)).length
    ?? (input.imageDataUrl ? 1 : 0);
  const expectedCustomArt = draftAssetCount > 0 || Boolean(input.draft?.writing.signatureDataUrl);
  if (
    !Number.isInteger(assetCount)
    || assetCount < 0
    || assetCount > 6
    || assetCount !== draftAssetCount
    || hasCustomArt !== expectedCustomArt
  ) {
    throw new Error("Postcard asset metadata does not match the normalized creative.");
  }
  if (collectibleSelection && !fanUserId) {
    throw new Error("A signed-in fan is required for a collectible postcard.");
  }
  const collectibleSetId = input.draft?.collectible.setId ?? null;
  if (collectibleSelection && !collectibleSetId) {
    throw new Error("A collectible checkout requires its server catalog set.");
  }
  const orderSql = `INSERT INTO postcard_orders
       (id, fan_user_id, recipient_slug, message, design_id, image_url, draft_creative,
        has_custom_art, asset_count, sender_name, return_address,
        variation_seed, provider_mode, snapshot_version, identity_id, identity_version,
        archetype_id, template_id, renderer_version, variation_algorithm_version,
        resolved_variation, creative_front_html, creative_back_html, creative_hash,
        amount_cents, status, status_token_hash, moderation)
     VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
       $21,$22,$23,$24,$25,$26,'created',$27,$28
     )`;
  const orderValues = [
      id,
      fanUserId,
      input.recipientSlug,
      input.message.trim(),
      input.designId,
      input.imageDataUrl ?? null,
      input.draft ? JSON.stringify(input.draft) : null,
      hasCustomArt,
      assetCount,
      input.senderName ?? null,
      input.returnAddress ? JSON.stringify(input.returnAddress) : null,
      input.variationSeed ?? null,
      providerMode,
      creative.snapshotVersion,
      creative.identityId,
      creative.identityVersion,
      creative.archetypeId,
      creative.templateId,
      creative.rendererVersion,
      creative.variationAlgorithmVersion,
      JSON.stringify(creative.resolvedVariation),
      creative.frontHtml,
      creative.backHtml,
      creative.creativeHash,
      amountCents,
      statusTokenHash,
      moderation,
  ];
  if (collectibleSelection && fanUserId) {
    await withTransaction(async (client) => {
      await client.query(orderSql, orderValues);
      await insertPostcardCollectibleOrderIntent(client, {
        orderId: id,
        ownerUserId: fanUserId,
        memberSlug: input.recipientSlug,
        designId: input.designId,
        setId: collectibleSetId!,
        selection: collectibleSelection,
      });
    });
    return;
  }
  await query(orderSql, orderValues);
}

export async function attachPaymentIntent(orderId: string, paymentIntentId: string): Promise<void> {
  await query(
    `UPDATE postcard_orders SET stripe_payment_intent = $2, updated_at = NOW() WHERE id = $1`,
    [orderId, paymentIntentId],
  );
}

/** Mark a newly paid order without ever overwriting an in-flight claim. */
export async function markPostcardOrderPaid(orderId: string): Promise<boolean> {
  const { rows } = await query<{ id: string }>(
    `UPDATE postcard_orders
       SET status = 'paid', updated_at = NOW()
     WHERE id = $1 AND status = 'created'
     RETURNING id`,
    [orderId],
  );
  return rows.length === 1;
}

export async function setPostcardOrderStatus(
  orderId: string,
  status: PostcardStatus,
  providerId?: string | null,
  providerUrl?: string | null,
): Promise<void> {
  await query(
    `UPDATE postcard_orders
       SET status = $2,
           provider_id = COALESCE($3, provider_id),
           provider_url = COALESCE($4, provider_url),
           last_fulfillment_error = CASE
             WHEN $2 IN ('proof', 'printing', 'mailed', 'sent', 'refunded') THEN NULL
             ELSE last_fulfillment_error
           END,
           updated_at = NOW()
     WHERE id = $1`,
    [orderId, status, providerId ?? null, providerUrl ?? null],
  );
  if (status === "failed" || status === "refunded") {
    await cancelPostcardCollectibleReservation(orderId);
  }
}

/** Backward-compatible name retained for existing fulfillment callers. */
export const setOrderStatus = setPostcardOrderStatus;

/**
 * Claim an order for fulfilment with one atomic compare-and-swap. Stripe may
 * deliver the same event concurrently; only the worker that receives a row
 * here is allowed to call the print provider.
 */
export async function claimPostcardFulfillment(
  orderId: string,
  allowedStatuses: readonly PostcardStatus[],
): Promise<boolean> {
  if (allowedStatuses.length === 0) return false;
  // A caller cannot bypass the lease simply by including `fulfilling` in
  // allowedStatuses; an in-flight order is reclaimable only after expiry.
  const initiallyClaimableStatuses = allowedStatuses.filter(
    (status) => status !== "fulfilling",
  );
  await ensurePostcardSchema();
  const { rows } = await query<{ id: string }>(
    `UPDATE postcard_orders
       SET status = 'fulfilling',
           fulfillment_attempts = fulfillment_attempts + 1,
           last_fulfillment_error = NULL,
           updated_at = NOW()
     WHERE id = $1
       AND (
         status = ANY($2::text[])
         OR (
           status = 'fulfilling'
           AND updated_at < NOW() - INTERVAL '5 minutes'
         )
       )
     RETURNING id`,
    [orderId, initiallyClaimableStatuses],
  );
  return rows.length === 1;
}

/**
 * Release a transiently failed provider attempt for a future Stripe retry.
 * Permanent creative/validation failures should instead be marked `failed`.
 */
export async function releasePostcardFulfillment(
  orderId: string,
  error: string,
): Promise<boolean> {
  const boundedError = error.trim().slice(0, 2_000) || "Print provider request failed.";
  const { rows } = await query<{ id: string }>(
    `UPDATE postcard_orders
       SET status = 'paid',
           last_fulfillment_error = $2,
           updated_at = NOW()
     WHERE id = $1 AND status = 'fulfilling'
     RETURNING id`,
    [orderId, boundedError],
  );
  return rows.length === 1;
}

/** Move paid custom artwork into the staff-only safety-review queue. */
export async function markPostcardOrderForReview(orderId: string): Promise<boolean> {
  await ensurePostcardSchema();
  const { rows } = await query<{ id: string }>(
    `UPDATE postcard_orders
       SET status = 'review',
           last_fulfillment_error = NULL,
           updated_at = NOW()
     WHERE id = $1
       AND status = 'paid'
       AND has_custom_art
     RETURNING id`,
    [orderId],
  );
  return rows.length === 1;
}

/** Atomically approve or safely retry one previously approved card. */
export async function approvePostcardOrderReview(
  orderId: string,
  reviewerEmail: string,
): Promise<PostcardOrder | null> {
  await ensurePostcardSchema();
  const { rows } = await query<Row>(
    `UPDATE postcard_orders
       SET status = 'paid',
           reviewed_by = $2,
           reviewed_at = NOW(),
           last_fulfillment_error = NULL,
           updated_at = NOW()
     WHERE id = $1
       AND has_custom_art
       AND (
         status = 'review'
         OR (status = 'paid' AND reviewed_at IS NOT NULL)
         OR (
           status = 'fulfilling'
           AND reviewed_at IS NOT NULL
           AND updated_at < NOW() - INTERVAL '5 minutes'
         )
       )
     RETURNING *`,
    [orderId, reviewerEmail.trim().slice(0, 320)],
  );
  return rows[0] ? toOrder(rows[0]) : null;
}

/** Atomically lease a decline or safely retry one interrupted refund. */
export async function claimPostcardOrderRefund(
  orderId: string,
  reviewerEmail: string,
): Promise<PostcardOrder | null> {
  await ensurePostcardSchema();
  const { rows } = await query<Row>(
    `UPDATE postcard_orders
       SET status = 'refunding',
           reviewed_by = $2,
           reviewed_at = NOW(),
           last_fulfillment_error = NULL,
           updated_at = NOW()
     WHERE id = $1
       AND has_custom_art
       AND (
         status = 'review'
         OR (status = 'failed' AND reviewed_at IS NOT NULL)
         OR (
           status = 'refunding'
           AND reviewed_at IS NOT NULL
           AND updated_at < NOW() - INTERVAL '5 minutes'
         )
       )
     RETURNING *`,
    [orderId, reviewerEmail.trim().slice(0, 320)],
  );
  return rows[0] ? toOrder(rows[0]) : null;
}

/** Put a failed approval/refund attempt back in the visible review queue. */
export async function restorePostcardOrderReview(orderId: string): Promise<void> {
  await ensurePostcardSchema();
  await query(
    `UPDATE postcard_orders
       SET status = 'review',
           reviewed_by = NULL,
           reviewed_at = NULL,
           updated_at = NOW()
     WHERE id = $1
       AND has_custom_art
       AND (
         status = 'refunding'
         OR (status IN ('paid', 'failed') AND reviewed_at IS NOT NULL)
       )`,
    [orderId],
  );
}

/**
 * Oldest-first staff queue, including recoverable interrupted work. A custom
 * order never disappears forever merely because an admin request or process
 * stopped between the provider call and the final database update.
 */
export async function listPostcardOrdersForReview(): Promise<PostcardOrder[]> {
  await ensurePostcardSchema();
  const { rows } = await query<Row>(
    `SELECT *
       FROM postcard_orders
      WHERE has_custom_art
        AND (
          status = 'review'
          OR (status IN ('paid', 'failed') AND reviewed_at IS NOT NULL)
          OR (
            status IN ('fulfilling', 'refunding')
            AND reviewed_at IS NOT NULL
            AND updated_at < NOW() - INTERVAL '5 minutes'
          )
        )
      ORDER BY created_at ASC`,
  );
  return rows.map(toOrder);
}

export async function getPostcardOrder(orderId: string): Promise<PostcardOrder | null> {
  await ensurePostcardSchema();
  const { rows } = await query<Row>(`SELECT * FROM postcard_orders WHERE id = $1`, [orderId]);
  return rows[0] ? toOrder(rows[0]) : null;
}

export async function getOrderByPaymentIntent(pi: string): Promise<PostcardOrder | null> {
  await ensurePostcardSchema();
  const { rows } = await query<Row>(
    `SELECT * FROM postcard_orders WHERE stripe_payment_intent = $1`,
    [pi],
  );
  return rows[0] ? toOrder(rows[0]) : null;
}
