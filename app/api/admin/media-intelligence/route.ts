import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { mediaIntelligenceCoverage } from "@/lib/media-intelligence/coverage";
import { runCurrentWatchCatalogSync } from "@/lib/media-intelligence/ingest";
import { publishMediaIndexGeneration } from "@/lib/media-intelligence/indexing";
import { retryDeadLetterJobs } from "@/lib/media-intelligence/jobs";
import { runMediaIntelligenceRetention, tombstoneMediaAsset } from "@/lib/media-intelligence/retention";
import { runMediaWorkerBatch } from "@/lib/media-intelligence/worker";
import { mediaIntelligenceQuery } from "@/lib/media-intelligence/schema";
import { recordContentRemoval } from "@/lib/content-availability";
import type { ContentIdentityInput, ContentProvider } from "@/lib/content-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Action = z.object({
  action: z.enum(["sync", "work", "retry-dead-letter", "cleanup", "publish-index", "tombstone"]),
  limit: z.coerce.number().int().min(0).max(2_000).optional(),
  assetKey: z.string().trim().min(3).max(500).regex(/^[^\u0000-\u001f\u007f]+$/).optional(),
  reason: z.enum(["provider-deleted", "rights-revoked", "admin-removed", "duplicate"]).optional(),
  deleteAfterDays: z.coerce.number().int().min(0).max(365).optional(),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await mediaIntelligenceCoverage(), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({
      error: "coverage_unavailable",
      message: "Source coverage is temporarily unavailable. Please retry.",
    }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = Action.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_action", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    let result: unknown;
    if (parsed.data.action === "sync") {
      result = await runCurrentWatchCatalogSync({ trigger: "admin", maxJobs: parsed.data.limit ?? 100 });
    } else if (parsed.data.action === "work") {
      result = await runMediaWorkerBatch({ workerId: `admin:${auth.id}`, maxJobs: parsed.data.limit ?? 50 });
    } else if (parsed.data.action === "retry-dead-letter") {
      result = { retried: await retryDeadLetterJobs(parsed.data.limit ?? 100) };
    } else if (parsed.data.action === "cleanup") {
      result = await runMediaIntelligenceRetention(parsed.data.limit ?? 250);
    } else if (parsed.data.action === "publish-index") {
      result = await publishMediaIndexGeneration();
    } else {
      if (!parsed.data.assetKey || !parsed.data.reason) {
        return NextResponse.json({ error: "asset_key_and_reason_required" }, { status: 400 });
      }
      // A duplicate index entry is not evidence that the provider original was
      // removed. Explicit removal/rights actions, however, apply to every surface.
      if (parsed.data.reason !== "duplicate") {
        const asset = await mediaIntelligenceQuery<{
          platform: string; external_id: string; source_url: string | null; item: ContentIdentityInput;
        }>("SELECT platform,external_id,source_url,item FROM media_intelligence_assets WHERE asset_key=$1", [parsed.data.assetKey]);
        const row = asset.rows[0];
        if (row && ["x", "youtube", "instagram", "tiktok", "twitch"].includes(row.platform)) {
          await recordContentRemoval({ ...row.item, provider: row.platform as ContentProvider,
            providerId: row.external_id, sourceUrl: row.source_url ?? undefined,
            reason: parsed.data.reason === "provider-deleted" ? "deleted"
              : parsed.data.reason === "rights-revoked" ? "rights_revoked" : "admin_removed",
            evidence: "admin_action",
          });
        }
      }
      result = await tombstoneMediaAsset({
        assetKey: parsed.data.assetKey,
        reason: parsed.data.reason,
        deleteAfterDays: parsed.data.deleteAfterDays,
        metadata: { actor: auth.id, source: "admin-api" },
      });
    }
    return NextResponse.json({ result, coverage: await mediaIntelligenceCoverage() });
  } catch (error) {
    return NextResponse.json({
      error: "media_intelligence_action_failed",
      message: error instanceof Error ? error.message : "unknown error",
    }, { status: 500 });
  }
}
