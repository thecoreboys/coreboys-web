import { createHash } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { query, withTransaction } from "./db";
import type { StaffIdentity } from "./staff-policy";
import type {
  PostcardStudioDashboard,
  PostcardStudioInboxItem,
  PostcardStudioPack,
  PostcardStudioRevision,
  PostcardStudioAction,
} from "./postcard-studio-schema";

export class PostcardStudioStoreError extends Error {
  constructor(
    public readonly code: "not_found" | "state_conflict" | "asset_conflict",
    message: string,
  ) {
    super(message);
    this.name = "PostcardStudioStoreError";
  }
}

type PackRow = QueryResultRow & {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  state: PostcardStudioPack["state"];
  published_revision_id: string | null;
  updated_at: string;
  revision_id: string | null;
  revision_version: number | null;
  revision_state: PostcardStudioRevision["state"] | null;
  revision_config: PostcardStudioRevision["config"] | null;
  review_note: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  revision_created_at: string | null;
};

type DropRow = QueryResultRow & {
  id: string;
  pack_id: string;
  revision_id: string;
  pack_title: string;
  revision_version: number;
  code: string;
  title: string;
  description: string | null;
  state: PostcardStudioDashboard["drops"][number]["state"];
  starts_at: string;
  ends_at: string | null;
};

type InboxRow = QueryResultRow & {
  id: string;
  message: string;
  sender_name: string | null;
  design_id: string | null;
  status: string;
  has_custom_art: boolean;
  created_at: string;
  reaction: PostcardStudioInboxItem["acknowledgement"] extends infer Ack
    ? Ack extends { reaction: infer Reaction } ? Reaction : never
    : never;
  visible_to_sender: boolean | null;
  acknowledged_at: string | null;
};

type AnalyticsRow = QueryResultRow & {
  orders_started: string;
  orders_paid: string;
  orders_accepted: string;
  orders_refunded: string;
  orders_acknowledged: string;
};

function revisionFrom(row: PackRow): PostcardStudioRevision | null {
  if (!row.revision_id || !row.revision_state || !row.revision_config || !row.revision_created_at) return null;
  return {
    id: row.revision_id,
    version: Number(row.revision_version),
    state: row.revision_state,
    config: row.revision_config,
    reviewNote: row.review_note,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    publishedAt: row.published_at,
    createdAt: row.revision_created_at,
  };
}

