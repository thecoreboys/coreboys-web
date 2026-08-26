import "server-only";

import { query } from "@/lib/db";
import type { XCommunityDirectoryEntry } from "./types";
import { ensureXIntegrationSchema } from "./schema";

type CommunityMetadata = {
  name?: string;
  description?: string;
  memberCount?: number;
  unavailable?: boolean;
};

async function cachedCommunity(id: string): Promise<CommunityMetadata | null> {
  await ensureXIntegrationSchema();
  const key = `community:${id}`;
  const { rows } = await query<{ payload: CommunityMetadata }>(
    `UPDATE x_api_cache SET hit_count=hit_count+1,last_accessed_at=now()
      WHERE cache_key=$1 AND expires_at>now()
      RETURNING payload`,
    [key],
  );
  if (!rows[0]) return null;
  return rows[0].payload;
}

export async function enrichXCommunityDirectory(
  entries: readonly XCommunityDirectoryEntry[],
): Promise<XCommunityDirectoryEntry[]> {
  return Promise.all(entries.map(async (entry) => {
    if (!entry.communityId) return entry;
    try {
      // Visitor-facing directory reads are cache-only. X is refreshed solely
      // by the protected roster cron, so a page view can never create another
      // billable X request. Missing metadata falls back to checked-in copy.
      const metadata = await cachedCommunity(entry.communityId);
      if (!metadata || metadata.unavailable) return { ...entry, metadataState: "unavailable" };
      return {
        ...entry,
        name: metadata.name || entry.name,
        description: metadata.description || entry.description,
        memberCount: metadata.memberCount ?? entry.memberCount,
        metadataState: "verified",
      };
    } catch {
      return { ...entry, metadataState: "unavailable" };
    }
  }));
}
