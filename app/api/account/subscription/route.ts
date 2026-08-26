import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { catalogForClient } from "@/lib/subscriptions/catalog";
import { getAccountSubscriptionState } from "@/lib/subscriptions/entitlements";
import type { AccountSubscriptionApiResponse } from "@/lib/subscriptions/api-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

/**
 * Read-only account plan state. Checkout and plan mutation intentionally do not
 * exist in the local foundation.
 */
export async function GET(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized" }, { status: 401 });

  const state = await getAccountSubscriptionState({
    userId,
    requestHostname: new URL(request.url).hostname,
  });

  const response: AccountSubscriptionApiResponse = {
    ...state,
    catalog: catalogForClient(),
  };
  return privateJson(response);
}
