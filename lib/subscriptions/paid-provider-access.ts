import "server-only";
import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { EntitlementDeniedError, requireAccountEntitlement } from "@/lib/subscriptions/entitlements";
import type { FeatureId } from "@/lib/subscriptions/catalog";

/** Check membership before any per-request paid provider work starts. */
export async function requirePaidProviderAccess(request: Request, featureId: FeatureId): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const denied = (status: number, error: string) => ({ ok: false as const, response: NextResponse.json(
    { error, featureId, upgradeHref: `/upgrade?feature=${encodeURIComponent(featureId)}` },
    { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } },
  ) });
  try {
    const userId = await getCurrentFanUserId();
    if (!userId) return denied(401, "Sign in with CORE Membership to use this feature.");
    await requireAccountEntitlement({ userId, requestHostname: new URL(request.url).hostname, featureId });
    return { ok: true, userId };
  } catch (error) {
    if (error instanceof EntitlementDeniedError) return denied(403, "This feature is included with CORE Membership.");
    return denied(503, "Membership could not be checked. Try again shortly.");
  }
}
