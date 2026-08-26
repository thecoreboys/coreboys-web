import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
// @ts-expect-error Node type stripping requires explicit TypeScript suffixes.
import { analysisIdempotencyKey, prepareWatchItem } from "../lib/media-intelligence/analyzer.ts";
// @ts-expect-error Node type stripping requires explicit TypeScript suffixes.
import { readAzureMediaConfig } from "../lib/media-intelligence/azure.ts";
// @ts-expect-error Node type stripping requires explicit TypeScript suffixes.
import { getEmbeddingProvider } from "../lib/media-intelligence/embedding.ts";
// @ts-expect-error Node type stripping requires explicit TypeScript suffixes.
import { analysisEligibilityFor, parseSourcePolicyOverrides, sourcePolicyFor } from "../lib/media-intelligence/policy.ts";
import type { WatchItem } from "../lib/watch/types";

function item(overrides: Partial<WatchItem> = {}): WatchItem {
  return {
    id: "asset-1",
    kind: "youtube",
    platform: "youtube",
    title: "CORE moment",
    poster: "/poster.jpg",
    backdrop: "/backdrop.jpg",
    memberSlug: "lacy",
    memberLabel: "Lacy",
    accountLabel: "Lacy · Main",
    accent: "#ff0055",
    href: "/theater?id=asset-1",
    sourceUrl: "https://www.youtube.com/watch?v=asset-1",
    format: "long",
    ...overrides,
  };
}

test("provider media defaults to metadata-only and embeds never imply download rights", () => {
  const target = item({ embedUrl: "https://www.youtube.com/embed/asset-1" });
  const eligibility = analysisEligibilityFor(target);
  assert.equal(eligibility.mode, "metadata-only");
  assert.equal(eligibility.deepMediaAllowed, false);
  assert.equal(eligibility.policy.rights, "public-metadata");
  assert.equal(eligibility.policy.mediaAccessAllowed, false);
});

test("deep analysis requires owned/licensed rights, binary access, and a stable artifact", () => {
  const overrides = parseSourcePolicyOverrides(JSON.stringify({
    youtube: {
      rights: "licensed",
      requestedMode: "deep",
      mediaAccessAllowed: true,
      version: "contract-7",
    },
  }));
  const withoutArtifact = item();
  const policy = sourcePolicyFor(withoutArtifact, overrides);
  assert.equal(analysisEligibilityFor(withoutArtifact, policy).mode, "metadata-only");

  const authorized = item({ mediaUrl: "https://media.example.test/licensed.mp4" });
  const authorizedPolicy = sourcePolicyFor(authorized, overrides);
  assert.equal(analysisEligibilityFor(authorized, authorizedPolicy).mode, "deep");
  assert.equal(authorizedPolicy.version, "contract-7");
});

test("search records redact private processing URLs and retain their source policy key", () => {
  const target = item({
    mediaUrl: "https://media.example.test/signed.mp4?secret=1",
    audioDescriptionUrl: "https://media.example.test/described.mp4?secret=2",
    qualities: [{ id: "best", label: "Best", src: "https://media.example.test/best.mp4?secret=3" }],
    captions: [{ src: "https://media.example.test/private.vtt?secret=4", label: "English", language: "en" }],
  });
  const prepared = prepareWatchItem(target, {
    name: "test-analyzer",
    version: "1",
    stage: "metadata",
  });
  assert.equal(prepared.asset.sourcePolicyKey, "youtube:lacy-main");
  assert.equal(prepared.asset.item.mediaUrl, undefined);
  assert.equal(prepared.asset.item.audioDescriptionUrl, undefined);
  assert.equal(prepared.asset.item.qualities, undefined);
  assert.equal(prepared.asset.item.captions, undefined);
  assert.doesNotMatch(JSON.stringify(prepared.asset.item), /secret=/);
});

