const TOKEN_VERSION = "v1";
export const SITE_ACCESS_COOKIE = "coreboys-site-access";
export const SITE_ACCESS_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const encoder = new TextEncoder();

function secret(): string | null {
  return process.env.SITE_ACCESS_COOKIE_SECRET?.trim() || null;
}

function configuredCode(): string | null {
  return process.env.SITE_ACCESS_CODE?.trim() || null;
}

export function siteAccessGateEnabled(): boolean {
  return process.env.NODE_ENV === "production" && Boolean(secret() && configuredCode());
}

async function hmacKey() {
  const value = secret();
  if (!value) return null;
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(value),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

async function signatureFor(value: string): Promise<Uint8Array | null> {
  const key = await hmacKey();
  if (!key) return null;
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export async function createSiteAccessToken(now = Date.now()): Promise<string | null> {
  const expiresAt = now + SITE_ACCESS_MAX_AGE_SECONDS * 1_000;
  const payload = `${TOKEN_VERSION}.${expiresAt}`;
  const signature = await signatureFor(payload);
  return signature ? `${payload}.${base64Url(signature)}` : null;
}

export async function verifySiteAccessToken(token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const [version, rawExpiry, rawSignature, ...rest] = token.split(".");
  if (rest.length || version !== TOKEN_VERSION || !/^\d{13}$/.test(rawExpiry ?? "")) return false;
  const expiry = Number(rawExpiry);
  if (!Number.isFinite(expiry) || expiry <= now) return false;
  const signature = fromBase64Url(rawSignature ?? "");
  const key = await hmacKey();
  if (!signature || !key) return false;
  return crypto.subtle.verify(
    "HMAC",
    key,
    signature as BufferSource,
    encoder.encode(`${version}.${rawExpiry}`),
  );
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left[index % left.length] ?? 0) ^ (right[index % right.length] ?? 0);
  }
  return mismatch === 0;
}

export async function siteAccessCodeMatches(candidate: string): Promise<boolean> {
  const expectedCode = configuredCode();
  if (!expectedCode) return false;
  const [expected, received] = await Promise.all([
    signatureFor(`code:${expectedCode}`),
    signatureFor(`code:${candidate}`),
  ]);
  return Boolean(expected && received && constantTimeEqual(expected, received));
}

export async function siteAccessSubjectKey(ip: string): Promise<string> {
  const signature = await signatureFor(`ip:${ip}`);
  if (!signature) throw new Error("SITE_ACCESS_COOKIE_SECRET is not configured");
  return `site-access:${base64Url(signature)}`;
}
