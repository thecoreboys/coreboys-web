import { newestXSnapshotStatusId, type XRecentSearchPage } from "@/lib/x-feed-request";

export type XSearchContinuation = {
  nextToken: string;
  sinceId?: string;
  highWatermark?: string;
};

/** Keep the original lower boundary until every older page has been saved. */
export function advanceXSearchPage(
  page: XRecentSearchPage,
  window: { sinceId?: string; highWatermark?: string },
): { searchCursor?: string; continuation: XSearchContinuation | null } {
  const newest = newestXSnapshotStatusId(page.items);
  const highWatermark = newest && (!window.highWatermark || BigInt(newest) > BigInt(window.highWatermark))
    ? newest
    : window.highWatermark;
  if (page.nextToken) {
    return {
      // The completed cursor intentionally remains unchanged during catch-up.
      continuation: { nextToken: page.nextToken, sinceId: window.sinceId, highWatermark },
    };
  }
  return { searchCursor: highWatermark ?? window.sinceId, continuation: null };
}
