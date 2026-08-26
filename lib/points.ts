/**
 * Fan points + badge tiers (Feature 1).
 *
 * The `fan_points` table is an append-only ledger. A fan's total is just
 * SUM(delta). Awards are idempotent via the partial unique index
 * `fan_points_award_uniq` on (user_id, reason, ref_type, ref_id) — so
 * re-voting / re-upvoting the same thing never double-awards.
 *
 * Server-only (imports lib/db).
 */
import type { PoolClient } from "pg";
import { query, withTransaction } from "@/lib/db";
import { drainPassportActivityOutbox, enqueuePassportActivity } from "@/lib/passport/activity";

export type BadgeTier = "Tier 1 Fan" | "OG" | "Super Fan";

export type TierInfo = {
  tier: BadgeTier;
  /** Points threshold for the next tier, or null at the top. */
  nextTierAt: number | null;
};

/** Points awarded per action. Kept here so routes stay consistent. */
export const POINTS = {
  poll_vote: 10,
  clip_upvote: 5,
  signup: 25,
  connect_twitch: 25,
  connect_youtube: 25,
  connect_x: 25,
  connect_tiktok: 25,
  connect_instagram: 25,
  twitch_follow: 10,
  twitch_sub: 40,
  youtube_sub_house: 30,
  youtube_sub: 20,
  youtube_like: 2,
  x_follow: 8,
  chat_send: 1,
} as const;

export function tierFor(total: number): TierInfo {
  if (total >= 500) return { tier: "Super Fan", nextTierAt: null };
  if (total >= 100) return { tier: "OG", nextTierAt: 500 };
  return { tier: "Tier 1 Fan", nextTierAt: 100 };
}

/**
 * Award points idempotently. When refType + refId are supplied, the partial
 * unique index makes the INSERT a no-op on a repeat (ON CONFLICT DO NOTHING),
 * so callers can safely award inside an action handler that may re-run.
 * Returns true if a row was actually inserted (i.e. points newly awarded).
 */
export async function awardPoints(
  userId: string,
  delta: number,
  reason: string,
  refType?: string | null,
  refId?: string | null,
  channelSlug?: string | null,
): Promise<boolean> {
  const result=await withTransaction((client)=>awardPointsInTransaction(
    client,userId,delta,reason,refType,refId,channelSlug,
  ));

  // Delivery is best-effort, but the durable outbox row was committed in the
  // same transaction as fan_points so a transient projection failure is
  // replayable and can never lose the action.
  if(result.queued){
    try{await drainPassportActivityOutbox({userId,limit:10});}catch{/* next drain retries */}
  }
  return result.newlyAwarded;
}

/** Add legacy points and the Passport projection outbox in the caller's transaction. */
export async function awardPointsInTransaction(
  client:PoolClient,
  userId:string,
  delta:number,
  reason:string,
  refType?:string|null,
  refId?:string|null,
  channelSlug?:string|null,
):Promise<{newlyAwarded:boolean;queued:boolean}>{
    let ledgerId: string | null = null;
    let newlyAwarded=false;
    if (refType && refId) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO fan_points (user_id, delta, reason, ref_type, ref_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, reason, ref_type, ref_id)
           WHERE ref_type IS NOT NULL AND ref_id IS NOT NULL
         DO NOTHING
         RETURNING id::text`,
        [userId, delta, reason, refType, refId],
      );
      ledgerId = inserted.rows[0]?.id ?? null;
      newlyAwarded=ledgerId!==null;
      if(!ledgerId){
        const existing=await client.query<{id:string}>(
          `SELECT id::text FROM fan_points
            WHERE user_id=$1 AND reason=$2 AND ref_type=$3 AND ref_id=$4`,
          [userId,reason,refType,refId],
        );
        ledgerId=existing.rows[0]?.id ?? null;
      }
    } else {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO fan_points (user_id, delta, reason, ref_type, ref_id)
         VALUES ($1, $2, $3, NULL, NULL)
         RETURNING id::text`,
        [userId, delta, reason],
      );
      ledgerId = inserted.rows[0]?.id ?? null;
      newlyAwarded=ledgerId!==null;
    }
    if(!ledgerId)return{newlyAwarded:false,queued:false};
    await enqueuePassportActivity(client,{
      userId,
      metric: passportMetricFor(reason),
      amount: 1,
      channelSlug: channelSlug ?? passportChannelFor(reason, refType, refId),
      sourceType: refType ?? "fan_points",
      sourceId: refId ?? ledgerId,
      idempotencyKey: `fan-point:${ledgerId}`,
    });
    return{newlyAwarded,queued:true};
}

