import "server-only";
import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import { recordContentRemoval } from "@/lib/content-availability";
import { requestSocialFetchJson } from "@/lib/social-fetch-media";
import { pruneSharedSocialFetchRequests } from "@/lib/social-fetch-request-cache";
import { createContentAvailabilityReconciler, type ContentVerificationCandidate } from "./content-verification";

/** Called only by the authenticated scheduled reconciliation route. */
export const reconcileContentAvailability = createContentAvailabilityReconciler({
  configured: () => Boolean(process.env.SOCIAL_FETCH_API_KEY?.trim()),
  async claim() {
    const token = randomUUID();
    const result = await query(
      `UPDATE content_verification_schedule
          SET lease_token=$1::uuid,lease_until=now()+interval '5 minutes',
              next_run_at=now()+interval '2 hours',last_started_at=now()
        WHERE lane='social_objects' AND next_run_at<=now()
          AND (lease_until IS NULL OR lease_until<=now()) RETURNING lane`, [token],
    );
    return (result.rowCount ?? 0) > 0 ? token : null;
  },
  async seed() {
    await pruneSharedSocialFetchRequests();
    await query(
      `INSERT INTO content_verification_checks(canonical_id,provider)
       SELECT canonical_id,provider FROM social_content_events
        WHERE provider IN ('instagram','tiktok') AND removed_at IS NULL
       ON CONFLICT(canonical_id) DO NOTHING`,
    );
  },
  async due(limit) {
    const result = await query<{ canonical_id: string; provider: ContentVerificationCandidate["provider"]; href: string }>(
      `SELECT check_state.canonical_id,check_state.provider,event.href
         FROM content_verification_checks AS check_state
         JOIN social_content_events AS event USING(canonical_id)
        WHERE check_state.next_check_at<=now() AND check_state.last_outcome<>'not_found'
          AND event.removed_at IS NULL
        ORDER BY check_state.next_check_at ASC,event.published_at DESC,check_state.canonical_id
        LIMIT $1`, [limit],
    );
    return result.rows.map((row) => ({ canonicalId: row.canonical_id, provider: row.provider, sourceUrl: row.href }));
  },
  lookup: (target) => requestSocialFetchJson(target.endpoint, 2 * 60 * 60, {
    apiVersion: target.apiVersion, feature: "content_availability", estimatedCredits: 1,
  }),
  remove: (target) => recordContentRemoval({
    provider: target.provider, providerId: target.providerId, canonicalId: target.canonicalId,
    sourceUrl: target.sourceUrl, reason: "not_found", evidence: "provider_lookup",
  }),
  async checked(candidate, outcome) {
    const seconds = outcome === "found" ? 7 * 24 * 60 * 60
      : outcome === "unknown" ? 6 * 60 * 60 : 365 * 24 * 60 * 60;
    await query(
      `UPDATE content_verification_checks
          SET last_checked_at=now(),last_outcome=$2,next_check_at=now()+($3::integer * interval '1 second')
        WHERE canonical_id=$1`, [candidate.canonicalId, outcome, seconds],
    );
  },
  async release(token) {
    await query(
      `UPDATE content_verification_schedule SET lease_token=NULL,lease_until=NULL,last_completed_at=now()
        WHERE lane='social_objects' AND lease_token=$1::uuid`, [token],
    );
  },
});
