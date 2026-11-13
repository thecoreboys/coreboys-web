import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { isOauthProvider } from "@/lib/oauth/providers";
import { exchangeCode, OauthConnectError } from "@/lib/oauth/exchange";
import { providerCallbackError } from "@/lib/oauth/callback-outcome";
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
  const url = new URL("/account/settings#connections", origin);
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
    const outcome = providerCallbackError(err);
    if (outcome.oauth === "error") console.warn("[oauth/callback] provider returned an error", provider, err.slice(0, 64));
    return bounce(origin, { ...outcome, provider });
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return bounce(origin, { oauth: "error", reason: "missing-code", provider });
  }

  const store = await cookies();
  const raw = store.get(OAUTH_STATE_COOKIE)?.value;
  // The state cookie lives 10 minutes. A missing or expired one means the
  // fan took too long (or started in another browser): ask them to retry.
  if (!raw) return bounce(origin, { oauth: "error", reason: "expired-state", provider });
  const payload = await verifyOauthState(raw);
  if (!payload) return bounce(origin, { oauth: "error", reason: "expired-state", provider });
  if (payload.provider !== provider || payload.nonce !== state) {
    return bounce(origin, { oauth: "error", reason: "bad-state", provider });
  }

  const uid = await getCurrentFanUserId();
  if (!uid || uid !== payload.userId) {
    return bounce(origin, { oauth: "error", reason: "session", provider });
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
    // A reward failure must not turn an already saved connection into a
    // misleading connection failure or prevent its initial sync.
    await awardPoints(uid, typeof pts === "number" ? pts : 25, String(reason), "oauth", provider).catch(() => {
      console.error("[oauth/callback] connection reward could not be recorded", provider);
    });
    // Complete the first sync before returning. `syncProvider` records a
    // provider error without discarding the successfully stored connection.
    const sync = await syncProvider(uid, provider).catch(() => ({ ok: false }));
    return bounce(origin, { oauth: sync.ok ? "ok" : "sync-error", provider });
  } catch (e) {
    if (e instanceof ProviderLinkedElsewhereError) {
      return bounce(origin, { oauth: "linked", provider });
    }
    if (e instanceof OauthConnectError) {
      return bounce(origin, { oauth: "error", reason: e.reason, provider });
    }
    console.error("[oauth/callback]", provider, e instanceof Error ? e.message : "exchange failed");
    return bounce(origin, { oauth: "error", reason: "exchange", provider });
  }
}
