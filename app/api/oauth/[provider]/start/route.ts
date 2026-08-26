import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import {
  isOauthProvider,
  providerConfigured,
} from "@/lib/oauth/providers";
import { authorizeUrl } from "@/lib/oauth/exchange";
import {
  buildOauthStateCookie,
  challengeS256,
  randomVerifier,
  signOauthState,
} from "@/lib/oauth/state";
import { randomBytes } from "node:crypto";
import { xNativeActionsEnvironment } from "@/lib/x/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { provider } = await ctx.params;
  if (!isOauthProvider(provider)) {
    return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  }
  const uid = await getCurrentFanUserId();
  if (!uid) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", "/account");
    return NextResponse.redirect(login);
  }
  if (!providerConfigured(provider)) {
    const back = new URL("/account", req.url);
    back.searchParams.set("oauth", "unconfigured");
    back.searchParams.set("provider", provider);
    return NextResponse.redirect(back);
  }

  const interactionStepUp = provider === "x" && new URL(req.url).searchParams.get("intent") === "interact";
  if (interactionStepUp && !xNativeActionsEnvironment().enabled) {
    const back = new URL("/account", req.url);
    back.searchParams.set("oauth", "x-actions-disabled");
    return NextResponse.redirect(back);
  }
  const scopeProfile = interactionStepUp ? "x-interact" as const : "default" as const;

  const origin = new URL(req.url).origin;
  const verifier = randomVerifier();
  const nonce = randomBytes(16).toString("hex");
  const token = await signOauthState({
    provider,
    userId: uid,
    nonce,
    verifier,
    origin,
    scopeProfile,
  });
  const url = authorizeUrl(provider, origin, nonce, challengeS256(verifier), scopeProfile);
  const res = NextResponse.redirect(url);
  res.headers.set("Set-Cookie", buildOauthStateCookie(token));
  return res;
}
