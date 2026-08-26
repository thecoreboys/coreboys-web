import type { WatchItem } from "@/lib/watch/types";
import { embeddingSourceHash, getEmbeddingProvider } from "./embedding";
import { contentFingerprint } from "./fingerprint";
import { expandConcepts, normalizeText, textTokens } from "./text";
import { sourcePolicyFor } from "./policy";
import {
  LOCAL_ANALYZER,
  LOCAL_ANALYZER_VERSION,
  type AnalysisClaim,
  type CompletedAnalysis,
  type MediaAliasRecord,
  type MediaAnalyzer,
  type MediaAssetRecord,
  type MediaRevisionRecord,
  type MediaSegmentRecord,
  type MediaTagRecord,
  type MediaAnalysisStage,
} from "./types";

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "but", "you", "your", "are", "was",
  "were", "have", "has", "into", "full", "video", "stream", "live", "official", "core", "boys",
]);

function contentType(item: WatchItem): MediaAssetRecord["contentType"] {
  if (item.kind === "live" || item.format === "live") return "live";
  if (item.kind === "vod") return "broadcast";
  if (item.format === "short") return item.kind === "clip" ? "clip" : "short";
  if (item.format === "photo" || item.kind === "tour") return "photo";
  if (item.kind === "post") return "post";
  if (item.kind === "clip") return "clip";
  return "video";
}

export function assetKeyFor(item: WatchItem): string {
  return `${item.platform}:${item.id}`;
}

export function analysisIdempotencyKey(input: {
  revisionId: string;
  analyzer: string;
  analyzerVersion: string;
  stage: MediaAnalysisStage;
  inputHash: string;
  policyVersion: string;
}): string {
  return contentFingerprint({
    revisionId: input.revisionId,
    analyzer: input.analyzer,
    analyzerVersion: input.analyzerVersion,
    stage: input.stage,
    inputHash: input.inputHash,
    policyVersion: input.policyVersion,
  });
}

export function prepareWatchItem(item: WatchItem, analyzer: Pick<MediaAnalyzer, "name" | "version" | "stage">): {
  asset: MediaAssetRecord;
  revision: MediaRevisionRecord;
  claim: AnalysisClaim;
} {
  const key = assetKeyFor(item);
  const description = item.subtitle?.trim() || null;
  // Deliberately excludes thumbnails, signed media URLs, viewer counts and
  // embed URLs. Refreshing transport metadata must not trigger paid analysis.
  const analyzerInput = {
    key,
    platform: item.platform,
    sourceUrl: item.sourceUrl ?? null,
    title: item.title.trim(),
    description,
    creatorSlug: item.memberSlug,
    creatorLabel: item.memberLabel,
    accountLabel: item.accountLabel ?? null,
    format: item.format ?? null,
    orientation: item.orientation ?? null,
    durationSeconds: item.durationSeconds ?? null,
    publishedAt: item.publishedAt ?? item.live?.startedAt ?? null,
    chapters: item.chapters ?? [],
  };
  const fingerprint = contentFingerprint(analyzerInput);
  const revisionId = contentFingerprint({ key, fingerprint });
  const policy = sourcePolicyFor(item);
  const inputHash = contentFingerprint({
    analyzer: analyzer.name,
    version: analyzer.version,
    stage: analyzer.stage,
    policyVersion: policy.version,
    fingerprint,
  });
  const idempotencyKey = analysisIdempotencyKey({
    revisionId,
    analyzer: analyzer.name,
    analyzerVersion: analyzer.version,
    stage: analyzer.stage,
    inputHash,
    policyVersion: policy.version,
  });
  // Processing URLs may be signed, short-lived, or otherwise intended only
  // for the analysis worker. Keep them out of the client-facing search
  // document; queue payloads carry the authorized inputs server-side.
  const {
    mediaUrl: _mediaUrl,
    qualities: _qualities,
    captions: _captions,
    audioDescriptionUrl: _audioDescriptionUrl,
    ...searchSafeItem
  } = item;
  const asset: MediaAssetRecord = {
    key,
    sourcePolicyKey: policy.key,
    platform: item.platform,
    externalId: item.id,
    sourceUrl: item.sourceUrl ?? null,
    contentType: contentType(item),
    format: item.format ?? null,
    orientation: item.orientation ?? null,
    creatorSlug: item.memberSlug,
    creatorLabel: item.memberLabel,
    title: item.title.trim(),
    description,
    thumbnailUrl: item.poster || null,
    durationSeconds: item.durationSeconds ?? null,
    publishedAt: item.publishedAt ?? item.live?.startedAt ?? null,
    isLive: item.kind === "live" || item.format === "live",
    item: searchSafeItem,
    active: true,
  };
  const revision: MediaRevisionRecord = {
    id: revisionId,
    assetKey: key,
    fingerprint,
    contentHash: null,
    analyzerInputHash: inputHash,
  };
  return {
    asset,
    revision,
    claim: {
      id: idempotencyKey,
      revisionId,
      analyzer: analyzer.name,
      analyzerVersion: analyzer.version,
      inputHash,
      stage: analyzer.stage,
      idempotencyKey,
      policyVersion: policy.version,
    },
  };
}

