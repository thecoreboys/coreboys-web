/**
 * Fan account sessions — public-facing, separate from the /admin gate
 * (lib/admin-auth.ts). HS256-signed JWT in an HttpOnly cookie carrying the
 * fan user id. Mirrors the admin-auth ergonomics so the two systems read the
 * same way, but uses its own cookie + secret so they never collide.
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { query } from "@/lib/db";

export const FAN_SESSION_COOKIE = "coreboys-fan-session";
const ALG = "HS256";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret(): Uint8Array {
  const raw = process.env.FAN_SESSION_SECRET;
  if (!raw || raw.length < 24) {
    throw new Error(
      "FAN_SESSION_SECRET must be set to a >=24 char string for fan auth.",
    );
  }
  return new TextEncoder().encode(raw);
}

export type FanSession = {
  /** Fan user id. */
  sub: string;
  iat: number;
  exp: number;
  ver?: number;
};

export async function signFanSessionToken(userId: string, sessionVersion = 0): Promise<string> {
  return new SignJWT({ ver: sessionVersion })
    .setProtectedHeader({ alg: ALG })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyFanSessionToken(token: string): Promise<FanSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
    if (typeof payload.sub !== "string") return null;
    if (payload.ver !== undefined && (!Number.isSafeInteger(payload.ver) || Number(payload.ver) < 0)) return null;
    return payload as FanSession;
  } catch {
    return null;
  }
}

export function buildFanSessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${FAN_SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function buildClearFanSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${FAN_SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

/**
 * Reads + verifies the fan session from the request cookies (server-side).
 * Returns the fan user id, or null if unauthenticated.
 */
export async function getCurrentFanUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(FAN_SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifyFanSessionToken(token);
  if (!session) return null;
  const user = (await query<{ session_version: number }>(
    `SELECT session_version FROM fan_users WHERE id=$1`,
    [session.sub],
  )).rows[0];
  return user && user.session_version === (session.ver ?? 0) ? session.sub : null;
}