export async function loadPostcardStudioDashboard(memberSlug: string): Promise<PostcardStudioDashboard> {
  const [packsResult, dropsResult, inboxResult, analyticsResult] = await Promise.all([
    query<PackRow>(
      `SELECT p.id::text, p.slug, p.title, p.description, p.state,
              p.published_revision_id::text, p.updated_at::text,
              latest.id::text AS revision_id,
              latest.version AS revision_version,
              latest.state AS revision_state,
              latest.config AS revision_config,
              latest.review_note,
              latest.submitted_at::text,
              latest.reviewed_at::text,
              latest.published_at::text,
              latest.created_at::text AS revision_created_at
         FROM postcard_design_packs p
         LEFT JOIN LATERAL (
           SELECT r.id, r.version, r.state, r.config, r.review_note,
                  r.submitted_at, r.reviewed_at, r.published_at, r.created_at
             FROM postcard_pack_revisions r
            WHERE r.pack_id = p.id
            ORDER BY r.version DESC
            LIMIT 1
         ) latest ON TRUE
        WHERE p.member_slug = $1
        ORDER BY p.updated_at DESC
        LIMIT 50`,
      [memberSlug],
    ),
    query<DropRow>(
      `SELECT d.id::text, d.pack_id::text, d.revision_id::text,
              p.title AS pack_title, r.version AS revision_version,
              d.code, d.title, d.description, d.state,
              d.starts_at::text, d.ends_at::text
         FROM postcard_drops d
         JOIN postcard_design_packs p
           ON p.id = d.pack_id AND p.member_slug = d.member_slug
         JOIN postcard_pack_revisions r
           ON r.id = d.revision_id AND r.pack_id = d.pack_id
        WHERE d.member_slug = $1
        ORDER BY d.starts_at DESC
        LIMIT 100`,
      [memberSlug],
    ),
    query<InboxRow>(
      `SELECT inbox.id, LEFT(inbox.message, 4000) AS message,
              LEFT(inbox.sender_name, 120) AS sender_name, inbox.design_id,
              inbox.status, inbox.has_custom_art, inbox.created_at::text,
              acknowledgement.reaction,
              acknowledgement.visible_to_sender,
              acknowledgement.updated_at::text AS acknowledged_at
         FROM postcard_member_inbox_safe inbox
         LEFT JOIN postcard_recipient_acknowledgements acknowledgement
           ON acknowledgement.order_id = inbox.id
          AND acknowledgement.member_slug = inbox.member_slug
        WHERE inbox.member_slug = $1
        ORDER BY inbox.created_at DESC
        LIMIT 100`,
      [memberSlug],
    ),
    query<AnalyticsRow>(
      `SELECT COALESCE(SUM(orders_started), 0)::text AS orders_started,
              COALESCE(SUM(orders_paid), 0)::text AS orders_paid,
              COALESCE(SUM(orders_accepted), 0)::text AS orders_accepted,
              COALESCE(SUM(orders_refunded), 0)::text AS orders_refunded,
              COALESCE(SUM(orders_acknowledged), 0)::text AS orders_acknowledged
         FROM postcard_member_analytics_daily
        WHERE member_slug = $1`,
      [memberSlug],
    ),
  ]);

  const analytics = analyticsResult.rows[0];
  return {
    packs: packsResult.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      state: row.state,
      publishedRevisionId: row.published_revision_id,
      latestRevision: revisionFrom(row),
      updatedAt: row.updated_at,
    })),
    drops: dropsResult.rows.map((row) => ({
      id: row.id,
      packId: row.pack_id,
      revisionId: row.revision_id,
      packTitle: row.pack_title,
      revisionVersion: row.revision_version,
      code: row.code,
      title: row.title,
      description: row.description,
      state: row.state,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    })),
    inbox: inboxResult.rows.map((row) => ({
      id: row.id,
      message: row.message,
      senderName: row.sender_name,
      designId: row.design_id,
      status: row.status,
      hasCustomArt: row.has_custom_art,
      createdAt: row.created_at,
      acknowledgement: row.reaction && row.acknowledged_at
        ? {
            reaction: row.reaction,
            visibleToSender: Boolean(row.visible_to_sender),
            updatedAt: row.acknowledged_at,
          }
        : null,
    })),
    analytics: {
      ordersStarted: Number(analytics?.orders_started ?? 0),
      ordersPaid: Number(analytics?.orders_paid ?? 0),
      ordersAccepted: Number(analytics?.orders_accepted ?? 0),
      ordersRefunded: Number(analytics?.orders_refunded ?? 0),
      ordersAcknowledged: Number(analytics?.orders_acknowledged ?? 0),
    },
  };
}

function contentHash(config: unknown): string {
  return createHash("sha256").update(JSON.stringify(config)).digest("hex");
}

function referencedAssetIds(config: PostcardStudioRevision["config"]): string[] {
  return [...new Set([
    ...config.motifs.flatMap((motif) => motif.assetId ? [motif.assetId] : []),
    ...config.designs.flatMap((design) => design.assetIds),
  ])];
}

