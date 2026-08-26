import type { PoolClient } from "pg";
import { query, withTransaction } from "./db";
import type {
  PostcardCollectibleReleaseOption,
  PostcardCollectibleSelection,
} from "./postcard-collectibles";

type EligibleRow = {
  set_id: string;
  set_code: string;
  set_title: string;
  member_slug: string;
  release_id: string;
  release_code: string;
  release_title: string;
  description: string | null;
  design_id: string;
  edition_size: number;
  available_until: Date | string | null;
  variant_id: string;
  variant_code: string;
  variant_title: string;
  remaining_now: number;
};

export class PostcardCollectibleUnavailableError extends Error {
  constructor(message = "That collectible release is no longer available.") {
    super(message);
    this.name = "PostcardCollectibleUnavailableError";
  }
}

export class PostcardCollectibleInfrastructureError extends Error {
  constructor(message = "Collectible releases are not configured yet.") {
    super(message);
    this.name = "PostcardCollectibleInfrastructureError";
  }
}

export function isPostcardCollectibleSchemaUnavailable(error: unknown): boolean {
  const code = typeof error === "object" && error !== null
    ? (error as { code?: unknown }).code
    : null;
  return code === "42P01" || code === "42703" || code === "42883";
}

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function groupEligiblePostcardCollectibleRows(
  rows: readonly EligibleRow[],
): PostcardCollectibleReleaseOption[] {
  const releases = new Map<string, PostcardCollectibleReleaseOption>();
  for (const row of rows) {
    let release = releases.get(row.release_id);
    if (!release) {
      release = {
        setId: row.set_id,
        setCode: row.set_code,
        setTitle: row.set_title,
        memberSlug: row.member_slug,
        releaseId: row.release_id,
        releaseCode: row.release_code,
        releaseTitle: row.release_title,
        description: row.description,
        designId: row.design_id,
        editionSize: row.edition_size,
        remainingNow: Math.max(0, row.remaining_now),
        availableUntil: iso(row.available_until),
        variants: [],
      };
      releases.set(row.release_id, release);
    }
    release.remainingNow = Math.max(release.remainingNow, row.remaining_now);
    release.variants.push({
      id: row.variant_id,
      code: row.variant_code,
      title: row.variant_title,
      remainingNow: Math.max(0, row.remaining_now),
    });
  }
  return [...releases.values()];
}

/**
 * Public-safe catalog projection. Only approved, active, in-window releases
 * for the exact member + design are returned. Counts subtract active checkout
 * holds and paid reservations; a serial is assigned after live print acceptance.
 */
