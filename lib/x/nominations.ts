import "server-only";

import { query, withTransaction } from "@/lib/db";
import { getXCommunityDirectory } from "./config";
import { isXCommunityKey, parseXPostReference } from "./parsing";
import { ensureXIntegrationSchema } from "./schema";
import type { XCommunityKey, XNominationPublic, XNominationStatus } from "./types";

type NominationRow = {
  id: string;
  user_id?: string;
  post_id: string;
  post_url: string;
  community_key: string;
  member_slug: string | null;
  note: string | null;
  status: string;
  featured: boolean;
  denial_reason: string | null;
  reviewed_by?: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type XNominationAdmin = XNominationPublic & {
  userId: string;
  reviewedBy: string | null;
};

function publicRow(row: NominationRow, includePrivate = false): XNominationPublic {
  return {
    id: row.id,
    postId: row.post_id,
    postUrl: row.post_url,
    communityKey: isXCommunityKey(row.community_key) ? row.community_key : "core",
    memberSlug: row.member_slug,
    // Notes are guidance for moderators, not pre-moderated public copy.
    note: includePrivate ? row.note : null,
    status: row.status === "approved" || row.status === "denied" ? row.status : "pending",
    featured: row.featured,
    submittedAt: row.created_at,
    reviewedAt: row.reviewed_at,
    ...(includePrivate ? { denialReason: row.status === "denied" ? row.denial_reason : null } : {}),
  };
}

const SELECT = `SELECT id::text,user_id,post_id,post_url,community_key,member_slug,note,status,featured,
  denial_reason,reviewed_by,reviewed_at::text,created_at::text FROM x_post_nominations`;

export async function listApprovedXPostNominations(
  communityKey?: XCommunityKey | null,
  limit = 24,
): Promise<XNominationPublic[]> {
  await ensureXIntegrationSchema();
  const { rows } = await query<NominationRow>(
    `${SELECT} WHERE status='approved' AND ($1::text IS NULL OR community_key=$1)
      ORDER BY featured DESC,reviewed_at DESC NULLS LAST,created_at DESC LIMIT $2`,
    [communityKey ?? null, Math.min(60, Math.max(1, Math.trunc(limit)))],
  );
  return rows.map((row) => publicRow(row));
}

export async function listMyXPostNominations(userId: string): Promise<XNominationPublic[]> {
  await ensureXIntegrationSchema();
  const { rows } = await query<NominationRow>(
    `${SELECT} WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
    [userId],
  );
  return rows.map((row) => publicRow(row, true));
}

/** Account-portability export. Provider tokens and moderation audit actors are intentionally excluded. */
export async function exportXNominationAccountData(userId: string): Promise<XNominationPublic[]> {
  return listMyXPostNominations(userId);
}

/** Remove a fan's nomination rows; nomination audit rows cascade with them. */
export async function deleteXNominationAccountData(userId: string): Promise<number> {
  await ensureXIntegrationSchema();
  const result = await query("DELETE FROM x_post_nominations WHERE user_id=$1", [userId]);
  return result.rowCount ?? 0;
}

async function consumeNominationLimit(userId: string): Promise<boolean> {
  const { rows } = await query<{ hits: number }>(`
    INSERT INTO x_rate_limits(subject_key,action,bucket_started_at,hits)
    VALUES($1,'nomination',date_trunc('day',now()),1)
    ON CONFLICT(subject_key,action,bucket_started_at)
    DO UPDATE SET hits=x_rate_limits.hits+1 RETURNING hits
  `, [`fan:${userId}`]);
  return (rows[0]?.hits ?? 0) <= 8;
}

export async function createXPostNomination(input: {
  userId: string;
  postUrl: string;
  communityKey: XCommunityKey;
  note?: string | null;
  consentVersion: string;
}): Promise<{ nomination: XNominationPublic; created: boolean } | { rateLimited: true }> {
  await ensureXIntegrationSchema();
  const post = parseXPostReference(input.postUrl);
  if (!post) throw new Error("invalid_post_url");
  if (!await consumeNominationLimit(input.userId)) return { rateLimited: true };
  const directory = getXCommunityDirectory();
  const owner = directory.find((entry) => entry.key === input.communityKey);
  if (!owner) throw new Error("invalid_community");
  const { rows } = await query<NominationRow>(`
    INSERT INTO x_post_nominations
      (user_id,post_id,post_url,community_key,member_slug,note,consent_version)
    VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(user_id,post_id,community_key) DO NOTHING
    RETURNING id::text,user_id,post_id,post_url,community_key,member_slug,note,status,featured,
      denial_reason,reviewed_by,reviewed_at::text,created_at::text
  `, [
    input.userId,
    post.postId,
    post.url,
    input.communityKey,
    owner.ownerSlug,
    input.note?.trim().slice(0, 280) || null,
    input.consentVersion.slice(0, 40),
  ]);
  if (rows[0]) return { nomination: publicRow(rows[0], true), created: true };
  const existing = await query<NominationRow>(
    `${SELECT} WHERE user_id=$1 AND post_id=$2 AND community_key=$3 LIMIT 1`,
    [input.userId, post.postId, input.communityKey],
  );
  return { nomination: publicRow(existing.rows[0]!, true), created: false };
}

export async function listXPostNominationsForAdmin(
  status: XNominationStatus | "all" = "pending",
): Promise<XNominationAdmin[]> {
  await ensureXIntegrationSchema();
  const { rows } = await query<NominationRow>(
    `${SELECT} WHERE ($1::text='all' OR status=$1)
      ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,created_at ASC LIMIT 200`,
    [status],
  );
  return rows.map((row) => ({
    ...publicRow(row, true),
    userId: row.user_id ?? "",
    reviewedBy: row.reviewed_by ?? null,
  }));
}

export async function moderateXPostNomination(input: {
  id: string;
  actorEmail: string;
  status: XNominationStatus;
  featured: boolean;
  denialReason?: string | null;
}): Promise<XNominationAdmin | null> {
  await ensureXIntegrationSchema();
  return withTransaction(async (client) => {
    // A site has one featured X slot. Serialize every moderation decision so
    // two admins cannot feature separate rows concurrently.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('coreboys:x-single-featured-post'))");
    const before = await client.query<NominationRow>(
      `${SELECT} WHERE id=$1 FOR UPDATE`,
      [input.id],
    );
    const current = before.rows[0];
    if (!current) return null;
    const featured = input.status === "approved" && input.featured;
    const reason = input.status === "denied" ? input.denialReason?.trim().slice(0, 240) || "Not selected" : null;
    if (featured) {
      const displaced = await client.query<NominationRow>(
        `${SELECT} WHERE status='approved' AND featured=true AND id<>$1 FOR UPDATE`,
        [input.id],
      );
      for (const previous of displaced.rows) {
        const cleared = await client.query<NominationRow>(`
          UPDATE x_post_nominations SET featured=false,updated_at=now()
          WHERE id=$1
          RETURNING id::text,user_id,post_id,post_url,community_key,member_slug,note,status,featured,
            denial_reason,reviewed_by,reviewed_at::text,created_at::text
        `, [previous.id]);
        await client.query(
          `INSERT INTO x_nomination_audit(nomination_id,actor_email,action,before_state,after_state)
           VALUES($1,$2,'nomination.unfeatured',$3::jsonb,$4::jsonb)`,
          [previous.id, input.actorEmail, JSON.stringify(previous), JSON.stringify(cleared.rows[0])],
        );
      }
    }
    const updated = await client.query<NominationRow>(`
      UPDATE x_post_nominations SET status=$2,featured=$3,denial_reason=$4,
        reviewed_by=$5,reviewed_at=now(),updated_at=now()
      WHERE id=$1
      RETURNING id::text,user_id,post_id,post_url,community_key,member_slug,note,status,featured,
        denial_reason,reviewed_by,reviewed_at::text,created_at::text
    `, [input.id, input.status, featured, reason, input.actorEmail]);
    const next = updated.rows[0]!;
    await client.query(
      `INSERT INTO x_nomination_audit(nomination_id,actor_email,action,before_state,after_state)
       VALUES($1,$2,$3,$4::jsonb,$5::jsonb)`,
      [input.id, input.actorEmail, `nomination.${input.status}`, JSON.stringify(current), JSON.stringify(next)],
    );
    return {
      ...publicRow(next, true),
      userId: next.user_id ?? "",
      reviewedBy: next.reviewed_by ?? null,
    };
  });
}
