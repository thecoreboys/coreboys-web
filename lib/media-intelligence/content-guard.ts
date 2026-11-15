import "server-only";
import type { PoolClient } from "pg";
import { getPool, withTransaction } from "@/lib/db";
import { getUnavailableContentKeys, lockContentReferences } from "@/lib/content-availability";
import { contentReferencesIncludingQuotes, sanitizeAvailableContent, type ContentIdentityInput } from "@/lib/content-identity";
import { ensureMediaIntelligenceSchema, getMediaIntelligencePool, withMediaIntelligenceTransaction,
  type MediaIntelligenceCapabilities } from "./schema";

/** A stale ingestion job cannot insert after the deletion cleanup has completed. */
export async function withAvailableMediaContent<T, Item extends ContentIdentityInput>(item: Item,
  write: (client: PoolClient, capabilities: MediaIntelligenceCapabilities, availableItem: Item) => Promise<T>): Promise<T> {
  await ensureMediaIntelligenceSchema();
  const check = async (client: PoolClient) => {
    // A quote or DVR recording is a separate removable source. Its deletion
    // must serialize with a parent write just like removal of the parent itself.
    await lockContentReferences(client, contentReferencesIncludingQuotes(item));
    const available = sanitizeAvailableContent([item], await getUnavailableContentKeys([item], client))[0];
    if (!available) throw new Error("content_removed");
    return available;
  };
  if (getMediaIntelligencePool() === getPool()) {
    // Production commonly shares its small pool. Reuse the transaction instead
    // of acquiring a nested connection that could exhaust all three slots.
    return withMediaIntelligenceTransaction(async (client, capabilities) => {
      const available = await check(client);
      return write(client, capabilities, available);
    });
  }
  // With separate stores, retain the primary lock until the media commit has
  // finished, so the deletion cleanup cannot overtake an uncommitted asset.
  return withTransaction(async (client) => {
    const available = await check(client);
    return withMediaIntelligenceTransaction((mediaClient, capabilities) => write(mediaClient, capabilities, available));
  });
}
