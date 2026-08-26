import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  configuredXFeedAccounts,
  fetchConfiguredXFeedHistory,
  fetchConfiguredXFeedOnce,
} from "@/lib/x-feed-upstream";
import { refreshXFeedSnapshot } from "@/lib/x-feed-snapshot";
import {
  reconcileXApiReservation,
  reserveXApiBudget,
  type XBudgetGateReason,
  xApiPricing,
} from "@/lib/x/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secretsMatch(expected: string, supplied: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The sole production roster-feed reader. Website render paths only read the
 * durable Postgres snapshot; the advisory lock inside refreshXFeedSnapshot
 * also prevents overlapping schedulers from issuing duplicate X requests.
 */
export async function POST(request: Request) {
  const expected = process.env.METRICS_CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret")?.trim() ?? "";
  if (!expected) {
    return NextResponse.json(
      { error: "x_refresh_not_configured" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!supplied || !secretsMatch(expected, supplied)) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const localRefreshAllowed =
    process.env.NODE_ENV !== "production" &&
    process.env.X_FEED_ALLOW_LOCAL_REFRESH === "true";
  if (process.env.NODE_ENV !== "production" && !localRefreshAllowed) {
    return NextResponse.json(
      { error: "x_refresh_production_only" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const accounts = configuredXFeedAccounts();
    let fetchedPostCount = 0;
    let fetchedUserCount = 0;
    let budgetGateReason: XBudgetGateReason | null = null;
    let historyBackfilled = false;
    const result = await refreshXFeedSnapshot(
      async (existing) => {
        const pricing = xApiPricing();
        const shouldBackfill =
          process.env.X_FEED_FULL_ARCHIVE_BACKFILL === "true" &&
          !existing.historyBackfilled;
        const archivePages = Math.max(1, Math.min(20, Number(process.env.X_FEED_FULL_ARCHIVE_MAX_PAGES) || 20));
        // buildXRecentSearchUrl uses this same bounded max_results formula.
        const maximumResources = shouldBackfill
          ? 500 * archivePages
          : Math.max(10, Math.min(100, accounts.length * 12));
        // author_id expansion returns user resources alongside Post resources,
        // so reserve both documented unit prices before the one X request.
        const worstCaseMicrousd =
          pricing.readPostMicrousd > 0 && pricing.readUserMicrousd > 0
            ? maximumResources * pricing.readPostMicrousd
              + accounts.length * pricing.readUserMicrousd
            : 0;
        const gate = await reserveXApiBudget({
          category: "read",
          operation: "feed.snapshot.refresh",
          worstCaseMicrousd,
          credentialsReady: Boolean(process.env.X_BEARER_TOKEN?.trim()),
        });
        if (!gate.ok) {
          budgetGateReason = gate.reason;
          throw new Error(`x_read_budget_${gate.reason}`);
        }

        try {
          const items = shouldBackfill
            ? await fetchConfiguredXFeedHistory(accounts)
            : await fetchConfiguredXFeedOnce(accounts);
          historyBackfilled = shouldBackfill;
          fetchedPostCount = new Set(items.map((item) => {
            const status = /\/status\/(\d{5,25})/i.exec(item.sourceUrl ?? item.url)?.[1];
            return status ?? item.id;
          })).size;
          fetchedUserCount = new Set(
            items.map((item) => item.x?.authorId).filter(Boolean),
          ).size;
          const actualCostMicrousd =
            fetchedPostCount * pricing.readPostMicrousd
            + fetchedUserCount * pricing.readUserMicrousd;
          await reconcileXApiReservation({
            reservationId: gate.reservation.id,
            endpoint: shouldBackfill ? "/2/tweets/search/all" : "/2/tweets/search/recent",
            operation: shouldBackfill ? "feed.snapshot.history_backfill" : "feed.snapshot.refresh",
            resourceCount: fetchedPostCount,
            actualCostMicrousd,
            success: true,
          });
          return items;
        } catch (error) {
          // A provider failure returned no billable resources. If parsing or
          // persistence failed after resources were received, the captured
          // count is still reconciled conservatively.
          await reconcileXApiReservation({
            reservationId: gate.reservation.id,
            endpoint: shouldBackfill ? "/2/tweets/search/all" : "/2/tweets/search/recent",
            operation: shouldBackfill ? "feed.snapshot.history_backfill" : "feed.snapshot.refresh",
            resourceCount: fetchedPostCount,
            actualCostMicrousd:
              fetchedPostCount * pricing.readPostMicrousd
              + fetchedUserCount * pricing.readUserMicrousd,
            success: false,
          });
          throw error;
        }
      },
      { historyBackfilled: () => historyBackfilled },
    );
    return NextResponse.json(
      budgetGateReason
        ? { ...result, budgetGate: { allowed: false, reason: budgetGateReason } }
        : result,
      {
        status: result.ok ? 200 : budgetGateReason ? 503 : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json(
      { ok: false, status: "failed" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
