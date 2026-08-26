import "server-only";

import type { PoolClient } from "pg";
import { withTransaction } from "@/lib/db";
import type { XCommunityDirectoryEntry } from "./types";
import { ensureXIntegrationSchema } from "./schema";
import {
  reconcileXApiReservationInTransaction,
  reserveXApiBudgetInTransaction,
  type XBudgetGateReason,
  xApiPricing,
} from "./usage";

const SUCCESS_TTL_HOURS = 24;
const FAILURE_BACKOFF_HOURS = 6;
const LOOKUP_TIMEOUT_MS = 10_000;

export type XCommunityRefreshResult = {
  status: "refreshed" | "not_due" | "locked" | "unconfigured" | "budget_blocked";
  refreshed: number;
  attempted?: number;
  reason?: XBudgetGateReason;
};

async function writeCache(
  client: PoolClient,
  cacheKey: string,
  payload: unknown,
  hours: number,
): Promise<void> {
  await client.query(
    `INSERT INTO x_api_cache(cache_key,payload,fetched_at,expires_at,last_accessed_at,hit_count)
     VALUES($1,$2::jsonb,now(),now()+($3::text||' hours')::interval,now(),0)
     ON CONFLICT(cache_key) DO UPDATE SET payload=EXCLUDED.payload,fetched_at=now(),
       expires_at=EXCLUDED.expires_at,last_accessed_at=now()`,
    [cacheKey, JSON.stringify(payload), String(hours)],
  );
}

/**
 * Cron-only Community lookup. Visitor requests only read x_api_cache. Every
 * due lookup is covered by one worst-case budget reservation before any X
 * request, and transient/provider failures get a short negative-cache lease
 * so a broken credential is not retried every hour.
 */
export async function refreshConfiguredXCommunityMetadata(
  entries: readonly XCommunityDirectoryEntry[],
): Promise<XCommunityRefreshResult> {
  const bearer = process.env.X_BEARER_TOKEN?.trim();
  const configured = entries.filter(
    (entry): entry is XCommunityDirectoryEntry & { communityId: string } => Boolean(entry.communityId),
  );
  if (!bearer || configured.length === 0) return { status: "unconfigured", refreshed: 0 };
  await ensureXIntegrationSchema();

  return withTransaction(async (client) => {
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_xact_lock(hashtext('coreboys:x-community-metadata-refresh:v1')) AS locked",
    );
    if (!lock.rows[0]?.locked) return { status: "locked", refreshed: 0 };

    const due: Array<XCommunityDirectoryEntry & { communityId: string }> = [];
    for (const entry of configured) {
      const current = await client.query(
        "SELECT 1 FROM x_api_cache WHERE cache_key=$1 AND expires_at>now()",
        [`community:${entry.communityId}`],
      );
      if (!current.rows[0]) due.push(entry);
    }
    if (due.length === 0) return { status: "not_due", refreshed: 0 };

    const unitPrice = xApiPricing().readUserMicrousd;
    const gate = await reserveXApiBudgetInTransaction(client, {
      category: "read",
      operation: "community.lookup",
      worstCaseMicrousd: due.length * unitPrice,
      credentialsReady: true,
    });
    if (!gate.ok) {
      return { status: "budget_blocked", refreshed: 0, attempted: 0, reason: gate.reason };
    }

    let refreshed = 0;
    let attempted = 0;
    let failed = 0;
    const params = new URLSearchParams({
      "community.fields": "id,name,description,member_count,created_at",
    });

    for (const entry of due) {
      const cacheKey = `community:${entry.communityId}`;
      attempted += 1;
      try {
        const response = await fetch(
          `https://api.x.com/2/communities/${entry.communityId}?${params}`,
          {
            headers: { Authorization: `Bearer ${bearer}` },
            cache: "no-store",
            signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
          },
        );
        if (!response.ok) throw new Error("x_community_lookup_failed");
        const body = (await response.json()) as {
          data?: { name?: string; description?: string; member_count?: number };
        };
        if (!body.data) throw new Error("x_community_lookup_invalid");
        await writeCache(client, cacheKey, {
          name: body.data.name?.trim().slice(0, 100),
          description: body.data.description?.trim().slice(0, 240),
          memberCount: Number.isFinite(body.data.member_count) ? body.data.member_count : undefined,
        }, SUCCESS_TTL_HOURS);
        refreshed += 1;
      } catch {
        failed += 1;
        await writeCache(client, cacheKey, { unavailable: true }, FAILURE_BACKOFF_HOURS);
      }
    }

    await reconcileXApiReservationInTransaction(client, {
      reservationId: gate.reservation.id,
      endpoint: "/2/communities/:id",
      operation: "community.lookup",
      resourceCount: attempted,
      actualCostMicrousd: attempted * unitPrice,
      success: failed === 0,
    });
    return { status: "refreshed", refreshed, attempted };
  });
}
