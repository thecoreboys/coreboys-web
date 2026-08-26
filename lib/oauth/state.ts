/**
 * Signed OAuth state cookie (PKCE verifier + CSRF nonce + fan user id).
 * Lives 10 minutes. HttpOnly. Never exposed to JS.
 */
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "node:crypto";
import type { OauthProvider } from "@/lib/oauth/providers";

export const OAUTH_STATE_COOKIE = "coreboys-oauth-state";
const TTL = 60 * 10;

function secret(): Uint8Array {
  const raw = process.env.FAN_OAUTH_KEY || process.env.FAN_SESSION_SECRET;
  if (!raw || raw.length < 24) {
    throw new Error("FAN_SESSION_SECRET (or FAN_OAUTH_KEY) required for OAuth state.");
  }
  return new TextEncoder().encode(raw);
}

export type OauthState = {
  provider: OauthProvider;
  userId: string;
  nonce: string;
  verifier: string;
  origin: string;
  /** High-risk scopes are available only through an explicit X step-up. */
  scopeProfile?: "default" | "x-interact";
};

export function randomVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function challengeS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export async function signOauthState(payload: OauthState): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL}s`)
    .sign(secret());
}

export async function verifyOauthState(token: string): Promise<OauthState | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (
      typeof payload.provider !== "string" ||
      typeof payload.userId !== "string" ||
      typeof payload.nonce !== "string" ||
      typeof payload.verifier !== "string" ||
      typeof payload.origin !== "string"
    ) {
      return null;
    }
    if (
      payload.scopeProfile !== undefined &&
      payload.scopeProfile !== "default" &&
      payload.scopeProfile !== "x-interact"
    ) return null;
    return payload as OauthState;
  } catch {
    return null;
  }
}

export function buildOauthStateCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${OAUTH_STATE_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${TTL}${secure}`;
}

export function clearOauthStateCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${OAUTH_STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}