test("restricted source policy is an explicit skip", () => {
  const overrides = parseSourcePolicyOverrides(JSON.stringify({
    youtube: { rights: "restricted", requestedMode: "deep", mediaAccessAllowed: true },
  }));
  const target = item({ mediaUrl: "https://media.example.test/no.mp4" });
  assert.equal(analysisEligibilityFor(target, sourcePolicyFor(target, overrides)).mode, "skip");
});

test("live media never enters deep analysis before a stable replay exists", () => {
  const overrides = parseSourcePolicyOverrides(JSON.stringify({
    house: { rights: "owned", requestedMode: "deep", mediaAccessAllowed: true },
  }));
  const target = item({
    kind: "live",
    platform: "house",
    format: "live",
    mediaUrl: "https://media.example.test/current-live.mp4",
  });
  const eligibility = analysisEligibilityFor(target, sourcePolicyFor(target, overrides));
  assert.equal(eligibility.mode, "metadata-only");
  assert.equal(eligibility.deepMediaAllowed, false);
  assert.match(eligibility.reasons.join(" "), /stable replay/i);
});

test("analysis idempotency changes across stage or policy version", () => {
  const base = {
    revisionId: "revision",
    analyzer: "analyzer",
    analyzerVersion: "1",
    stage: "metadata" as const,
    inputHash: "input",
    policyVersion: "policy-1",
  };
  assert.equal(analysisIdempotencyKey(base), analysisIdempotencyKey({ ...base }));
  assert.notEqual(
    analysisIdempotencyKey(base),
    analysisIdempotencyKey({ ...base, stage: "content-understanding" }),
  );
  assert.notEqual(
    analysisIdempotencyKey(base),
    analysisIdempotencyKey({ ...base, policyVersion: "policy-2" }),
  );
});

test("Azure configuration is credential-free locally and uses the locked GA CU version", () => {
  const local = readAzureMediaConfig({ MEDIA_INTELLIGENCE_PROVIDER: "local" });
  assert.equal(local.ready, false);
  assert.equal(local.mode, "local");
  assert.deepEqual(local.missing, []);
  assert.equal(local.contentUnderstanding.apiVersion, "2025-11-01");

  const azure = readAzureMediaConfig({
    MEDIA_INTELLIGENCE_PROVIDER: "azure",
    AZURE_CONTENT_UNDERSTANDING_ENDPOINT: "https://example.cognitiveservices.azure.com",
    AZURE_CONTENT_UNDERSTANDING_API_KEY: "test-only",
    AZURE_CONTENT_UNDERSTANDING_ANALYZER_ID: "core-video",
  });
  assert.equal(azure.ready, true);
  assert.equal(azure.services["content-understanding"], true);
  assert.ok(azure.missing.includes("video-indexer"));
});

test("requesting Azure without a registered adapter safely retains local embeddings", () => {
  const previous = process.env.MEDIA_INTELLIGENCE_PROVIDER;
  process.env.MEDIA_INTELLIGENCE_PROVIDER = "azure";
  try {
    assert.equal(getEmbeddingProvider().name, "local");
  } finally {
    if (previous === undefined) delete process.env.MEDIA_INTELLIGENCE_PROVIDER;
    else process.env.MEDIA_INTELLIGENCE_PROVIDER = previous;
  }
});