export async function listEligiblePostcardCollectibles(
  memberSlug: string,
  designId: string,
): Promise<PostcardCollectibleReleaseOption[]> {
  try {
    const { rows } = await query<EligibleRow>(`
      SELECT
        sets.id AS set_id,
        sets.code AS set_code,
        sets.title AS set_title,
        sets.member_slug,
        releases.id AS release_id,
        releases.code AS release_code,
        releases.title AS release_title,
        releases.description,
        releases.design_id,
        releases.max_supply AS edition_size,
        releases.available_until,
        variants.id AS variant_id,
        variants.code AS variant_code,
        variants.title AS variant_title,
        LEAST(
          releases.max_supply - COALESCE(release_counts.reserved, 0),
          COALESCE(variants.max_supply - COALESCE(variant_counts.reserved, 0), releases.max_supply)
        )::INTEGER AS remaining_now
      FROM postcard_collectible_releases releases
      JOIN postcard_collectible_sets sets ON sets.id = releases.set_id
      JOIN postcard_collectible_variants variants ON variants.release_id = releases.id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(intent.inventory_quantity), 0)::INTEGER AS reserved
        FROM postcard_collectible_order_intents intent
        JOIN postcard_orders orders ON orders.id = intent.order_id
        WHERE intent.release_id = releases.id
          AND orders.status NOT IN ('failed','refunded')
          AND (
            intent.state IN ('issuing','issued')
            OR (
              intent.state = 'requested'
              AND (intent.reservation_expires_at IS NULL OR intent.reservation_expires_at > NOW())
            )
          )
      ) release_counts ON TRUE
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(intent.inventory_quantity), 0)::INTEGER AS reserved
        FROM postcard_collectible_order_intents intent
        JOIN postcard_orders orders ON orders.id = intent.order_id
        WHERE intent.variant_id = variants.id
          AND orders.status NOT IN ('failed','refunded')
          AND (
            intent.state IN ('issuing','issued')
            OR (
              intent.state = 'requested'
              AND (intent.reservation_expires_at IS NULL OR intent.reservation_expires_at > NOW())
            )
          )
      ) variant_counts ON TRUE
      WHERE sets.member_slug = $1
        AND releases.design_id = $2
        AND sets.state = 'approved'
        AND releases.state = 'active'
        AND variants.active
        AND (releases.available_from IS NULL OR releases.available_from <= NOW())
        AND (releases.available_until IS NULL OR releases.available_until > NOW())
        AND releases.max_supply > COALESCE(release_counts.reserved, 0)
        AND (variants.max_supply IS NULL OR variants.max_supply > COALESCE(variant_counts.reserved, 0))
      ORDER BY sets.title, releases.set_position, variants.sort_order, variants.title
    `, [memberSlug, designId]);
    return groupEligiblePostcardCollectibleRows(rows);
  } catch (error) {
    if (isPostcardCollectibleSchemaUnavailable(error)) {
      throw new PostcardCollectibleInfrastructureError();
    }
    throw error;
  }
}

type LockedChoiceRow = {
  release_id: string;
  variant_id: string;
  release_max_supply: number;
  variant_max_supply: number | null;
};

type ReservationCountRow = {
  release_reserved: number;
  variant_reserved: number;
};

/**
 * Revalidates and records the chosen variant inside the same transaction as
 * the order insert. Row locks make concurrent checkout validation ordered;
 * the database issuance function remains the final atomic supply authority.
 */
export async function insertPostcardCollectibleOrderIntent(
  client: PoolClient,
  args: {
    orderId: string;
    ownerUserId: string;
    memberSlug: string;
    designId: string;
    setId: string;
    selection: PostcardCollectibleSelection;
  },
): Promise<void> {
  const { selection } = args;
  if (
    selection.bundle.mode !== "single"
    || selection.bundle.sendQuantity !== 1
    || selection.bundle.keepQuantity !== 0
    || selection.bundle.inventoryQuantity !== 1
  ) {
    throw new PostcardCollectibleUnavailableError("Only one mailed collectible postcard is supported.");
  }

  let rows: LockedChoiceRow[];
  try {
    ({ rows } = await client.query<LockedChoiceRow>(`
      SELECT
        releases.id AS release_id,
        variants.id AS variant_id,
        releases.max_supply AS release_max_supply,
        variants.max_supply AS variant_max_supply
      FROM postcard_collectible_releases releases
      JOIN postcard_collectible_sets sets ON sets.id = releases.set_id
      JOIN postcard_collectible_variants variants
        ON variants.id = $2 AND variants.release_id = releases.id
      WHERE releases.id = $1
        AND sets.member_slug = $3
        AND releases.design_id = $4
        AND sets.id = $5
        AND sets.state = 'approved'
        AND releases.state = 'active'
        AND variants.active
        AND (releases.available_from IS NULL OR releases.available_from <= NOW())
        AND (releases.available_until IS NULL OR releases.available_until > NOW())
      FOR UPDATE OF releases, variants
    `, [selection.releaseId, selection.variantId, args.memberSlug, args.designId, args.setId]));
  } catch (error) {
    if (isPostcardCollectibleSchemaUnavailable(error)) {
      throw new PostcardCollectibleInfrastructureError();
    }
    throw error;
  }

  const choice = rows[0];
  if (!choice) {
    throw new PostcardCollectibleUnavailableError();
  }

  // This is deliberately a second statement after the release + variant row
  // locks are acquired. Under READ COMMITTED it sees any reservation made by
  // a transaction that committed while this checkout was waiting for a lock.
  const counts = await client.query<ReservationCountRow>(`
    SELECT
      COALESCE(SUM(inventory_quantity) FILTER (WHERE release_id = $1), 0)::INTEGER AS release_reserved,
      COALESCE(SUM(inventory_quantity) FILTER (WHERE variant_id = $2), 0)::INTEGER AS variant_reserved
    FROM postcard_collectible_order_intents intent
    JOIN postcard_orders orders ON orders.id = intent.order_id
    WHERE orders.status NOT IN ('failed','refunded')
      AND (intent.state IN ('issuing','issued')
       OR (
         intent.state = 'requested'
         AND (intent.reservation_expires_at IS NULL OR intent.reservation_expires_at > NOW())
       ))
  `, [selection.releaseId, selection.variantId]);
  const reserved = counts.rows[0] ?? { release_reserved: 0, variant_reserved: 0 };
  if (
    reserved.release_reserved + 1 > choice.release_max_supply
    || (choice.variant_max_supply !== null && reserved.variant_reserved + 1 > choice.variant_max_supply)
  ) throw new PostcardCollectibleUnavailableError();

  await client.query(
    `INSERT INTO postcard_collectible_order_intents
       (order_id, owner_user_id, release_id, variant_id,
        bundle_mode, send_quantity, keep_quantity, inventory_quantity,
        reservation_expires_at)
     VALUES ($1, $2, $3, $4, 'single', 1, 0, 1, NOW() + INTERVAL '30 minutes')`,
    [args.orderId, args.ownerUserId, selection.releaseId, selection.variantId],
  );
}

