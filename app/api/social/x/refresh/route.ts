import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { FeedItem, XFeedQuoteReference } from "@/components/feed/types";
import {
  configuredXFeedAccounts,
  fetchConfiguredXFeedOnce,
  hydrateConfiguredXQuotesOnce,
} from "@/lib/x-feed-upstream";
import {
  collectXQuoteLookupReferences,
} from "@/lib/x-feed-request";
import { completeXContentVerification, reserveXContentVerification } from "@/lib/x-content-verification";
import { advanceXSearchPage, type XSearchContinuation } from "@/lib/x-feed-pagination";
import {
  getXFeedSnapshot,
  refreshXFeedSnapshot,
  xFeedRefreshFailureCode,
} from "@/lib/x-feed-snapshot";
import { drainSocialNotificationDeliveries } from "@/lib/social-delivery";
import {
  isFreshSocialEvent,
  socialNotificationMaxAgeMs,
} from "@/lib/social-event-normalization";
import {
  recordSocialEvent,
  socialEventFromFeedItem,
  type SocialEventInput,
} from "@/lib/social-events";
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

function freshUniqueXEvents(items: readonly FeedItem[]): SocialEventInput[] {
  const now = Date.now();
  const maxAgeMs = socialNotificationMaxAgeMs();
  const byCanonicalId = new Map<string, SocialEventInput>();
  for (const item of items) {
    if (item.platform !== "x") continue;
    const event = socialEventFromFeedItem(item);
    if (!event || !isFreshSocialEvent(event.publishedAt, now, maxAgeMs)) continue;
    if (!byCanonicalId.has(event.canonicalId)) {
      byCanonicalId.set(event.canonicalId, event);
    }
  }
  return [...byCanonicalId.values()];
}

