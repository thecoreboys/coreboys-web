import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { query } from "@/lib/db";
import { getXCommunityDirectory, xNativeActionsEnvironment } from "@/lib/x/config";
import { getXFeedSnapshotHealth } from "@/lib/x-feed-snapshot";
import { ensureXIntegrationSchema } from "@/lib/x/schema";
import { getXUsageSummary, pruneExpiredXCache, xApiPricing } from "@/lib/x/usage";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  await ensureXIntegrationSchema();
  const [summary, cache, actions, snapshot] = await Promise.all([
    getXUsageSummary(),
    query<{ entries: string; fresh: string; hits: string }>(`
      SELECT COUNT(*)::text AS entries,
             COUNT(*) FILTER(WHERE expires_at>now())::text AS fresh,
             COALESCE(SUM(hit_count),0)::text AS hits FROM x_api_cache
    `),
    query<{ status: string; count: string }>(`
      SELECT status,COUNT(*)::text AS count FROM x_action_audit
      WHERE created_at>=date_trunc('month',now()) GROUP BY status ORDER BY status
    `),
    getXFeedSnapshotHealth(),
  ]);
  const env = xNativeActionsEnvironment();
  const prices = xApiPricing();
  const response = NextResponse.json({
    summary,
    cache: {
      entries: Number(cache.rows[0]?.entries ?? 0),
      fresh: Number(cache.rows[0]?.fresh ?? 0),
      hits: Number(cache.rows[0]?.hits ?? 0),
    },
    actions: Object.fromEntries(actions.rows.map((row) => [row.status, Number(row.count)])),
    snapshot,
    readiness: {
      oauthCredentials: env.credentials,
      bearerCredential: Boolean(process.env.X_BEARER_TOKEN?.trim()),
      explicitWriteEnable: env.explicitEnable,
      creditGate: env.creditGate,
      writePriceConfigured: prices.writeActionMicrousd > 0,
      readPostPriceConfigured: prices.readPostMicrousd > 0,
      readUserPriceConfigured: prices.readUserMicrousd > 0,
      configuredCommunities: getXCommunityDirectory().filter((entry) => entry.configured).length,
      expectedCommunities: 7,
      communityPublishing: "deferred_api_undocumented",
    },
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function DELETE(request: Request) {
  if (!requestHasSameOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const removed = await pruneExpiredXCache();
  const response = NextResponse.json({ ok: true, removed });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