function aliasesFor(asset: MediaAssetRecord, accountLabel?: string): MediaAliasRecord[] {
  const candidates: Array<{ value: string | null | undefined; kind: MediaAliasRecord["kind"]; weight: number }> = [
    { value: asset.title, kind: "title", weight: 1.3 },
    { value: asset.creatorLabel, kind: "creator", weight: 1.5 },
    { value: asset.creatorSlug, kind: "creator", weight: 1.45 },
    { value: accountLabel?.replace(/^@/, ""), kind: "creator", weight: 1.4 },
    ...expandConcepts(`${asset.title} ${asset.description ?? ""}`).map((value) => ({
      value,
      kind: "concept" as const,
      weight: 1.2,
    })),
  ];
  const seen = new Set<string>();
  return candidates.flatMap(({ value, kind, weight }) => {
    const normalizedAlias = normalizeText(value ?? "");
    const key = `${kind}:${normalizedAlias}`;
    if (!normalizedAlias || seen.has(key)) return [];
    seen.add(key);
    return [{ assetKey: asset.key, alias: value!.trim(), normalizedAlias, kind, weight }];
  });
}

function tagsFor(asset: MediaAssetRecord, segmentId: string, ownerRunId: string): MediaTagRecord[] {
  const tags = new Map<string, MediaTagRecord>();
  const add = (tag: string, kind: MediaTagRecord["kind"], confidence: number) => {
    const normalized = normalizeText(tag);
    if (!normalized) return;
    tags.set(`${kind}:${normalized}`, {
      revisionId: "",
      segmentId,
      ownerRunId,
      tag: normalized,
      kind,
      confidence,
      source: LOCAL_ANALYZER,
    });
  };
  add(asset.platform, "platform", 1);
  add(asset.contentType, "format", 1);
  if (asset.format) add(asset.format, "format", 1);
  add(asset.creatorLabel, "creator", 1);
  if (asset.creatorSlug) add(asset.creatorSlug, "creator", 1);
  expandConcepts(`${asset.title} ${asset.description ?? ""}`).forEach((value) => add(value, "topic", 0.85));
  textTokens(`${asset.title} ${asset.description ?? ""}`)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
    .slice(0, 32)
    .forEach((token) => add(token, "entity", 0.7));
  return [...tags.values()];
}

