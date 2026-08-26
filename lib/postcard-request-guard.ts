const WINDOW_MS = 15 * 60 * 1_000;
const MAX_ATTEMPTS = 6;

type Bucket = { count: number; resetAt: number };

// Best-effort per-instance protection. Stripe Radar remains authoritative for
// payment abuse; this guard prevents one client from cheaply creating an
// unbounded number of large DB rows or PaymentIntents on a warm instance.
const buckets = new Map<string, Bucket>();

export type PostcardRequestLimit = {
  ok: boolean;
  remaining: number;
  resetAt: number;
};

export function consumePostcardRequest(
  key: string,
  now = Date.now(),
  maximum = MAX_ATTEMPTS,
  windowMs = WINDOW_MS,
): PostcardRequestLimit {
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  if (bucket.count >= maximum) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt };
  }
  bucket.count += 1;

  // Bound memory if an instance sees many one-off addresses.
  if (buckets.size > 10_000) {
    for (const [candidate, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(candidate);
      if (buckets.size <= 8_000) break;
    }
  }
  return { ok: true, remaining: maximum - bucket.count, resetAt: bucket.resetAt };
}

export function postcardRequestKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

export function isTrustedPostcardRequest(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  let supplied: string;
  try {
    supplied = new URL(origin).origin;
  } catch {
    return false;
  }

  const allowed = new Set<string>();
  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
    allowed.add(requestUrl.origin);
  } catch {
    return false;
  }
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    try {
      allowed.add(new URL(configured).origin);
    } catch {
      // A malformed configured origin should not broaden the allowlist.
    }
  }
  if (allowed.has(supplied)) return true;

  // Next's local dev proxy can normalize 127.0.0.1 to localhost (or the
  // reverse). Treat only same-port loopback names as equivalent outside
  // production; this never broadens the deployed allowlist.
  if (process.env.NODE_ENV !== "production") {
    const suppliedUrl = new URL(supplied);
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
    if (
      loopbackHosts.has(suppliedUrl.hostname)
      && loopbackHosts.has(requestUrl.hostname)
      && suppliedUrl.port === requestUrl.port
    ) {
      return true;
    }
  }
  return false;
}

/** Test-only reset so rate-limit cases do not depend on process order. */
export function resetPostcardRequestLimitsForTests(): void {
  buckets.clear();
}
