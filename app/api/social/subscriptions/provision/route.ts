import { NextResponse } from "next/server";
import { provisionSocialSubscriptions } from "@/lib/social-subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function POST(request: Request) {
  const secret = process.env.SOCIAL_SUBSCRIPTION_CRON_SECRET?.trim()
    || process.env.METRICS_CRON_SECRET?.trim();
  if (!secret || request.headers.get("x-cron-secret") !== secret) {
    return privateJson({ error: "unauthorized" }, { status: 401 });
  }

  const results = await provisionSocialSubscriptions();
  const errors = results.filter((entry) => entry.state === "error").length;
  const skipped = results.filter((entry) => entry.state === "skipped").length;
  return privateJson({
    ok: errors === 0,
    summary: { total: results.length, errors, skipped },
    results,
    provisionedAt: new Date().toISOString(),
  }, { status: errors ? 502 : 200 });
}