async function analyzeWatchItemLocally(
  item: WatchItem,
  asset: MediaAssetRecord,
  revision: MediaRevisionRecord,
  claim: AnalysisClaim,
): Promise<CompletedAnalysis> {
  const provider = getEmbeddingProvider();
  const aliases = aliasesFor(asset, item.accountLabel);
  const concepts = aliases.filter((entry) => entry.kind === "concept").map((entry) => entry.alias);
  const common = [
    asset.title,
    asset.description,
    asset.creatorLabel,
    item.accountLabel,
    asset.platform,
    asset.contentType,
    asset.format,
    ...concepts,
  ].filter(Boolean).join(" · ");
  const segments: MediaSegmentRecord[] = [{
    id: contentFingerprint({ run: claim.id, sequence: 0, kind: "asset" }),
    revisionId: revision.id,
    ownerRunId: claim.id,
    stage: claim.stage,
    sequence: 0,
    kind: "asset",
    startSeconds: null,
    endSeconds: null,
    title: asset.title,
    text: [asset.title, asset.description].filter(Boolean).join(". "),
    searchDocument: common,
    evidence: asset.description || `${asset.creatorLabel} · ${asset.platform}`,
    metadata: { metadataOnly: true, format: asset.format, orientation: asset.orientation },
  }];
  for (const [index, chapter] of (item.chapters ?? []).entries()) {
    const next = item.chapters?.[index + 1];
    segments.push({
      id: contentFingerprint({ run: claim.id, sequence: index + 1, kind: "chapter" }),
      revisionId: revision.id,
      ownerRunId: claim.id,
      stage: claim.stage,
      sequence: index + 1,
      kind: "chapter",
      startSeconds: chapter.startSeconds,
      endSeconds: chapter.endSeconds ?? next?.startSeconds ?? null,
      title: chapter.title,
      text: chapter.title,
      searchDocument: `${common} · ${chapter.title}`,
      evidence: chapter.title,
      metadata: { chapterKind: chapter.kind ?? "chapter" },
    });
  }
  const tags = segments.flatMap((segment) =>
    tagsFor(asset, segment.id, claim.id).map((tag) => ({ ...tag, revisionId: revision.id })),
  );
  const embeddings = await Promise.all(segments.map(async (segment) => {
    const vector = await provider.embed(segment.searchDocument);
    return {
      revisionId: revision.id,
      segmentId: segment.id,
      ownerRunId: claim.id,
      provider: provider.name,
      model: provider.model,
      dimensions: provider.dimensions,
      sourceHash: embeddingSourceHash(segment.searchDocument),
      vector,
      vectorNorm: Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)),
    };
  }));
  return {
    assetKey: asset.key,
    claim,
    segments,
    tags,
    aliases,
    embeddings,
    artifacts: [],
    rawResult: {
      assetKey: asset.key,
      mode: "local-metadata-only",
      analyzedOnce: true,
      analyzer: LOCAL_ANALYZER,
      analyzerVersion: LOCAL_ANALYZER_VERSION,
      embeddingProvider: provider.name,
      embeddingModel: provider.model,
      segmentCount: segments.length,
      tagCount: tags.length,
    },
  };
}

class LocalMetadataAnalyzer implements MediaAnalyzer {
  readonly name = LOCAL_ANALYZER;
  readonly version = LOCAL_ANALYZER_VERSION;
  readonly stage = "metadata" as const;
  readonly mode = "metadata-only" as const;

  analyze(
    item: WatchItem,
    asset: MediaAssetRecord,
    revision: MediaRevisionRecord,
    claim: AnalysisClaim,
  ): Promise<CompletedAnalysis> {
    return analyzeWatchItemLocally(item, asset, revision, claim);
  }
}

let analyzerFactory: (() => MediaAnalyzer) | null = null;

/** Future Content Understanding adapters register here; local is the default. */
export function registerMediaAnalyzer(factory: () => MediaAnalyzer): void {
  analyzerFactory = factory;
}

export function getLocalMetadataAnalyzer(): MediaAnalyzer {
  return new LocalMetadataAnalyzer();
}

export function getRegisteredMediaAnalyzer(): MediaAnalyzer | null {
  return analyzerFactory?.() ?? null;
}

export function availableMediaAnalyzers(): MediaAnalyzer[] {
  const local = getLocalMetadataAnalyzer();
  const registered = getRegisteredMediaAnalyzer();
  if (!registered || (
    registered.name === local.name
    && registered.version === local.version
    && registered.stage === local.stage
  )) return [local];
  return [local, registered];
}

export function getMediaAnalyzer(): MediaAnalyzer {
  return getRegisteredMediaAnalyzer() ?? getLocalMetadataAnalyzer();
}