async function requireApprovedAssets(
  client: PoolClient,
  packId: string,
  memberSlug: string,
  config: PostcardStudioRevision["config"],
) {
  const ids = referencedAssetIds(config);
  if (ids.length === 0) return;
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(DISTINCT assets.id)::text AS count
       FROM postcard_pack_assets assets
       JOIN postcard_design_packs packs
         ON packs.id = assets.pack_id AND packs.member_slug = assets.member_slug
      WHERE assets.pack_id = $1
        AND assets.member_slug = $2
        AND assets.moderation_state = 'approved'
        AND assets.id = ANY($3::uuid[])`,
    [packId, memberSlug, ids],
  );
  if (Number(result.rows[0]?.count ?? 0) !== ids.length) {
    throw new PostcardStudioStoreError(
      "asset_conflict",
      "Every asset reference must be approved and belong to this member's pack.",
    );
  }
}

async function audit(
  client: PoolClient,
  staff: StaffIdentity,
  memberSlug: string,
  action: string,
  entityType: string,
  entityId: string,
  previous: unknown,
  next: unknown,
  reason: string | null = null,
) {
  // Audit snapshots are deliberately operational metadata only. Fan messages,
  // artwork, addresses, and full creative configs never enter this table.
  await client.query(
    `INSERT INTO postcard_staff_audit
       (actor_id, actor_email, action, member_slug, entity_type, entity_id,
        reason, previous, next)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)`,
    [
      staff.id,
      staff.email,
      action,
      memberSlug,
      entityType,
      entityId,
      reason,
      previous == null ? null : JSON.stringify(previous),
      next == null ? null : JSON.stringify(next),
    ],
  );
}

export async function applyPostcardStudioAction(
  memberSlug: string,
  staff: StaffIdentity,
  action: PostcardStudioAction,
): Promise<void> {
  await withTransaction(async (client) => {
    switch (action.action) {
      case "create_pack": {
        if (referencedAssetIds(action.config).length > 0) {
          throw new PostcardStudioStoreError("asset_conflict", "Create the pack before attaching approved assets.");
        }
        const pack = await client.query<{ id: string }>(
          `INSERT INTO postcard_design_packs
             (member_slug, slug, title, description, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $5)
           RETURNING id::text`,
          [memberSlug, action.slug, action.title, action.description ?? null, staff.id],
        );
        const packId = pack.rows[0]!.id;
        const revision = await client.query<{ id: string }>(
          `INSERT INTO postcard_pack_revisions
             (pack_id, version, schema_version, config, content_hash, created_by)
           SELECT packs.id, 1, $3, $4::jsonb, $5, $6
             FROM postcard_design_packs packs
            WHERE packs.id = $1 AND packs.member_slug = $2
           RETURNING id::text`,
          [packId, memberSlug, action.config.schemaVersion, JSON.stringify(action.config), contentHash(action.config), staff.id],
        );
        await audit(client, staff, memberSlug, "pack.create", "postcard_pack", packId, null, {
          slug: action.slug,
          title: action.title,
          revisionId: revision.rows[0]!.id,
          revisionVersion: 1,
        });
        return;
      }

      case "update_pack": {
        const before = await client.query<{ title: string; description: string | null; state: string }>(
          `SELECT title, description, state
             FROM postcard_design_packs
            WHERE id = $1 AND member_slug = $2
            FOR UPDATE`,
          [action.packId, memberSlug],
        );
        if (!before.rows[0]) throw new PostcardStudioStoreError("not_found", "Pack not found.");
        await client.query(
          `UPDATE postcard_design_packs
              SET title = $3, description = $4, updated_by = $5
            WHERE id = $1 AND member_slug = $2`,
          [action.packId, memberSlug, action.title, action.description ?? null, staff.id],
        );
        await audit(client, staff, memberSlug, "pack.update", "postcard_pack", action.packId, before.rows[0], {
          title: action.title,
          description: action.description ?? null,
          state: before.rows[0].state,
        });
        return;
      }

      case "retire_pack": {
        const before = await client.query<{
          id: string; title: string; state: string; published_revision_id: string | null;
        }>(
          `SELECT id::text, title, state, published_revision_id::text
             FROM postcard_design_packs
            WHERE id = $1 AND member_slug = $2
            FOR UPDATE`,
          [action.packId, memberSlug],
        );
        const row = before.rows[0];
        if (!row) throw new PostcardStudioStoreError("not_found", "Pack not found.");
        if (row.state === "retired") {
          throw new PostcardStudioStoreError("state_conflict", "This pack is already retired.");
        }
        await client.query(
          `UPDATE postcard_design_packs
              SET state = 'retired', published_revision_id = NULL, updated_by = $3
            WHERE id = $1 AND member_slug = $2`,
          [action.packId, memberSlug, staff.id],
        );
        await client.query(
          `UPDATE postcard_drops
              SET state = 'cancelled', updated_by = $3
            WHERE pack_id = $1
              AND member_slug = $2
              AND state IN ('draft', 'scheduled')`,
          [action.packId, memberSlug, staff.id],
        );
        await audit(client, staff, memberSlug, "pack.retire", "postcard_pack", action.packId, {
          state: row.state,
          publishedRevisionId: row.published_revision_id,
        }, {
          state: "retired",
          publishedRevisionId: null,
          scheduledDropsCancelled: true,
        });
        return;
      }

      case "save_revision": {
        const locked = await client.query<{ id: string }>(
          `SELECT id::text
             FROM postcard_design_packs
            WHERE id = $1 AND member_slug = $2
            FOR UPDATE`,
          [action.packId, memberSlug],
        );
        if (!locked.rows[0]) throw new PostcardStudioStoreError("not_found", "Pack not found.");
        await requireApprovedAssets(client, action.packId, memberSlug, action.config);
        const latest = await client.query<{ id: string; version: number; state: string }>(
          `SELECT revisions.id::text, revisions.version, revisions.state
             FROM postcard_pack_revisions revisions
             JOIN postcard_design_packs packs
               ON packs.id = revisions.pack_id AND packs.member_slug = $2
            WHERE revisions.pack_id = $1
            ORDER BY revisions.version DESC
            LIMIT 1
            FOR UPDATE OF revisions`,
          [action.packId, memberSlug],
        );
        const current = latest.rows[0];
        if (current?.state === "submitted" || current?.state === "approved") {
          throw new PostcardStudioStoreError("state_conflict", "This revision is awaiting admin review and cannot be replaced.");
        }
        let revisionId: string;
        let version: number;
        if (current?.state === "draft") {
          await client.query(
            `UPDATE postcard_pack_revisions revisions
                SET schema_version = $4, config = $5::jsonb, content_hash = $6
               FROM postcard_design_packs packs
              WHERE revisions.id = $1
                AND revisions.pack_id = packs.id
                AND packs.id = $2
                AND packs.member_slug = $3
                AND revisions.state = 'draft'`,
            [current.id, action.packId, memberSlug, action.config.schemaVersion, JSON.stringify(action.config), contentHash(action.config)],
          );
          revisionId = current.id;
          version = current.version;
        } else {
          version = (current?.version ?? 0) + 1;
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO postcard_pack_revisions
               (pack_id, version, schema_version, config, content_hash, created_by)
             SELECT packs.id, $3, $4, $5::jsonb, $6, $7
               FROM postcard_design_packs packs
              WHERE packs.id = $1 AND packs.member_slug = $2
             RETURNING id::text`,
            [action.packId, memberSlug, version, action.config.schemaVersion, JSON.stringify(action.config), contentHash(action.config), staff.id],
          );
          revisionId = inserted.rows[0]!.id;
        }
        await client.query(
          `UPDATE postcard_design_packs SET updated_by = $3
            WHERE id = $1 AND member_slug = $2`,
          [action.packId, memberSlug, staff.id],
        );
        await audit(client, staff, memberSlug, "pack.revision_save", "postcard_pack_revision", revisionId, null, {
          packId: action.packId,
          version,
          schemaVersion: action.config.schemaVersion,
          designCount: action.config.designs.length,
        });
        return;
      }

      case "submit_revision": {
        const updated = await client.query<{ id: string; pack_id: string; version: number }>(
          `UPDATE postcard_pack_revisions revisions
              SET state = 'submitted', submitted_at = NOW(), review_note = NULL
             FROM postcard_design_packs packs
            WHERE revisions.id = $1
              AND revisions.pack_id = packs.id
              AND packs.member_slug = $2
              AND revisions.state = 'draft'
           RETURNING revisions.id::text, revisions.pack_id::text, revisions.version`,
          [action.revisionId, memberSlug],
        );
        const row = updated.rows[0];
        if (!row) throw new PostcardStudioStoreError("state_conflict", "Only a scoped draft revision can be submitted.");
        await audit(client, staff, memberSlug, "pack.submit", "postcard_pack_revision", row.id, { state: "draft" }, {
          state: "submitted",
          packId: row.pack_id,
          version: row.version,
        });
        return;
      }

      case "review_revision": {
        const updated = await client.query<{ id: string; pack_id: string; version: number }>(
          `UPDATE postcard_pack_revisions revisions
              SET state = $3, review_note = $4, reviewed_by = $5, reviewed_at = NOW()
             FROM postcard_design_packs packs
            WHERE revisions.id = $1
              AND revisions.pack_id = packs.id
              AND packs.member_slug = $2
              AND revisions.state = 'submitted'
           RETURNING revisions.id::text, revisions.pack_id::text, revisions.version`,
          [action.revisionId, memberSlug, action.decision, action.note ?? null, staff.id],
        );
        const row = updated.rows[0];
        if (!row) throw new PostcardStudioStoreError("state_conflict", "Only a submitted revision can be reviewed.");
        await audit(client, staff, memberSlug, `pack.${action.decision}`, "postcard_pack_revision", row.id, { state: "submitted" }, {
          state: action.decision,
          packId: row.pack_id,
          version: row.version,
        }, action.note ?? null);
        return;
      }

      case "publish_revision": {
        const selected = await client.query<{
          id: string; pack_id: string; version: number; state: string; published_revision_id: string | null;
        }>(
          `SELECT revisions.id::text, revisions.pack_id::text, revisions.version,
                  revisions.state, packs.published_revision_id::text
             FROM postcard_pack_revisions revisions
             JOIN postcard_design_packs packs ON packs.id = revisions.pack_id
            WHERE revisions.id = $1 AND packs.member_slug = $2
            FOR UPDATE OF revisions, packs`,
          [action.revisionId, memberSlug],
        );
        const row = selected.rows[0];
        if (!row) throw new PostcardStudioStoreError("not_found", "Revision not found.");
        if (row.state !== "approved") {
          throw new PostcardStudioStoreError("state_conflict", "Only an approved revision can be published.");
        }
        await client.query(
          `UPDATE postcard_pack_revisions revisions
              SET state = 'published', published_by = $3, published_at = NOW()
             FROM postcard_design_packs packs
            WHERE revisions.id = $1
              AND revisions.pack_id = packs.id
              AND packs.member_slug = $2
              AND revisions.state = 'approved'`,
          [action.revisionId, memberSlug, staff.id],
        );
        await client.query(
          `UPDATE postcard_design_packs
              SET state = 'active', published_revision_id = $3, updated_by = $4
            WHERE id = $1 AND member_slug = $2`,
          [row.pack_id, memberSlug, action.revisionId, staff.id],
        );
        if (row.published_revision_id && row.published_revision_id !== action.revisionId) {
          await client.query(
            `UPDATE postcard_pack_revisions revisions
                SET state = 'superseded'
               FROM postcard_design_packs packs
              WHERE revisions.id = $1
                AND revisions.pack_id = packs.id
                AND packs.id = $2
                AND packs.member_slug = $3
                AND revisions.state = 'published'`,
            [row.published_revision_id, row.pack_id, memberSlug],
          );
        }
        await audit(client, staff, memberSlug, "pack.publish", "postcard_pack_revision", row.id, { state: "approved" }, {
          state: "published",
          packId: row.pack_id,
          version: row.version,
        });
        return;
      }

      case "schedule_drop": {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO postcard_drops
             (pack_id, revision_id, member_slug, code, title, description,
              state, starts_at, ends_at, album_code, created_by, updated_by)
           SELECT packs.id, revisions.id, packs.member_slug, $4, $5, $6,
                  'scheduled', $7::timestamptz, $8::timestamptz, $9, $10, $10
             FROM postcard_design_packs packs
             JOIN postcard_pack_revisions revisions
               ON revisions.pack_id = packs.id AND revisions.id = $2
            WHERE packs.id = $1
              AND packs.member_slug = $3
              AND revisions.state = 'published'
              AND $7::timestamptz > NOW()
           RETURNING id::text`,
          [
            action.packId,
            action.revisionId,
            memberSlug,
            action.code,
            action.title,
            action.description ?? null,
            action.startsAt,
            action.endsAt ?? null,
            action.albumCode ?? null,
            staff.id,
          ],
        );
        const row = inserted.rows[0];
        if (!row) throw new PostcardStudioStoreError("state_conflict", "Drops require this member's published pack revision and a future start time.");
        await audit(client, staff, memberSlug, "drop.schedule", "postcard_drop", row.id, null, {
          packId: action.packId,
          revisionId: action.revisionId,
          code: action.code,
          startsAt: action.startsAt,
          endsAt: action.endsAt ?? null,
        });
        return;
      }

      case "cancel_drop": {
        const updated = await client.query<{ id: string; code: string }>(
          `UPDATE postcard_drops
              SET state = 'cancelled', updated_by = $3
            WHERE id = $1
              AND member_slug = $2
              AND state IN ('draft', 'scheduled')
           RETURNING id::text, code`,
          [action.dropId, memberSlug, staff.id],
        );
        const row = updated.rows[0];
        if (!row) throw new PostcardStudioStoreError("state_conflict", "Only this member's draft or scheduled drop can be cancelled.");
        await audit(client, staff, memberSlug, "drop.cancel", "postcard_drop", row.id, { state: "scheduled" }, {
          state: "cancelled",
          code: row.code,
        });
        return;
      }

      case "acknowledge": {
        const updated = await client.query<{ order_id: string }>(
          `INSERT INTO postcard_recipient_acknowledgements
             (order_id, member_slug, reaction, visible_to_sender, actor_id)
           SELECT inbox.id, inbox.member_slug, $3, $4, $5
             FROM postcard_member_inbox_safe inbox
            WHERE inbox.id = $1 AND inbox.member_slug = $2
           ON CONFLICT (order_id) DO UPDATE SET
             reaction = EXCLUDED.reaction,
             visible_to_sender = EXCLUDED.visible_to_sender,
             actor_id = EXCLUDED.actor_id
           WHERE postcard_recipient_acknowledgements.member_slug = EXCLUDED.member_slug
           RETURNING order_id`,
          [action.orderId, memberSlug, action.reaction, action.visibleToSender, staff.id],
        );
        if (!updated.rows[0]) throw new PostcardStudioStoreError("not_found", "Postcard not found in this member's inbox.");
        await audit(client, staff, memberSlug, "acknowledgement.write", "postcard_order", action.orderId, null, {
          reaction: action.reaction,
          visibleToSender: action.visibleToSender,
        });
        return;
      }
    }
  });
}
