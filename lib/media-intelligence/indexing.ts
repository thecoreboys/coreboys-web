import "server-only";
import { contentFingerprint } from "./fingerprint";
import { getAzureMediaAdapters, readAzureMediaConfig } from "./azure";
import { getEmbeddingProvider } from "./embedding";
import { getMediaIntelligenceStore } from "./postgres-store";
import { mediaIntelligenceQuery, withMediaIntelligenceTransaction } from "./schema";

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
  const embedding = getEmbeddingProvider();
  const documents = await getMediaIntelligenceStore().searchDocuments(embedding.name, embedding.model, {});
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
