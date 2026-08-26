import { NextResponse } from "next/server";
import { runMediaArchiveBackfillBatch } from "@/lib/media-intelligence/archive";
import { runCurrentWatchCatalogSync } from "@/lib/media-intelligence/ingest";
import { publishMediaIndexGeneration } from "@/lib/media-intelligence/indexing";
import { runScheduledMediaMaintenance } from "@/lib/media-intelligence/operations";
import { runMediaIntelligenceRetention } from "@/lib/media-intelligence/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const expected = (
    process.env.MEDIA_INTELLIGENCE_CRON_SECRET
    || process.env.METRICS_CRON_SECRET
    || ""
  ).trim();
  const supplied = (request.headers.get("x-media-intelligence-secret") || "").trim();
  if (!expected) {
    return NextResponse.json({ error: "media_intelligence_cron_not_configured" }, { status: 503 });
  }
  if (!supplied || supplied !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: {
    action?: "maintenance" | "sync" | "archive" | "cleanup" | "publish-index";
    maxJobs?: unknown;
    maxArchivePages?: unknown;
    archivePageSize?: unknown;
    retentionLimit?: unknown;
  } = {};
  try {
    body = await request.json() as typeof body;
  } catch {
    // An empty cron request uses the bounded default.
  }
  const bounded = (value: unknown, fallback: number, max: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(max, Math.trunc(parsed))) : fallback;
  };
  const action = body.action ?? "maintenance";
  if (!["maintenance", "sync", "archive", "cleanup", "publish-index"].includes(action)) {
    return NextResponse.json({ error: "invalid_media_intelligence_action" }, { status: 400 });
  }
  const maxJobs = bounded(body.maxJobs, 100, 500);
  const maxArchivePages = bounded(body.maxArchivePages, 8, 100);
  const archivePageSize = bounded(body.archivePageSize, 50, 100);
  const retentionLimit = bounded(body.retentionLimit, 250, 2_000);
  try {
    if (action === "sync") {
      return NextResponse.json(await runCurrentWatchCatalogSync({ trigger: "scheduled", maxJobs }));
    }
    if (action === "archive") {
      return NextResponse.json(await runMediaArchiveBackfillBatch({
        workerId: `cron-archive:${Date.now()}`,
        maxPages: maxArchivePages,
        pageSize: archivePageSize,
        maxJobs,
      }));
    }
    if (action === "cleanup") {
      return NextResponse.json(await runMediaIntelligenceRetention(retentionLimit));
    }
    if (action === "publish-index") {
      return NextResponse.json(await publishMediaIndexGeneration());
    }
    const result = await runScheduledMediaMaintenance({
      maxJobs,
      maxArchivePages,
      archivePageSize,
      retentionLimit,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json({
      error: "catalog_sync_failed",
      message: error instanceof Error ? error.message : "unknown error",
    }, { status: 500 });
  }
}
