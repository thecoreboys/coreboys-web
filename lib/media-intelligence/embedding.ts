import { contentFingerprint } from "./fingerprint";
import { expandConcepts, normalizeText, textTokens } from "./text";
import {
  LOCAL_EMBEDDING_DIMENSIONS,
  LOCAL_EMBEDDING_MODEL,
  type EmbeddingProvider,
} from "./types";

function hashFeature(value: string, seed: number): number {
  let hash = 2166136261 ^ seed;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm > 0 ? vector.map((value) => value / norm) : vector;
}

export function localEmbedding(text: string, dimensions = LOCAL_EMBEDDING_DIMENSIONS): number[] {
  const normalized = normalizeText(text);
  const expanded = `${normalized} ${expandConcepts(normalized).join(" ")}`.trim();
  const tokens = textTokens(expanded);
  const features: Array<{ value: string; weight: number }> = [];
  tokens.forEach((token) => {
    features.push({ value: `w:${token}`, weight: 2.2 });
    const padded = `^${token}$`;
    for (let index = 0; index <= padded.length - 3; index += 1) {
      features.push({ value: `c:${padded.slice(index, index + 3)}`, weight: 0.45 });
    }
  });
  for (let index = 0; index < tokens.length - 1; index += 1) {
    features.push({ value: `b:${tokens[index]}_${tokens[index + 1]}`, weight: 1.4 });
  }
  const vector = Array.from({ length: dimensions }, () => 0);
  for (const feature of features) {
    const bucket = hashFeature(feature.value, 0) % dimensions;
    const sign = hashFeature(feature.value, 17) % 2 === 0 ? 1 : -1;
    vector[bucket]! += feature.weight * sign;
  }
  return normalizeVector(vector);
}

export function cosineSimilarity(left: number[] | null, right: number[] | null): number {
  if (!left || !right || left.length !== right.length || !left.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index]! * right[index]!;
    leftNorm += left[index]! * left[index]!;
    rightNorm += right[index]! * right[index]!;
  }
  if (!leftNorm || !rightNorm) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local";
  readonly model = LOCAL_EMBEDDING_MODEL;
  readonly dimensions = LOCAL_EMBEDDING_DIMENSIONS;

  async embed(text: string): Promise<number[]> {
    return localEmbedding(text, this.dimensions);
  }
}

let providerFactory: (() => EmbeddingProvider) | null = null;

/**
 * Injection point for a future Microsoft Foundry adapter. Local mode never
 * imports an Azure SDK or makes a network call. A remote adapter must be
 * registered explicitly by server bootstrap code after the user enables it.
 */
export function registerEmbeddingProvider(factory: () => EmbeddingProvider): void {
  providerFactory = factory;
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (providerFactory) return providerFactory();
  const configured = process.env.MEDIA_INTELLIGENCE_PROVIDER?.trim().toLowerCase() || "local";
  if (configured !== "local" && configured !== "azure") {
    throw new Error(
      `Embedding provider "${configured}" is not registered. Local mode will not make a remote AI call implicitly.`,
    );
  }
  // Azure configuration alone is never enough to cause a paid call. Until a
  // bootstrap explicitly registers an embedding adapter, metadata analysis
  // remains functional with the deterministic local vector.
  return new LocalEmbeddingProvider();
}

export function embeddingSourceHash(text: string): string {
  return contentFingerprint({ text: normalizeText(text) });
}