function passportMetricFor(reason: string): string {
  if (reason === "clip_upvote") return "clip_vote";
  if (reason.startsWith("connect_")) return "oauth_connect";
  return reason;
}

function passportChannelFor(
  reason: string,
  refType?: string | null,
  refId?: string | null,
): string | null {
  if (refType === "member" && refId) return refId;
  if (reason === "youtube_sub_house" || (refType === "youtube" && refId === "house")) {
    return "core";
  }
  return null;
}

export async function getPointsTotal(userId: string): Promise<number> {
  const r = await query<{ total: string | null }>(
    `SELECT COALESCE(SUM(delta), 0)::text AS total FROM fan_points WHERE user_id = $1`,
    [userId],
  );
  return Number(r.rows[0]?.total ?? 0);
}

export type PointsActivity = {
  type: string;
  label: string;
  points: number;
  at: string;
};

/**
 * Recent point-earning activity, joined to polls/clips for human labels.
 * Returns up to `limit` rows, newest first.
 */
export async function getRecentActivity(
  userId: string,
  limit = 20,
): Promise<PointsActivity[]> {
  const r = await query<{
    reason: string;
    delta: number;
    ref_type: string | null;
    created_at: string;
    poll_question: string | null;
    clip_title: string | null;
  }>(
    `SELECT fp.reason,
            fp.delta,
            fp.ref_type,
            fp.created_at::text,
            p.question AS poll_question,
            c.title    AS clip_title
       FROM fan_points fp
       LEFT JOIN polls p ON fp.ref_type = 'poll' AND p.id::text = fp.ref_id
       LEFT JOIN clips c ON fp.ref_type = 'clip' AND c.id::text = fp.ref_id
      WHERE fp.user_id = $1
      ORDER BY fp.created_at DESC
      LIMIT $2`,
    [userId, limit],
  );
  return r.rows.map((row) => ({
    type: row.reason,
    label: labelFor(row),
    points: row.delta,
    at: row.created_at,
  }));
}

function labelFor(row: {
  reason: string;
  poll_question: string | null;
  clip_title: string | null;
}): string {
  if (row.reason === "poll_vote") {
    return row.poll_question ? `Voted: ${row.poll_question}` : "Voted in a poll";
  }
  if (row.reason === "clip_upvote") {
    return row.clip_title ? `Upvoted: ${row.clip_title}` : "Upvoted a clip";
  }
  if (row.reason === "signup") return "Joined the community";
  if (row.reason === "connect_twitch") return "Connected Twitch";
  if (row.reason === "connect_youtube") return "Connected YouTube";
  if (row.reason === "connect_x") return "Connected X";
  if (row.reason === "connect_tiktok") return "Connected TikTok";
  if (row.reason === "connect_instagram") return "Connected Instagram";
  if (row.reason === "twitch_follow") return "Followed a CORE member on Twitch";
  if (row.reason === "twitch_sub") return "Subscribed to a CORE member on Twitch";
  if (row.reason === "youtube_sub_house") return "Subscribed to the CORE YouTube";
  if (row.reason === "youtube_sub") return "Subscribed to a member on YouTube";
  if (row.reason === "youtube_like") return "Liked a CORE video";
  if (row.reason === "x_follow") return "Followed CORE on X";
  if (row.reason === "chat_send") return "Chatted from the hub";
  if (row.reason === "fan_photo_approved") return "Photo approved for the FanZone wall";
  return row.reason;
}
