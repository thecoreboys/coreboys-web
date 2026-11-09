import "server-only";

import type { FeedItem, XFeedQuoteReference } from "@/components/feed/types";
import { configuredXRosterFeedAccounts } from "@/lib/x/roster";
import { configuredXCrewFeedAccounts } from "@/lib/x/crew-roster";
import {
  applyXQuoteLookup,
  collectXQuoteLookupReferences,
  fetchXRecentSearchPageOnce,
  fetchXQuoteLookupOnce,
  fetchXFullArchiveSearch,
  normalizeXFeedAccounts,
  type XFeedAccount,
  type XRecentSearchPage,
  type XQuoteLookupResult,
} from "@/lib/x-feed-request";

export type { XFeedAccount } from "@/lib/x-feed-request";

/** Member, organization and crew accounts, fetched once for the whole site. */
export function configuredXFeedAccounts(): XFeedAccount[] {
  return normalizeXFeedAccounts([
    ...configuredXRosterFeedAccounts(),
    ...configuredXCrewFeedAccounts(),
  ]);
}

/**
 * Cron-only X transport. Render paths must use getXFeedSnapshot instead.
 * Errors intentionally propagate so a failed refresh preserves the last
 * successful durable snapshot.
 */
export async function fetchConfiguredXFeedOnce(
  accounts: readonly XFeedAccount[],
  options?: { sinceId?: string; nextToken?: string },
): Promise<XRecentSearchPage> {
  const bearerToken = process.env.X_BEARER_TOKEN?.trim();
  if (!bearerToken) {
    throw new Error("X_BEARER_TOKEN is not configured");
  }
  return fetchXRecentSearchPageOnce(accounts, {
    bearerToken,
    sinceId: options?.sinceId,
    nextToken: options?.nextToken,
  });
}

/**
 * One optional, centrally scheduled lookup for older snapshot posts whose
 * quoted statuses predate quote expansion support. Page renders never call
 * this transport. The caller is responsible for the separate X read budget.
 */
export async function hydrateConfiguredXQuotesOnce(
  items: readonly FeedItem[],
  verification: readonly XFeedQuoteReference[] = [],
): Promise<{
  items: FeedItem[];
  requestedCount: number;
  resolvedCount: number;
  resolvedUserCount: number;
  unavailableCount: number;
  lookup: XQuoteLookupResult;
}> {
  const references = collectXQuoteLookupReferences(items, verification);
  if (!references.length) {
    return {
      items: [...items],
      requestedCount: 0,
      resolvedCount: 0,
      resolvedUserCount: 0,
      unavailableCount: 0,
      lookup: { quotes: new Map(), unavailableIds: new Set(), foundIds: new Set(), confirmedMissingIds: new Set(), returnedUserCount: 0 },
    };
  }
  const bearerToken = process.env.X_BEARER_TOKEN?.trim();
  if (!bearerToken) throw new Error("X_BEARER_TOKEN is not configured");
  const result = await fetchXQuoteLookupOnce(references, { bearerToken });
  return {
    items: applyXQuoteLookup(items, result),
    requestedCount: references.length,
    resolvedCount: result.foundIds?.size ?? result.quotes.size,
    resolvedUserCount: result.returnedUserCount ?? new Set(
      [...result.quotes.values()].map((quote) => quote.authorHandle.toLowerCase()),
    ).size,
    unavailableCount: result.unavailableIds.size,
    lookup: result,
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
