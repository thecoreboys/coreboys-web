import "server-only";

import type { FeedItem, XFeedQuoteReference } from "@/components/feed/types";
import { query, withTransaction } from "@/lib/db";
import { recordContentRemoval } from "@/lib/content-availability";
import type { XQuoteLookupResult } from "@/lib/x-feed-request";

export const X_CONTENT_VERIFICATION_DAILY_LIMIT = 10;

/** Previously hydrated quotes are known objects, even outside the roster. */
export function knownXContentCandidates(items: readonly FeedItem[]) {
  const candidates = new Map<string, number>();
  for (const item of items) {
    if (item.platform !== "x") continue;
    const primary = item.x?.statusId;
    const quote = item.x?.quote?.statusId;
    if (primary && /^\d{5,25}$/.test(primary) && !candidates.has(primary)) candidates.set(primary, 1);
    if (quote && /^\d{5,25}$/.test(quote)) candidates.set(quote, 0);
  }
  return [...candidates].map(([statusId, priority]) => ({ statusId, priority }));
}

/**
 * Called only by the authenticated shared X refresh, never by page readers.
 * Claiming advances the durable clock before any request. Budget denial or a
 * crash therefore costs freshness, never an extra request on the next run.
 */
export async function reserveXContentVerification(items: readonly FeedItem[]): Promise<XFeedQuoteReference[]> {
  const candidates = knownXContentCandidates(items);
  return withTransaction(async (client) => {
    if (candidates.length) {
      await client.query(`INSERT INTO x_content_verification_checks(status_id,priority)
        SELECT * FROM unnest($1::text[],$2::smallint[])
        ON CONFLICT(status_id) DO UPDATE SET priority=LEAST(x_content_verification_checks.priority,EXCLUDED.priority)`,
      [candidates.map((item) => item.statusId), candidates.map((item) => item.priority)]);
    }
    const claim = await client.query(`UPDATE x_content_verification_schedule
      SET next_run_at=now()+interval '24 hours' WHERE lane='stored_posts' AND next_run_at<=now() RETURNING lane`);
    if (!claim.rows.length) return [];
    const due = await client.query<{ status_id: string }>(`SELECT status_id FROM x_content_verification_checks
      WHERE next_check_at<=now() AND last_outcome<>'not_found'
      AND NOT EXISTS (SELECT 1 FROM content_tombstones WHERE content_key='x:id:'||status_id)
      ORDER BY last_attempt_at NULLS FIRST,priority,first_seen_at,status_id LIMIT $1`, [X_CONTENT_VERIFICATION_DAILY_LIMIT]);
    const ids = due.rows.map((row) => row.status_id).slice(0, X_CONTENT_VERIFICATION_DAILY_LIMIT);
    if (ids.length) {
      await client.query(`UPDATE x_content_verification_checks SET last_attempt_at=now(),next_check_at=now()+interval '24 hours'
        WHERE status_id=ANY($1::text[])`, [ids]);
    }
    return ids.map((statusId) => ({ statusId, statusUrl: `https://x.com/i/status/${statusId}` }));
  });
}

/** Persist only explicit, requested, previously known missing objects. */
export async function completeXContentVerification(
  references: readonly XFeedQuoteReference[],
  result: XQuoteLookupResult,
): Promise<{ checked: number; removed: number; unknown: number }> {
  const ids = [...new Set(references.map((item) => item.statusId).filter((id) => /^\d{5,25}$/.test(id)))].slice(0, X_CONTENT_VERIFICATION_DAILY_LIMIT);
  let removed = 0;
  let unknown = 0;
  for (const statusId of ids) {
    let outcome = result.foundIds?.has(statusId) ? "found" : "unknown";
    if (outcome !== "found" && result.confirmedMissingIds?.has(statusId)) {
      try {
        await recordContentRemoval({ provider: "x", providerId: statusId, reason: "not_found", evidence: "provider_lookup" });
        outcome = "not_found";
        removed += 1;
      } catch {
        // Retain this candidate for a later bounded retry if persistence fails.
      }
    }
    if (outcome === "unknown") unknown += 1;
    await query(`UPDATE x_content_verification_checks SET last_checked_at=now(),last_outcome=$2
      WHERE status_id=$1`, [statusId, outcome]);
  }
  return { checked: ids.length, removed, unknown };
}
