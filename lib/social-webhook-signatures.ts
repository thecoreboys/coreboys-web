import { createHmac, timingSafeEqual } from "node:crypto";

export function freshTimestamp(value: string | null, maxAgeSeconds = 600) {
  const stamp = value ? Date.parse(value) : NaN;
  return Number.isFinite(stamp) && Math.abs(Date.now() - stamp) <= maxAgeSeconds * 1000;
}

export function matchesHmac(secret: string | undefined, payload: string, received: string | null, prefix = "sha256=") {
  if (!secret || !received) return false;
  const expected = `${prefix}${createHmac("sha256", secret).update(payload).digest("hex")}`;
  const actual = received.trim();
  return expected.length === actual.length && timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export function matchesSha1Hmac(secret: string | undefined, payload: string, received: string | null) {
  if (!secret || !received) return false;
  const expected = `sha1=${createHmac("sha1", secret).update(payload).digest("hex")}`;
  const actual = received.trim().toLowerCase();
  return expected.length === actual.length && timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

/** Verify TikTok's `t=UNIX,s=HEX` signature over `${timestamp}.${rawBody}`. */
export function matchesTikTokHmac(
  secret: string | undefined,
  payload: string,
  signatureHeader: string | null,
  maxAgeSeconds = 600,
) {
  if (!secret || !signatureHeader) return false;
  const parts = new Map<string, string>();
  for (const pair of signatureHeader.split(",")) {
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    parts.set(pair.slice(0, separator).trim().toLowerCase(), pair.slice(separator + 1).trim());
  }
  const timestamp = parts.get("t") ?? "";
  const signature = parts.get("s")?.toLowerCase() ?? "";
  if (!/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > maxAgeSeconds * 1000) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