type ReservationRow = {
  state: "requested" | "issuing" | "issued" | "cancelled";
  owner_user_id: string | null;
  release_id: string;
  variant_id: string;
  inventory_quantity: number;
  reservation_expires_at: Date | string | null;
  reservation_expired: boolean;
};

type ReservationReleaseRow = {
  release_max_supply: number;
  variant_max_supply: number | null;
  release_available: boolean;
};

export type PostcardCollectibleReservationResult = "none" | "confirmed" | "unavailable";

/**
 * Convert the short checkout hold into a permanent paid-order reservation.
 * Stripe webhooks call this before the order is allowed to reach Lob.
 */
export async function confirmPostcardCollectibleReservation(
  orderId: string,
  ownerUserId: string | null,
): Promise<PostcardCollectibleReservationResult> {
  try {
    return await withTransaction(async (client) => {
      const intentResult = await client.query<ReservationRow>(`
        SELECT state, owner_user_id, release_id, variant_id,
               inventory_quantity, reservation_expires_at,
               (reservation_expires_at IS NOT NULL AND reservation_expires_at <= NOW()) AS reservation_expired
        FROM postcard_collectible_order_intents
        WHERE order_id = $1
        FOR UPDATE
      `, [orderId]);
      const intent = intentResult.rows[0];
      if (!intent) return "none";
      if (!ownerUserId || intent.owner_user_id !== ownerUserId || intent.state === "cancelled") return "unavailable";
      if (intent.state === "issuing" || intent.state === "issued") return "confirmed";
      if (intent.reservation_expires_at === null) return "confirmed";

      const releaseResult = await client.query<ReservationReleaseRow>(`
        SELECT
          releases.max_supply AS release_max_supply,
          variants.max_supply AS variant_max_supply,
          (
            sets.state = 'approved'
            AND releases.state = 'active'
            AND variants.active
            AND (releases.available_from IS NULL OR releases.available_from <= NOW())
            AND (releases.available_until IS NULL OR releases.available_until > NOW())
          ) AS release_available
        FROM postcard_collectible_releases releases
        JOIN postcard_collectible_sets sets ON sets.id = releases.set_id
        JOIN postcard_collectible_variants variants
          ON variants.id = $2 AND variants.release_id = releases.id
        WHERE releases.id = $1
        FOR UPDATE OF releases, variants
      `, [intent.release_id, intent.variant_id]);
      const release = releaseResult.rows[0];
      if (!release?.release_available) {
        await cancelIntent(client, orderId);
        return "unavailable";
      }

      // An unexpired hold already owns its slot. If it expired while the fan
      // was paying, renew it only when the currently reserved total still fits.
      if (intent.reservation_expired) {
        const counts = await client.query<ReservationCountRow>(`
          SELECT
            COALESCE(SUM(inventory_quantity) FILTER (WHERE release_id = $1), 0)::INTEGER AS release_reserved,
            COALESCE(SUM(inventory_quantity) FILTER (WHERE variant_id = $2), 0)::INTEGER AS variant_reserved
          FROM postcard_collectible_order_intents intent
          JOIN postcard_orders orders ON orders.id = intent.order_id
          WHERE intent.order_id <> $3
            AND orders.status NOT IN ('failed','refunded')
            AND (
              intent.state IN ('issuing','issued')
              OR (
                intent.state = 'requested'
                AND (intent.reservation_expires_at IS NULL OR intent.reservation_expires_at > NOW())
              )
            )
        `, [intent.release_id, intent.variant_id, orderId]);
        const reserved = counts.rows[0] ?? { release_reserved: 0, variant_reserved: 0 };
        if (
          reserved.release_reserved + intent.inventory_quantity > release.release_max_supply
          || (
            release.variant_max_supply !== null
            && reserved.variant_reserved + intent.inventory_quantity > release.variant_max_supply
          )
        ) {
          await cancelIntent(client, orderId);
          return "unavailable";
        }
      }

      await client.query(
        `UPDATE postcard_collectible_order_intents
            SET reservation_expires_at = NULL, updated_at = NOW()
          WHERE order_id = $1 AND state = 'requested'`,
        [orderId],
      );
      return "confirmed";
    });
  } catch (error) {
    if (isPostcardCollectibleSchemaUnavailable(error)) return "none";
    throw error;
  }
}

