/**
 * Custom admin auth — replaces Clerk for the /admin gate. We have one
 * admin (mdcranberry@gmail.com) and that's it, so a bcrypt-hashed
 * password in Postgres + an HS256-signed session cookie is plenty.
 *
 * Three call sites:
 *   • POST /api/admin/login    → bcrypt.compare + setSessionCookie
 *   • POST /api/admin/logout   → clearSessionCookie
 *   • middleware.ts            → verifySessionToken (edge-runtime safe)
 *
 * The cookie is HttpOnly + Secure (in prod) + SameSite=Lax. Lifetime
 * is 7 days; reissued on every authenticated request via the layout.
 */

import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "coreboys-admin-session";
const ALG = "HS256";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): Uint8Array {
  const raw = process.env.ADMIN_SESSION_SECRET;
  if (!raw || raw.length < 24) {
    throw new Error(
      "ADMIN_SESSION_SECRET must be set to a >=24 char string for admin auth.",
    );
  }
  return new TextEncoder().encode(raw);
}

export type AdminSession = {
  email: string;
  /** Issued-at, seconds since epoch. */
  iat: number;
  /** Expires-at, seconds since epoch. */
  exp: number;
};

export async function signSessionToken(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
    if (typeof payload.email !== "string") return null;
    return payload as AdminSession;
  } catch {
    return null;
  }
}

/** Builds the `Set-Cookie` header value for the session token. */
export function buildSessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

/** Builds a cookie header that immediately expires the session. */
export function buildClearSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}
