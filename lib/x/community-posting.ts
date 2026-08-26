/**
 * X currently documents Community lookup/search metadata, but no endpoint for
 * publishing a Post into a Community. A normal POST /2/tweets is not treated
 * as equivalent. Keep this boundary explicit so UI cannot imply otherwise.
 */
export const X_COMMUNITY_POSTING_CAPABILITY = {
  enabled: false as const,
  status: "deferred" as const,
  reason: "x_community_publish_api_undocumented" as const,
  message: "Posting into an X Community is unavailable until X documents and grants a Community publishing API.",
  documentation: "https://docs.x.com/x-api/communities/lookup/introduction",
};

export function canPublishToXCommunity(): false {
  return false;
}
