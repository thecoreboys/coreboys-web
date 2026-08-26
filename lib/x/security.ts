import "server-only";

import { SignJWT, jwtVerify } from "jose";

const PURPOSE = "x-native-action";
const TTL_SECONDS = 15 * 60;

function secret(): Uint8Array {
  const raw = process.env.FAN_OAUTH_KEY || process.env.FAN_SESSION_SECRET;
  if (!raw || raw.length < 24) throw new Error("Fan OAuth signing key is not configured.");
  return new TextEncoder().encode(raw);
}

export async function issueXActionCsrfToken(userId: string): Promise<string> {
  return new SignJWT({ purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifyXActionCsrfToken(token: string, userId: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return payload.sub === userId && payload.purpose === PURPOSE;
  } catch {
    return false;
  }
}

/** Reject cross-site unsafe requests before parsing or touching the OAuth vault. */
export function requestHasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let expected: string;
  try {
    expected = new URL(request.url).origin;
  } catch {
    return false;
  }
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const allowed = new Set([expected]);
  if (configured) {
    try { allowed.add(new URL(configured).origin); } catch { /* invalid config is not trusted */ }
  }
  if (!allowed.has(origin)) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "same-site";
}
