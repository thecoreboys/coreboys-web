import "server-only";

import type { FeedItem } from "@/components/feed/types";
import { configuredXRosterFeedAccounts } from "@/lib/x/roster";
import {
  fetchXRecentSearchOnce,
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
  perAccountLimit = 12,
): Promise<FeedItem[]> {
  const bearerToken = process.env.X_BEARER_TOKEN?.trim();
  if (!bearerToken) {
    throw new Error("X_BEARER_TOKEN is not configured");
  }
  return fetchXRecentSearchOnce(accounts, {
    bearerToken,
    perAccountLimit,
  });
}

/** One-time six-month backfill. Enabled only when the X app has full archive access. */
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
