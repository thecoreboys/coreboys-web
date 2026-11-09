import "server-only";
import { getUnavailableContentKeys } from "@/lib/content-availability";
import { sanitizeAvailableContent } from "@/lib/content-identity";
import { query } from "@/lib/db";
import { contentFingerprint } from "./fingerprint";
import { getAzureMediaAdapters, readAzureMediaConfig } from "./azure";
import { getEmbeddingProvider } from "./embedding";
import { getMediaIntelligenceStore } from "./postgres-store";
import { mediaIntelligenceQuery, withMediaIntelligenceTransaction } from "./schema";

async function loadIndexDocuments() {
  const embedding = getEmbeddingProvider();
  const documents = await getMediaIntelligenceStore().searchDocuments(embedding.name, embedding.model, {});
  const blocked = await getUnavailableContentKeys(documents.map((document) => document.asset.item));
  return documents.flatMap((document) => {
    const item = sanitizeAvailableContent([document.asset.item], blocked)[0];
    return item ? [{ ...document, asset: { ...document.asset, item } }] : [];
  });
}

export async function publishMediaIndexGeneration(): Promise<{
  generationId: string;
  provider: string;
  status: "active" | "local-only";
  documentCount: number;
}> {
  const config = readAzureMediaConfig();
  const adapter = getAzureMediaAdapters().aiSearch;
  const provider = adapter?.name ?? "local-postgres";
  const indexName = config.aiSearch.indexName;
  const generationId = contentFingerprint({ provider, indexName, createdAt: new Date().toISOString() });
  // Keep the scheduled local-only path cheap. The full-document scan below is
  // only needed when publishing to an external search index; without an adapter
  // it served no purpose and repeatedly exceeded PostgreSQL's statement timeout.
  const documents = adapter ? await loadIndexDocuments() : [];
  await mediaIntelligenceQuery(
    `INSERT INTO media_intelligence_index_generations
      (generation_id, provider, index_name, status, document_count, config)
     VALUES ($1,$2,$3,'building',$4,$5::jsonb)`,
    [generationId, provider, indexName, documents.length, JSON.stringify({ azureRequested: config.requested })],
  );
  if (!adapter) {
    await withMediaIntelligenceTransaction(async (client) => {
      await client.query(
        `UPDATE media_intelligence_index_generations SET status = 'retired', retired_at = now()
         WHERE provider = $1 AND index_name = $2 AND status = 'active'`,
        [provider, indexName],
      );
      await client.query(
        `UPDATE media_intelligence_index_generations SET status = 'active', activated_at = now()
         WHERE generation_id = $1`,
        [generationId],
      );
    });
    return { generationId, provider, status: "local-only", documentCount: documents.length };
  }
  try {
    const result = await adapter.publishGeneration({ generationId, indexName, documents });
    // Provider removals can arrive while the remote upload runs. Recheck after
    // publication so an earlier cleanup cannot be undone by that in-flight batch.
    const blocked = await getUnavailableContentKeys(documents.map((document) => document.asset.item));
    const removed = [...new Set(documents.filter((document) => sanitizeAvailableContent([document.asset.item], blocked)[0] !== document.asset.item)
      .map((document) => document.asset.key))];
    if (removed.length) {
      try { await adapter.deleteDocuments(removed); }
      catch (error) {
        // An earlier cleanup might have finished before this upload recreated
        // the remote document. Re-arm its durable retry without stealing a lease.
        await query(`UPDATE content_removal_cleanup SET status='pending',available_at=now(),
          completed_at=NULL,lease_expires_at=NULL
          WHERE content_keys && $1::text[] AND status='completed'`, [[...blocked]]);
        throw error;
      }
    }
    await withMediaIntelligenceTransaction(async (client) => {
      await client.query(
        `UPDATE media_intelligence_index_generations SET status = 'retired', retired_at = now()
         WHERE provider = $1 AND index_name = $2 AND status = 'active'`,
        [provider, indexName],
      );
      await client.query(
        `UPDATE media_intelligence_index_generations SET status = 'active', activated_at = now(),
         document_count = $2, provider_generation_id = $3 WHERE generation_id = $1`,
        [generationId, result.documentCount, result.providerGenerationId ?? null],
      );
    });
    return { generationId, provider, status: "active", documentCount: result.documentCount };
  } catch (error) {
    await mediaIntelligenceQuery(
      `UPDATE media_intelligence_index_generations SET status = 'failed', error = $2 WHERE generation_id = $1`,
      [generationId, (error instanceof Error ? error.message : String(error)).slice(0, 2_000)],
    );
    throw error;
  }
}
