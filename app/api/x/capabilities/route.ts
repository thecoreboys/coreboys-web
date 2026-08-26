import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { X_INTERACTION_SCOPES, grantedScopeSet } from "@/lib/oauth/providers";
import { getConnection } from "@/lib/oauth/connections";
import { xNativeActionsEnvironment } from "@/lib/x/config";
import { issueXActionCsrfToken } from "@/lib/x/security";
import { getXUsageSummary, xApiPricing } from "@/lib/x/usage";
import type { XActionAvailability } from "@/lib/x/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentFanUserId();
  const env = xNativeActionsEnvironment();
  const base: XActionAvailability = {
    enabled: false,
    reason: "disabled",
    connectHref: "/api/oauth/x/start?intent=interact",
    requiredScopes: [...X_INTERACTION_SCOPES],
  };
  if (!userId) return privateJson({ availability: { ...base, reason: "sign_in" }, csrfToken: null });
  if (!env.explicitEnable) return privateJson({ availability: base, csrfToken: null });
  if (!env.credentials) return privateJson({ availability: { ...base, reason: "credentials_missing" }, csrfToken: null });
  if (!env.creditGate || xApiPricing().writeActionMicrousd <= 0) {
    return privateJson({ availability: { ...base, reason: "credit_gate_missing" }, csrfToken: null });
  }
  const usage = await getXUsageSummary();
  if (usage.remainingGateUsd <= 0) {
    return privateJson({ availability: { ...base, reason: "monthly_ceiling_reached" }, csrfToken: null });
  }
  const connection = await getConnection(userId, "x");
  const granted = grantedScopeSet(connection?.scopes);
  const hasScopes = X_INTERACTION_SCOPES.every((scope) => granted.has(scope));
  if (!connection || connection.status !== "active" || !hasScopes) {
    return privateJson({ availability: { ...base, reason: "reconnect" }, csrfToken: null });
  }
  return privateJson({
    availability: { ...base, enabled: true, reason: "available" },
    csrfToken: await issueXActionCsrfToken(userId),
  });
}

function privateJson(body: unknown) {
  const response = NextResponse.json(body);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
