import "server-only";
import { Buffer } from "node:buffer";
import { promisify } from "node:util";
import { gzip, gunzip } from "node:zlib";
import { createClient } from "@redis/client";

const TIMEOUT_MS = 800;
const RETRY_AFTER_MS = 15_000;
// An expanded archive must not evict every smaller cache entry before Redis
// rejects its SET for exceeding the server's memory limit.
const MAX_VALUE_BYTES = 16 * 1024 * 1024;
const MAX_JSON_BYTES = 64 * 1024 * 1024;
const COMPRESSED_PREFIX = "coreboys:gzip:v1:";
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
function createNativeClient(url: string) {
  return createClient({
    url,
    socket: { connectTimeout: TIMEOUT_MS, reconnectStrategy: false },
    disableOfflineQueue: true,
    commandsQueueMaxLength: 100,
  });
}
type NativeClient = ReturnType<typeof createNativeClient>;
let nativeClient: NativeClient | null = null;
let connecting: Promise<NativeClient> | null = null;
let retryAt = 0;

function config() {
  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL)?.trim().replace(/\/$/, "");
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_TOKEN)?.trim();
  if (!url) return null;
  if (/^rediss?:\/\//.test(url)) return { kind: "native" as const, url };
  if (/^https?:\/\//.test(url) && token) return { kind: "rest" as const, url, token };
  return null;
}

function discardNativeClient(value: NativeClient) {
  if (nativeClient === value) nativeClient = null;
  try { if (value.isOpen) value.destroy(); } catch { /* already closed */ }
}

async function client(url: string): Promise<NativeClient> {
  if (nativeClient?.isReady) return nativeClient;
  if (connecting) return connecting;
  const next = createNativeClient(url);
  next.on("error", () => { retryAt = Date.now() + RETRY_AFTER_MS; });
  nativeClient = next;
  // connectTimeout covers TCP establishment, not AUTH/HELLO. A Redis server
  // can accept the socket and stop responding before the client becomes ready.
  const attempt = new Promise<NativeClient>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) {
        retryAt = Date.now() + RETRY_AFTER_MS;
        discardNativeClient(next);
        reject(error);
      } else resolve(next);
    };
    const timeout = setTimeout(() => finish(new Error("Redis connection deadline exceeded")), TIMEOUT_MS);
    // Handle even a late handshake rejection after destroy(), so an optional
    // cache outage cannot turn into an unhandled rejection.
    void Promise.resolve().then(() => next.connect()).then(() => finish(), (error) => finish(error));
  });
  const tracked = attempt.finally(() => { if (connecting === tracked) connecting = null; });
  connecting = tracked;
  return tracked;
}

/** Cache failures have a short deadline and back off; pages keep working. */
async function command(args: string[]): Promise<unknown> {
  const connection = config();
  if (!connection || Date.now() < retryAt) return null;
  const deadline = Date.now() + TIMEOUT_MS;
  let usedClient: NativeClient | null = null;
  try {
    if (connection.kind === "native") {
      const redis = await client(connection.url);
      usedClient = redis;
      return await redis.sendCommand(args, { abortSignal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
    }
    const response = await fetch(connection.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error("Redis request failed");
    const body = await response.json() as { result?: unknown; error?: string };
    if (body.error) throw new Error("Redis command failed");
    return body.result ?? null;
  } catch {
    retryAt = Date.now() + RETRY_AFTER_MS;
    if (usedClient) discardNativeClient(usedClient);
    return null;
  }
}

export async function redisGetJson(key: string): Promise<unknown | null> {
  const value = await command(["GET", key]);
  if (typeof value !== "string") return null;
  try {
    if (value.startsWith(COMPRESSED_PREFIX)) {
      if (value.length > MAX_VALUE_BYTES) return null;
      const decoded = await gunzipAsync(Buffer.from(value.slice(COMPRESSED_PREFIX.length), "base64"), {
        maxOutputLength: MAX_JSON_BYTES,
      });
      return JSON.parse(decoded.toString("utf8")) as unknown;
    }
    if (Buffer.byteLength(value, "utf8") > MAX_JSON_BYTES) return null;
    return JSON.parse(value) as unknown;
  } catch { return null; }
}

export async function redisSetJson(key: string, value: unknown, expirySeconds: number): Promise<boolean> {
  let serialized: string | undefined;
  try { serialized = JSON.stringify(value); } catch { return false; }
  if (typeof serialized !== "string" || serialized.length > MAX_JSON_BYTES) return false;
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes > MAX_JSON_BYTES) return false;
  if (bytes > 64 * 1024) {
    try {
      // Archive URLs and metadata repeat heavily. Compress off the event loop
      // before the short Redis transport deadline begins.
      serialized = COMPRESSED_PREFIX + (await gzipAsync(serialized, { level: 1 })).toString("base64");
    } catch { return false; }
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_VALUE_BYTES) return false;
  return await command(["SET", key, serialized, "EX", String(Math.max(1, Math.ceil(expirySeconds)))]) === "OK";
}

export async function redisIncrWithExpiry(key: string, expirySeconds: number): Promise<number | null> {
  // One atomic operation; later requests must not extend the original window.
  const result = await command([
    "EVAL",
    "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return n;",
    "1", key, String(Math.max(1, Math.trunc(expirySeconds))),
  ]);
  return typeof result === "number" && Number.isFinite(result) ? result : null;
}
