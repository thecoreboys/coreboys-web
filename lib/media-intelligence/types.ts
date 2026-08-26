import type { WatchItem, WatchPlatform } from "@/lib/watch/types";

export const LOCAL_EMBEDDING_DIMENSIONS = 384;
export const LOCAL_EMBEDDING_MODEL = "core-hash-ngrams-v1";
export const LOCAL_ANALYZER = "core-metadata-analyzer";
export const LOCAL_ANALYZER_VERSION = "1";

export type MediaAnalysisStage =
  | "metadata"
  | "content-understanding"
  | "video-indexer"
  | "embedding"
  | "index";

export type MediaRightsStatus =
  | "owned"
  | "licensed"
  | "public-metadata"
  | "restricted"
  | "unknown";

export type MediaAnalysisMode = "deep" | "metadata-only" | "skip";

export type MediaSourcePolicy = {
  key: string;
  platform: WatchPlatform;
  rights: MediaRightsStatus;
  requestedMode: MediaAnalysisMode;
  mediaAccessAllowed: boolean;
  retentionDays: number;
  version: string;
  reason: string;
};

export type MediaAnalysisEligibility = {
  mode: MediaAnalysisMode;
  deepMediaAllowed: boolean;
  policy: MediaSourcePolicy;
  reasons: string[];
};

export type MediaAssetRecord = {
  key: string;
  sourcePolicyKey: string;
  platform: WatchPlatform;
  externalId: string;
  sourceUrl: string | null;
  contentType: "live" | "broadcast" | "video" | "short" | "clip" | "photo" | "post";
  format: WatchItem["format"] | null;
  orientation: WatchItem["orientation"] | null;
  creatorSlug: string | null;
  creatorLabel: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  isLive: boolean;
  item: WatchItem;
  active: boolean;
};

export type MediaRevisionRecord = {
  id: string;
  assetKey: string;
  fingerprint: string;
  contentHash: string | null;
  analyzerInputHash: string;
};

export type AnalysisClaim = {
  id: string;
  revisionId: string;
  analyzer: string;
  analyzerVersion: string;
  inputHash: string;
  stage: MediaAnalysisStage;
  idempotencyKey: string;
  policyVersion: string;
};

export type AnalysisClaimResult = "claimed" | "complete" | "busy";

export type MediaSegmentRecord = {
  id: string;
  revisionId: string;
  ownerRunId: string;
  stage: MediaAnalysisStage;
  sequence: number;
  kind: "asset" | "chapter" | "scene" | "speech" | "frame";
  startSeconds: number | null;
  endSeconds: number | null;
  title: string | null;
  text: string;
  searchDocument: string;
  evidence: string | null;
  metadata: Record<string, unknown>;
};

export type MediaTagRecord = {
  revisionId: string;
  segmentId: string;
  ownerRunId: string;
  tag: string;
  kind: "topic" | "person" | "creator" | "platform" | "format" | "entity";
  confidence: number;
  source: string;
};

export type MediaAliasRecord = {
  assetKey: string;
  alias: string;
  normalizedAlias: string;
  kind: "creator" | "title" | "concept" | "manual";
  weight: number;
};

export type MediaEmbeddingRecord = {
  revisionId: string;
  segmentId: string;
  ownerRunId: string;
  provider: string;
  model: string;
  dimensions: number;
  sourceHash: string;
  vector: number[];
  vectorNorm: number;
};

export type MediaArtifactRecord = {
  id: string;
  ownerRunId: string;
  revisionId: string;
  kind: "source" | "transcript" | "keyframe" | "thumbnail" | "analysis" | "index-document";
  provider: string;
  uri: string | null;
  contentHash: string;
  metadata: Record<string, unknown>;
  expiresAt: string | null;
};

export type CompletedAnalysis = {
  assetKey: string;
  claim: AnalysisClaim;
  segments: MediaSegmentRecord[];
  tags: MediaTagRecord[];
  aliases: MediaAliasRecord[];
  embeddings: MediaEmbeddingRecord[];
  artifacts: MediaArtifactRecord[];
  rawResult: Record<string, unknown>;
};

export type MediaIntelligenceJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "dead-letter"
  | "cancelled";