test("schema and store preserve run-owned additive outputs", () => {
  const schema = readFileSync(resolve(process.cwd(), "lib/media-intelligence/schema.ts"), "utf8");
  const store = readFileSync(resolve(process.cwd(), "lib/media-intelligence/postgres-store.ts"), "utf8");
  const migration = readFileSync(resolve(process.cwd(), "scripts/migrations/027_deep_media_intelligence.sql"), "utf8");
  for (const source of [schema, migration]) {
    assert.match(source, /media_intelligence_source_policies/);
    assert.match(source, /media_intelligence_jobs/);
    assert.match(source, /media_intelligence_artifacts/);
    assert.match(source, /media_intelligence_index_generations/);
    assert.match(source, /media_intelligence_tombstones/);
    assert.match(source, /media_intelligence_outbox/);
    assert.match(source, /media_intelligence_archive_checkpoints/);
    assert.match(source, /source_policy_key/);
    assert.match(source, /idempotency_key/);
  }
  assert.doesNotMatch(store, /DELETE FROM media_intelligence_segments/);
  assert.doesNotMatch(store, /DELETE FROM media_intelligence_tags/);
  assert.doesNotMatch(store, /DELETE FROM media_intelligence_embeddings/);
  assert.match(store, /segment\.ownerRunId/);
  assert.match(store, /JOIN media_intelligence_analysis_runs ar ON ar\.run_id = s\.run_id/);
  assert.match(store, /NOT EXISTS \([\s\S]*media_intelligence_tombstones/);
  assert.match(store, /policy\.analysis_mode/);
  assert.match(store, /policy\.rights_status/);
  assert.match(store, /media\.asset\.restored/);
});

test("catalog mutation is background-only and purge removes every searchable surface", () => {
  const ingest = readFileSync(resolve(process.cwd(), "lib/media-intelligence/ingest.ts"), "utf8");
  const retention = readFileSync(resolve(process.cwd(), "lib/media-intelligence/retention.ts"), "utf8");
  const route = readFileSync(resolve(process.cwd(), "app/api/media-intelligence/catalog-sync/route.ts"), "utf8");
  const admin = readFileSync(resolve(process.cwd(), "app/api/admin/media-intelligence/route.ts"), "utf8");
  const statusFunction = /export async function syncCurrentWatchCatalog[\s\S]*?\n\}/.exec(ingest)?.[0] ?? "";
  assert.doesNotMatch(statusFunction, /getWatchCatalog|queueWatchCatalog|runMediaWorkerBatch/);
  assert.match(ingest, /export async function runCurrentWatchCatalogSync/);
  assert.match(route, /x-media-intelligence-secret/);
  assert.match(admin, /requireAdmin/);
  assert.match(retention, /search\?\.deleteDocuments/);
  assert.match(retention, /search_index_adapter_unavailable/);
  assert.match(retention, /artifact_store_unavailable/);
  assert.match(retention, /DELETE FROM media_intelligence_assets/);
  assert.match(retention, /DELETE FROM media_intelligence_artifacts/);
  assert.match(retention, /export async function tombstoneMediaAsset/);
  assert.match(admin, /"tombstone"/);
});

test("scheduled operations are resumable, rights-aware, and maintain every lifecycle phase", () => {
  const archive = readFileSync(resolve(process.cwd(), "lib/media-intelligence/archive.ts"), "utf8");
  const jobs = readFileSync(resolve(process.cwd(), "lib/media-intelligence/jobs.ts"), "utf8");
  const worker = readFileSync(resolve(process.cwd(), "lib/media-intelligence/worker.ts"), "utf8");
  const operations = readFileSync(resolve(process.cwd(), "lib/media-intelligence/operations.ts"), "utf8");
  const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/cron-media-intelligence.yml"), "utf8");
  const ingest = readFileSync(resolve(process.cwd(), "lib/media-intelligence/ingest.ts"), "utf8");

  assert.match(archive, /media_intelligence_archive_checkpoints/);
  assert.match(archive, /youtube\/v3\/playlistItems/);
  assert.match(archive, /helix\/videos/);
  assert.match(archive, /social_content_events/);
  assert.match(archive, /registerMediaArchiveSource/);
  assert.match(jobs, /renewAnalysisJobLease/);
  assert.match(jobs, /source_policy_no_longer_authorized/);
  assert.match(jobs, /payload\.processing/);
  assert.match(worker, /startLeaseHeartbeat/);
  assert.match(operations, /runMediaIntelligenceRetention/);
  assert.match(operations, /publishMediaIndexGeneration/);
  assert.match(workflow, /"action":"maintenance"/);
  assert.doesNotMatch(ingest, /reconcileCatalog\(/);
});