async function cancelIntent(client: PoolClient, orderId: string): Promise<void> {
  await client.query(
    `UPDATE postcard_collectible_order_intents
        SET state = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
      WHERE order_id = $1 AND state = 'requested'`,
    [orderId],
  );
}

/** Release inventory for terminal orders that can no longer be printed. */
export async function cancelPostcardCollectibleReservation(orderId: string): Promise<void> {
  try {
    await query(
      `UPDATE postcard_collectible_order_intents
          SET state = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
        WHERE order_id = $1 AND state = 'requested'`,
      [orderId],
    );
  } catch (error) {
    // Ordinary postcard orders remain deployable before migration 022.
    if (!isPostcardCollectibleSchemaUnavailable(error)) throw error;
  }
}

/** Fail closed before a live provider call if a collectible hold was not paid-confirmed. */
export async function isPostcardCollectibleReadyForFulfillment(
  orderId: string,
  ownerUserId: string | null,
): Promise<boolean> {
  try {
    const { rows } = await query<{ state: string; owner_user_id: string | null; reservation_expires_at: Date | string | null }>(`
      SELECT state, owner_user_id, reservation_expires_at
      FROM postcard_collectible_order_intents
      WHERE order_id = $1
    `, [orderId]);
    const intent = rows[0];
    if (!intent) return true;
    if (!ownerUserId || intent.owner_user_id !== ownerUserId) return false;
    return intent.state === "issued"
      || intent.state === "issuing"
      || (intent.state === "requested" && intent.reservation_expires_at === null);
  } catch (error) {
    if (isPostcardCollectibleSchemaUnavailable(error)) return true;
    throw error;
  }
}

export type PostcardBinderItem = {
  collectibleId: string;
  setId: string;
  setCode: string;
  setTitle: string;
  memberSlug: string;
  releaseId: string;
  releaseCode: string;
  releaseTitle: string;
  serialPrefix: string;
  editionSize: number;
  variantId: string;
  variantCode: string;
  variantTitle: string;
  serialNumber: number;
  copyRole: string;
  issuedAt: string;
};