export type MediaIntelligenceJob = {
  id: string;
  idempotencyKey: string;
  assetKey: string;
  revisionId: string;
  stage: MediaAnalysisStage;
  analyzer: string;
  analyzerVersion: string;
  status: MediaIntelligenceJobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  payload: Record<string, unknown>;
};

export type SearchDocument = {
  asset: MediaAssetRecord;
  revisionId: string;
  segment: MediaSegmentRecord;
  tags: string[];
  aliases: Array<{ value: string; weight: number }>;
  embedding: number[] | null;
};

export type SearchContentType = MediaAssetRecord["contentType"];

export type SearchWatchState = "all" | "unwatched" | "continue" | "watched";

export type SearchProgressMark = {
  seconds?: number;
  progress?: number;
  completed?: boolean;
  positionUpdatedAt?: string | null;
  updatedAt?: string | null;
};

export type SearchFilters = {
  platforms?: WatchPlatform[];
  formats?: Array<NonNullable<WatchItem["format"]>>;
  contentTypes?: SearchContentType[];
  memberSlug?: string;
  liveOnly?: boolean;
  publishedAfter?: string;
  publishedBefore?: string;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  watchState?: SearchWatchState;
  /**
   * Account progress is joined by the API before ranking. The media index does
   * not own or persist viewing history, which keeps anonymous search cacheable
   * and prevents personalization data from leaking into index rows.
   */
  progressByRef?: Readonly<Record<string, SearchProgressMark | undefined>>;
};

export type SearchScoreBreakdown = {
  exact: number;
  creator: number;
  alias: number;
  lexical: number;
  fuzzy: number;
  vector: number;
  freshness: number;
  live: number;
};

export type MediaSearchHit = {
  /** Canonical result identity. Bare provider ids are never used for dedupe. */
  key: string;
  item: WatchItem;
  score: number;
  scoreBreakdown: SearchScoreBreakdown;
  matchedTerms: string[];
  evidence: string;
  moment: {
    startSeconds: number;
    endSeconds: number | null;
    label: string;
  } | null;
};

export type MediaSearchFacets = {
  platforms: Record<string, number>;
  formats: Record<string, number>;
  creators: Record<string, number>;
  contentTypes: Record<string, number>;
};

export type MediaSearchCoverage = {
  catalogAssets: number;
  indexedAssets: number | null;
  indexedSegments: number | null;
  embeddedSegments: number | null;
  indexedRatio: number | null;
  /** Deep transcript/OCR/scene coverage is not inferable from aggregate rows. */
  deepAnalyzedAssets: number | null;
};

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
}

export interface MediaAnalyzer {
  readonly name: string;
  readonly version: string;
  readonly stage: MediaAnalysisStage;
  readonly mode: Exclude<MediaAnalysisMode, "skip">;
  analyze(
    item: WatchItem,
    asset: MediaAssetRecord,
    revision: MediaRevisionRecord,
    claim: AnalysisClaim,
  ): Promise<CompletedAnalysis>;
}

export interface MediaIntelligenceStore {
  readonly kind: "postgres" | "local-file";
  prepareRevision(asset: MediaAssetRecord, revision: MediaRevisionRecord): Promise<void>;
  claimAnalysis(claim: AnalysisClaim): Promise<AnalysisClaimResult>;
  completeAnalysis(result: CompletedAnalysis): Promise<void>;
  failAnalysis(claim: AnalysisClaim, error: unknown): Promise<void>;
  reconcileCatalog(assetKeys: string[]): Promise<void>;
  searchDocuments(
    provider: string,
    model: string,
    filters: SearchFilters,
    queryVector?: number[],
  ): Promise<SearchDocument[]>;
  stats(): Promise<{ assets: number; revisions: number; segments: number; embeddings: number }>;
}

export interface MediaArtifactStore {
  readonly name: string;
  put(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
    metadata: Record<string, string>;
  }): Promise<{ uri: string; contentHash?: string }>;
  delete(uri: string): Promise<void>;
}

export interface MediaJobTransport {
  readonly name: string;
  publish(message: {
    id: string;
    topic: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
}

export interface MediaSearchIndexAdapter {
  readonly name: string;
  publishGeneration(input: {
    generationId: string;
    indexName: string;
    documents: readonly SearchDocument[];
  }): Promise<{ documentCount: number; providerGenerationId?: string }>;
  deleteDocuments(assetKeys: readonly string[]): Promise<void>;
}