async function persistFreshXEvents(items: readonly FeedItem[]) {
  const events = freshUniqueXEvents(items);
  let created = 0;
  for (const event of events) {
    // Leave `notify` unset: recordSocialEvent performs the authoritative second
    // freshness check and idempotently repairs fanout for an eligible retry.
    const result = await recordSocialEvent(event);
    if (result.created) created += 1;
  }
  return { candidates: events.length, created };
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
    let searchCursor: string | undefined;
    let searchContinuation: XSearchContinuation | null | undefined;
    let budgetGateReason: XBudgetGateReason | null = null;
    let quoteHydration: "not_needed" | "hydrated" | "unavailable" | "skipped_budget" | "failed" = "not_needed";
    let eventCandidates: FeedItem[] = [];
    const result = await refreshXFeedSnapshot(
      async (existing) => {
        const pricing = xApiPricing();
        // A new crew account must get its initial recent window even when a
        // different creator already advanced the shared cursor.
        const pendingWindow = existing.sourceAccountsChanged ? undefined : existing.searchContinuation;
        const sinceId = existing.sourceAccountsChanged
          ? undefined
          : pendingWindow ? pendingWindow.sinceId : existing.searchCursor;
        // One budgeted page per scheduled run. A busy window resumes on the
        // next run rather than discarding older pages after the first 100.
        // Six-month history remains the guarded Social Fetch admin backfill.
        const maximumResources = 100;
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
          const page = await fetchConfiguredXFeedOnce(accounts, { sinceId, nextToken: pendingWindow?.nextToken });
          const items = page.items;
          // Webhook posts also live in the snapshot. Only a completed search
          // may advance this cursor, or a streamed post could skip another
          // account's still-unseen update during polling recovery.
          const progress = advanceXSearchPage(page, { sinceId, highWatermark: pendingWindow?.highWatermark });
          searchCursor = progress.searchCursor;
          searchContinuation = progress.continuation;
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
            endpoint: "/2/tweets/search/recent",
            operation: "feed.snapshot.refresh",
            resourceCount: fetchedPostCount,
            actualCostMicrousd,
            success: true,
          });

          // Share one bounded lookup between legacy hydration and the daily
          // verification of known primary/quoted posts, including outsiders.
          const snapshotItems = [...items, ...existing.items];
          eventCandidates = snapshotItems;
          let verification: XFeedQuoteReference[] = [];
          try {
            verification = await reserveXContentVerification(snapshotItems);
          } catch {
            // A missing/unavailable verification store never authorizes extra
            // reads. Ordinary hydration can still use its existing budget.
          }
          const lookupReferences = collectXQuoteLookupReferences(snapshotItems, verification);
          if (!lookupReferences.length) return snapshotItems;

          try {
            const quoteGate = await reserveXApiBudget({
              category: "read",
              operation: "feed.snapshot.quote_hydration",
              worstCaseMicrousd: lookupReferences.length * (
                pricing.readPostMicrousd + pricing.readUserMicrousd
              ),
              credentialsReady: Boolean(process.env.X_BEARER_TOKEN?.trim()),
            });
            if (!quoteGate.ok) {
              quoteHydration = "skipped_budget";
              return snapshotItems;
            }

            try {
              const hydrated = await hydrateConfiguredXQuotesOnce(snapshotItems, verification);
              const quoteActualCost =
                hydrated.resolvedCount * pricing.readPostMicrousd +
                hydrated.resolvedUserCount * pricing.readUserMicrousd;
              await reconcileXApiReservation({
                reservationId: quoteGate.reservation.id,
                endpoint: "/2/tweets",
                operation: "feed.snapshot.quote_hydration",
                resourceCount: hydrated.resolvedCount,
                actualCostMicrousd: quoteActualCost,
                success: true,
              });
              try {
                await completeXContentVerification(verification, hydrated.lookup);
              } catch {
                // The durable daily reservation still prevents duplicate paid
                // reads. Unfinished outcomes remain eligible for later checks.
              }
              quoteHydration = hydrated.unavailableCount > 0 && hydrated.resolvedCount === 0
                ? "unavailable"
                : "hydrated";
              eventCandidates = hydrated.items;
              return hydrated.items;
            } catch {
              await reconcileXApiReservation({
                reservationId: quoteGate.reservation.id,
                endpoint: "/2/tweets",
                operation: "feed.snapshot.quote_hydration",
                resourceCount: 0,
                actualCostMicrousd: 0,
                success: false,
              });
              quoteHydration = "failed";
              return snapshotItems;
            }
          } catch {
            // Quote enrichment is additive. A temporary quote lookup/budget
            // failure must never hide successfully refreshed primary posts.
            quoteHydration = "failed";
            return snapshotItems;
          }
        } catch (error) {
          // A provider failure returned no billable resources. If parsing or
          // persistence failed after resources were received, the captured
          // count is still reconciled conservatively.
          await reconcileXApiReservation({
            reservationId: gate.reservation.id,
            endpoint: "/2/tweets/search/recent",
            operation: "feed.snapshot.refresh",
            resourceCount: fetchedPostCount,
            actualCostMicrousd:
              fetchedPostCount * pricing.readPostMicrousd
              + fetchedUserCount * pricing.readUserMicrousd,
            success: false,
          });
          throw error;
        }
      },
      {
        sourceAccountKeys: accounts.map((account) => `${account.authorSlug ?? "core"}:${account.handle.toLowerCase().replace(/^@/, "")}`),
        searchCursor: () => searchCursor,
        searchContinuation: () => searchContinuation ?? null,
      },
    );

    let socialEvents = { candidates: 0, created: 0 };
    let deliveries: Awaited<ReturnType<typeof drainSocialNotificationDeliveries>> | null = null;
    if (result.ok && result.status !== "locked") {
      // Persist and fan out immediately after the snapshot transaction commits.
      // A post-commit failure returns non-2xx. An immediate retry may be
      // throttled before another X read, so re-read the committed snapshot in
      // that case and repair event fanout without spending provider credits.
      const candidates = eventCandidates.length > 0
        ? eventCandidates
        : await getXFeedSnapshot();
      socialEvents = await persistFreshXEvents(candidates);
      deliveries = await drainSocialNotificationDeliveries(100);
    }
    return NextResponse.json(
      budgetGateReason
        ? { ...result, budgetGate: { allowed: false, reason: budgetGateReason } }
        : { ...result, ...(searchContinuation === undefined ? {} : { catchingUp: searchContinuation !== null }), quoteHydration, socialEvents, deliveries },
      {
        status: result.ok ? 200 : budgetGateReason ? 503 : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, status: "failed", failureCode: xFeedRefreshFailureCode(error) },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
