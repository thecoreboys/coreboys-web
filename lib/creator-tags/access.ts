import "server-only";
import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { EntitlementDeniedError, requireAccountEntitlement } from "@/lib/subscriptions/entitlements";

export const CREATOR_TAG_FEATURE = "player.creator_tags" as const;
export async function requireCreatorTagAccess(request: Request): Promise<
  { ok: true; subject: string } | { ok: false; response: NextResponse }
> {
  const deny = (status: number, code: string, error: string) => ({ ok: false as const, response: NextResponse.json(
    { code, error, featureId: CREATOR_TAG_FEATURE, upgradeHref: "/upgrade?feature=player.creator_tags" },
    { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } },
  ) });
  try {
    const userId = await getCurrentFanUserId();
    if (!userId) return deny(401, "sign_in_required", "Sign in with CORE Membership to use creator tags.");
    await requireAccountEntitlement({ userId, requestHostname: new URL(request.url).hostname, featureId: CREATOR_TAG_FEATURE });
    return { ok: true, subject: `fan:${userId}` };
  } catch (error) {
    if (error instanceof EntitlementDeniedError) return deny(403, "plan_required", "Creator tags are included with CORE Membership.");
    return deny(503, "membership_unavailable", "Membership could not be checked. Try again shortly.");
  }
}
