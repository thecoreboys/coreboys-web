import { NextResponse } from "next/server";
import { accountRequestMatches, ACCOUNT_CHANGED_MESSAGE } from "@/lib/account-request";
import { consumeAdminLoginRateLimit } from "@/lib/admin-login-rate-limit";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { listConnections } from "@/lib/oauth/connections";
import { isOauthProvider } from "@/lib/oauth/providers";
import { syncAll, syncProvider } from "@/lib/oauth/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const uid = await getCurrentFanUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!accountRequestMatches(req, uid)) return NextResponse.json({ error: "account_changed", message: ACCOUNT_CHANGED_MESSAGE }, { status: 409 });

  // Each sync pages provider APIs (X is billed per read), so cap manual syncs
  // per account across replicas.
  try {
    const limit = await consumeAdminLoginRateLimit(`account-sync:${uid}`, 6);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "rate_limited", message: "You've synced recently. Try again in a few minutes." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds), "Cache-Control": "no-store" } },
      );
    }
  } catch {
    return NextResponse.json({ error: "unavailable", message: "Sync is temporarily unavailable." }, { status: 503 });
  }

  let provider: string | undefined;
  try {
    const body = (await req.json()) as { provider?: string };
    provider = body.provider;
  } catch {
    provider = undefined;
  }

  if (provider) {
    if (!isOauthProvider(provider)) {
      return NextResponse.json({ error: "unknown provider" }, { status: 400 });
    }
    const result = await syncProvider(uid, provider);
    return NextResponse.json({ results: [result], accountId: uid });
  }

  const conns = await listConnections(uid);
  const results = await syncAll(
    uid,
    conns.filter((c) => c.status === "active").map((c) => c.provider),
  );
  return NextResponse.json({ results, accountId: uid });
}