export type PostcardBinderProgress = {
  setId: string;
  setCode: string;
  setTitle: string;
  memberSlug: string;
  ownedReleases: number;
  requiredReleases: number;
  completed: boolean;
  completedAt: string | null;
};

type BinderRow = {
  collectible_id: string;
  set_id: string;
  set_code: string;
  set_title: string;
  member_slug: string;
  release_id: string;
  release_code: string;
  release_title: string;
  serial_prefix: string;
  edition_size: number;
  variant_id: string;
  variant_code: string;
  variant_title: string;
  serial_number: number;
  copy_role: string;
  issued_at: Date | string;
};

type ProgressRow = {
  set_id: string;
  set_code: string;
  set_title: string;
  member_slug: string;
  owned_releases: number;
  required_releases: number;
  completed: boolean;
  completed_at: Date | string | null;
};

export async function getPrivatePostcardBinder(ownerUserId: string): Promise<{
  items: PostcardBinderItem[];
  progress: PostcardBinderProgress[];
}> {
  try {
    const [binder, progress] = await Promise.all([
      query<BinderRow>(`
        SELECT collectible_id, set_id, set_code, set_title, member_slug,
               release_id, release_code, release_title, serial_prefix,
               edition_size, variant_id, variant_code, variant_title,
               serial_number, copy_role, issued_at
        FROM postcard_collectible_binder_safe
        WHERE owner_user_id = $1
        ORDER BY issued_at DESC, collectible_id
      `, [ownerUserId]),
      query<ProgressRow>(`
        SELECT set_id, set_code, set_title, member_slug, owned_releases,
               required_releases, completed, completed_at
        FROM postcard_collectible_set_progress_safe
        WHERE owner_user_id = $1
        ORDER BY set_title, set_id
      `, [ownerUserId]),
    ]);
    return {
      items: binder.rows.map((row) => ({
        collectibleId: row.collectible_id,
        setId: row.set_id,
        setCode: row.set_code,
        setTitle: row.set_title,
        memberSlug: row.member_slug,
        releaseId: row.release_id,
        releaseCode: row.release_code,
        releaseTitle: row.release_title,
        serialPrefix: row.serial_prefix,
        editionSize: row.edition_size,
        variantId: row.variant_id,
        variantCode: row.variant_code,
        variantTitle: row.variant_title,
        serialNumber: row.serial_number,
        copyRole: row.copy_role,
        issuedAt: iso(row.issued_at)!,
      })),
      progress: progress.rows.map((row) => ({
        setId: row.set_id,
        setCode: row.set_code,
        setTitle: row.set_title,
        memberSlug: row.member_slug,
        ownedReleases: row.owned_releases,
        requiredReleases: row.required_releases,
        completed: row.completed,
        completedAt: iso(row.completed_at),
      })),
    };
  } catch (error) {
    if (isPostcardCollectibleSchemaUnavailable(error)) {
      throw new PostcardCollectibleInfrastructureError();
    }
    throw error;
  }
}

/** Invoke the database's idempotent, row-locked issuance authority. */
export async function issuePostcardCollectibleForOrder(
  orderId: string,
  ownerUserId: string | null,
): Promise<void> {
  if (!ownerUserId) return;
  try {
    const intent = await query<{ owner_user_id: string | null }>(
      `SELECT owner_user_id
         FROM postcard_collectible_order_intents
        WHERE order_id = $1`,
      [orderId],
    );
    if (!intent.rows[0]) return;
    if (intent.rows[0].owner_user_id !== ownerUserId) {
      throw new PostcardCollectibleUnavailableError("Collectible order owner mismatch.");
    }
    await query(
      `SELECT * FROM issue_postcard_collectible($1, $2)`,
      [orderId, ownerUserId],
    );
  } catch (error) {
    if (isPostcardCollectibleSchemaUnavailable(error)) {
      throw new PostcardCollectibleInfrastructureError();
    }
    throw error;
  }
}
