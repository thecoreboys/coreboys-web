import "server-only";

import type { FeedItem } from "@/components/feed/types";
import { configuredXRosterFeedAccounts } from "@/lib/x/roster";
import {
  applyXQuoteLookup,
  collectPendingXQuoteReferences,
  fetchXRecentSearchOnce,
  fetchXQuoteLookupOnce,
  fetchXFullArchiveSearch,
  type XFeedAccount,
} from "@/lib/x-feed-request";

export type { XFeedAccount } from "@/lib/x-feed-request";

/** The six member accounts and the CORE organization account, in one query. */
export function configuredXFeedAccounts(): XFeedAccount[] {
  return configuredXRosterFeedAccounts();
}

/**
 * Cron-only X transport. Render paths must use getXFeedSnapshot instead.
 * Errors intentionally propagate so a failed refresh preserves the last
 * successful durable snapshot.
 */
export async function fetchConfiguredXFeedOnce(
  accounts: readonly XFeedAccount[],
  options?: { sinceId?: string },
): Promise<FeedItem[]> {
  const bearerToken = process.env.X_BEARER_TOKEN?.trim();
  if (!bearerToken) {
    throw new Error("X_BEARER_TOKEN is not configured");
  }
  return fetchXRecentSearchOnce(accounts, {
    bearerToken,
    sinceId: options?.sinceId,
  });
}

/**
 * One optional, centrally scheduled lookup for older snapshot posts whose
 * quoted statuses predate quote expansion support. Page renders never call
 * this transport. The caller is responsible for the separate X read budget.
 */
export async function hydrateConfiguredXQuotesOnce(
  items: readonly FeedItem[],
): Promise<{
  items: FeedItem[];
  requestedCount: number;
  resolvedCount: number;
  resolvedUserCount: number;
  unavailableCount: number;
}> {
  const references = collectPendingXQuoteReferences(items);
  if (!references.length) {
    return {
      items: [...items],
      requestedCount: 0,
      resolvedCount: 0,
      resolvedUserCount: 0,
      unavailableCount: 0,
    };
  }
  const bearerToken = process.env.X_BEARER_TOKEN?.trim();
  if (!bearerToken) throw new Error("X_BEARER_TOKEN is not configured");
  const result = await fetchXQuoteLookupOnce(references, { bearerToken });
  return {
    items: applyXQuoteLookup(items, result),
    requestedCount: references.length,
    resolvedCount: result.quotes.size,
    resolvedUserCount: new Set(
      [...result.quotes.values()].map((quote) => quote.authorHandle.toLowerCase()),
    ).size,
    unavailableCount: result.unavailableIds.size,
  };
}

/**
 * Legacy explicit full-archive transport. Routine refresh does not call this;
 * guarded six-month history now runs through the resumable Social Fetch admin
 * backfill so it cannot monopolize a scheduled request or bypass that cap.
 */
export async function fetchConfiguredXFeedHistory(
  accounts: readonly XFeedAccount[],
): Promise<FeedItem[]> {
  const bearerToken = process.env.X_BEARER_TOKEN?.trim();
  if (!bearerToken) throw new Error("X_BEARER_TOKEN is not configured");
  const start = new Date();
  start.setUTCMonth(start.getUTCMonth() - 6);
  return fetchXFullArchiveSearch(accounts, {
    bearerToken,
    startTime: start.toISOString(),
    maxPages: Number(process.env.X_FEED_FULL_ARCHIVE_MAX_PAGES) || 20,
  });
}
