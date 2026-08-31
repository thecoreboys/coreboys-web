import "server-only";

/**
 * Small, optional Upstash Redis adapter. Keeping the transport here means the
 * app still runs locally (and in single-instance deployments) without Redis,
 * while production can share rate-limit state across server instances.
 */
function config() {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.REDIS_URL)?.trim().replace(/\/$/, "");
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.REDIS_TOKEN)?.trim();
  return url && token ? { url, token } : null;
}

export async function redisIncrWithExpiry(key: string, expirySeconds: number): Promise<number | null> {
  const connection = config();
  if (!connection) return null;
  try {
    const response = await fetch(`${connection.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", key], ["EXPIRE", key, Math.max(1, Math.trunc(expirySeconds))]]),
      cache: "no-store",
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) return null;
    const result = (await response.json()) as unknown;
    const value = Array.isArray(result) && typeof result[0] === "object" && result[0] !== null
      ? (result[0] as { result?: unknown }).result
      : null;
    if (value === null || value === undefined) return null;
    const count = typeof value === "number" ? value : Number(value);
    return Number.isFinite(count) ? count : null;
  } catch {
    // Redis is an optimization and coordination layer, never a reason to take
    // the site or an unrelated request offline.
    return null;
  }
}
