import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { isOauthProvider } from "@/lib/oauth/providers";
import { exchangeCode } from "@/lib/oauth/exchange";
import {
  ProviderLinkedElsewhereError,
  upsertConnection,
} from "@/lib/oauth/connections";
import {
  OAUTH_STATE_COOKIE,
  clearOauthStateCookie,
  verifyOauthState,
} from "@/lib/oauth/state";
import { awardPoints, POINTS } from "@/lib/points";
import { syncProvider } from "@/lib/oauth/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bounce(origin: string, params: Record<string, string>) {
  const url = new URL("/account", origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.headers.append("Set-Cookie", clearOauthStateCookie());
  return res;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { provider } = await ctx.params;
  const origin = new URL(req.url).origin;
  if (!isOauthProvider(provider)) {
    return bounce(origin, { oauth: "error", reason: "unknown-provider" });
  }

  const url = new URL(req.url);
  const err = url.searchParams.get("error");
  if (err) {
    return bounce(origin, { oauth: "denied", provider });
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return bounce(origin, { oauth: "error", reason: "missing-code" });
  }

  const store = await cookies();
  const raw = store.get(OAUTH_STATE_COOKIE)?.value;
  const payload = raw ? await verifyOauthState(raw) : null;
  if (!payload || payload.provider !== provider || payload.nonce !== state) {
    return bounce(origin, { oauth: "error", reason: "bad-state" });
  }

  const uid = await getCurrentFanUserId();
  if (!uid || uid !== payload.userId) {
    return bounce(origin, { oauth: "error", reason: "session" });
  }

  try {
    const ident = await exchangeCode(provider, payload.origin, code, payload.verifier);
    await upsertConnection({
      userId: uid,
      provider,
      providerUserId: ident.providerUserId,
      providerUsername: ident.username,
      avatarUrl: ident.avatarUrl,
      scopes: ident.scopes,
      accessToken: ident.accessToken,
      refreshToken: ident.refreshToken,
      expiresIn: ident.expiresIn,
    });
    const reason = `connect_${provider}` as keyof typeof POINTS;
    const pts = POINTS[reason] ?? 25;
    await awardPoints(uid, typeof pts === "number" ? pts : 25, String(reason), "oauth", provider);
    // Complete the first sync before returning. `syncProvider` records a
    // provider error without discarding the successfully stored connection.
    const sync = await syncProvider(uid, provider);
    return bounce(origin, { oauth: sync.ok ? "ok" : "sync-error", provider });
  } catch (e) {
    if (e instanceof ProviderLinkedElsewhereError) {
      return bounce(origin, { oauth: "linked", provider });
    }
    console.error("[oauth/callback]", provider, e);
    return bounce(origin, { oauth: "error", reason: "exchange" });
  }
}
