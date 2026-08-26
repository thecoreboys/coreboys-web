import type {
  MediaArtifactStore,
  MediaJobTransport,
  MediaSearchIndexAdapter,
} from "./types";

export type AzureMediaService =
  | "content-understanding"
  | "video-indexer"
  | "blob"
  | "service-bus"
  | "ai-search"
  | "embedding";

export type AzureMediaConfig = {
  requested: boolean;
  ready: boolean;
  mode: "local" | "azure";
  missing: string[];
  services: Record<AzureMediaService, boolean>;
  contentUnderstanding: { endpoint: string | null; apiVersion: string; analyzerId: string | null };
  videoIndexer: { accountId: string | null; location: string | null };
  blob: { container: string };
  serviceBus: { queue: string };
  aiSearch: { endpoint: string | null; indexName: string };
  embedding: { endpoint: string | null; deployment: string | null; dimensions: number };
};

export type AzureDeepAnalysisRequest = {
  runId: string;
  assetKey: string;
  sourceUri: string;
  locale?: string;
};

export type AzureDeepAnalysisResult = {
  providerJobId: string;
  rawArtifactUri: string | null;
  segments: Array<{
    startSeconds: number | null;
    endSeconds: number | null;
    kind: "chapter" | "scene" | "speech" | "frame";
    title: string | null;
    text: string;
    confidence: number | null;
    metadata: Record<string, unknown>;
  }>;
};

export interface AzureContentUnderstandingAdapter {
  readonly name: "azure-content-understanding";
  analyze(request: AzureDeepAnalysisRequest): Promise<AzureDeepAnalysisResult>;
}

export interface AzureVideoIndexerAdapter {
  readonly name: "azure-video-indexer";
  analyze(request: AzureDeepAnalysisRequest): Promise<AzureDeepAnalysisResult>;
}

export type AzureMediaAdapters = {
  contentUnderstanding?: AzureContentUnderstandingAdapter;
  videoIndexer?: AzureVideoIndexerAdapter;
  blob?: MediaArtifactStore;
  serviceBus?: MediaJobTransport;
  aiSearch?: MediaSearchIndexAdapter;
};

const nonempty = (value: string | undefined) => Boolean(value?.trim());
const positiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Reads capability state only. It never instantiates an SDK client or performs
 * a network request, so local development and CI remain credential-free.
 */
export function readAzureMediaConfig(
  env: Record<string, string | undefined> = process.env,
): AzureMediaConfig {
  const requested = env.MEDIA_INTELLIGENCE_PROVIDER?.trim().toLowerCase() === "azure";
  const services: Record<AzureMediaService, boolean> = {
    "content-understanding": nonempty(env.AZURE_CONTENT_UNDERSTANDING_ENDPOINT)
      && nonempty(env.AZURE_CONTENT_UNDERSTANDING_API_KEY)
      && nonempty(env.AZURE_CONTENT_UNDERSTANDING_ANALYZER_ID),
    "video-indexer": nonempty(env.AZURE_VIDEO_INDEXER_ACCOUNT_ID)
      && nonempty(env.AZURE_VIDEO_INDEXER_LOCATION)
      && nonempty(env.AZURE_VIDEO_INDEXER_SUBSCRIPTION_KEY),
    blob: nonempty(env.AZURE_STORAGE_CONNECTION_STRING),
    "service-bus": nonempty(env.AZURE_SERVICE_BUS_CONNECTION_STRING),
    "ai-search": nonempty(env.AZURE_AI_SEARCH_ENDPOINT) && nonempty(env.AZURE_AI_SEARCH_API_KEY),
    embedding: nonempty(env.AZURE_OPENAI_ENDPOINT)
      && nonempty(env.AZURE_OPENAI_API_KEY)
      && nonempty(env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT),
  };
  const missing = requested
    ? Object.entries(services).filter(([, enabled]) => !enabled).map(([service]) => service)
    : [];
  return {
    requested,
    // Content Understanding or Video Indexer can provide the deep-media stage;
    // the remaining services are independently optional adapters.
    ready: requested && (services["content-understanding"] || services["video-indexer"]),
    mode: requested ? "azure" : "local",
    missing,
    services,
    contentUnderstanding: {
      endpoint: env.AZURE_CONTENT_UNDERSTANDING_ENDPOINT?.trim() || null,
      apiVersion: env.AZURE_CONTENT_UNDERSTANDING_API_VERSION?.trim() || "2025-11-01",
      analyzerId: env.AZURE_CONTENT_UNDERSTANDING_ANALYZER_ID?.trim() || null,
    },
    videoIndexer: {
      accountId: env.AZURE_VIDEO_INDEXER_ACCOUNT_ID?.trim() || null,
      location: env.AZURE_VIDEO_INDEXER_LOCATION?.trim() || null,
    },
    blob: { container: env.AZURE_MEDIA_CONTAINER?.trim() || "media-intelligence" },
    serviceBus: { queue: env.AZURE_SERVICE_BUS_MEDIA_QUEUE?.trim() || "media-intelligence" },
    aiSearch: {
      endpoint: env.AZURE_AI_SEARCH_ENDPOINT?.trim() || null,
      indexName: env.AZURE_AI_SEARCH_INDEX?.trim() || "core-media",
    },
    embedding: {
      endpoint: env.AZURE_OPENAI_ENDPOINT?.trim() || null,
      deployment: env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT?.trim() || null,
      dimensions: positiveInteger(env.AZURE_OPENAI_EMBEDDING_DIMENSIONS, 1536),
    },
  };
}

let adapters: AzureMediaAdapters = {};

/** Explicit bootstrap hook. Missing adapters always fall back to local metadata. */
export function registerAzureMediaAdapters(value: AzureMediaAdapters): void {
  adapters = { ...adapters, ...value };
}

export function getAzureMediaAdapters(): Readonly<AzureMediaAdapters> {
  return adapters;
}

export function azureMediaRuntimeState() {
  const config = readAzureMediaConfig();
  const deepAdapterRegistered = Boolean(adapters.contentUnderstanding || adapters.videoIndexer);
  return {
    config,
    registered: {
      contentUnderstanding: Boolean(adapters.contentUnderstanding),
      videoIndexer: Boolean(adapters.videoIndexer),
      blob: Boolean(adapters.blob),
      serviceBus: Boolean(adapters.serviceBus),
      aiSearch: Boolean(adapters.aiSearch),
    },
    fallback: !config.ready || !deepAdapterRegistered ? "local-metadata-only" as const : null,
  };
}
