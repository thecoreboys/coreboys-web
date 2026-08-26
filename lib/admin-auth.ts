/** Server-only primitives for staff password sessions and TOTP challenges. */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "coreboys-admin-session";
export const MFA_CHALLENGE_COOKIE = "coreboys-admin-mfa";
const ALG = "HS256";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const MFA_CHALLENGE_TTL_SECONDS = 60 * 10;

function getSecret(): Uint8Array {
  const raw = process.env.ADMIN_SESSION_SECRET;
  if (!raw || raw.length < 24) {
    throw new Error("ADMIN_SESSION_SECRET must be set to a >=24 char string for admin auth.");
  }
  return new TextEncoder().encode(raw);
}

export type AdminSession = {
  email: string;
  /** Elevated admins must have completed TOTP for this session. */
  mfa: boolean;
  /** Incremented on security changes to revoke old sessions. */
  sv: number;
  iat: number;
  exp: number;
};

export type MfaChallengeSession = {
  email: string;
  challengeId: string;
  iat: number;
  exp: number;
};

export async function signSessionToken(
  email: string,
  options: { mfa: boolean; sessionVersion: number },
): Promise<string> {
  return new SignJWT({ email, mfa: options.mfa, sv: options.sessionVersion })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
    if (
      typeof payload.email !== "string"
      || typeof payload.mfa !== "boolean"
      || !Number.isInteger(payload.sv)
    ) return null;
    return payload as AdminSession;
  } catch {
    return null;
  }
}

export async function signMfaChallengeToken(email: string, challengeId: string): Promise<string> {
  return new SignJWT({ email, cid: challengeId, kind: "admin-mfa" })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${MFA_CHALLENGE_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyMfaChallengeToken(token: string): Promise<MfaChallengeSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
    if (payload.kind !== "admin-mfa" || typeof payload.email !== "string" || typeof payload.cid !== "string") return null;
    return {
      email: payload.email,
      challengeId: payload.cid,
      iat: typeof payload.iat === "number" ? payload.iat : 0,
      exp: typeof payload.exp === "number" ? payload.exp : 0,
    };
  } catch {
    return null;
  }
}

function cookie(name: string, value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}

export function buildSessionCookie(token: string): string {
  return cookie(SESSION_COOKIE, token, SESSION_TTL_SECONDS);
}

export function buildClearSessionCookie(): string {
  return cookie(SESSION_COOKIE, "", 0);
}

export function buildMfaChallengeCookie(token: string): string {
  return cookie(MFA_CHALLENGE_COOKIE, token, MFA_CHALLENGE_TTL_SECONDS);
}

export function buildClearMfaChallengeCookie(): string {
  return cookie(MFA_CHALLENGE_COOKIE, "", 0);
}
