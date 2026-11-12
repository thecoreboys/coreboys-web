import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { createPublicCache } from "./public-cache";
import { redisGetJson, redisSetJson } from "./redis";

// Isolate production, preview, and local DBs even if they share a Redis host.
// Only the hash is used in Redis keys; connection details never leave the app.
const namespace = createHash("sha256").update([
  process.env.CORE_CACHE_NAMESPACE ?? "",
  process.env.NEXT_PUBLIC_SITE_URL ?? "local",
  process.env.DATABASE_URL ?? "",
].join("|")).digest("hex").slice(0, 16);

// Route handlers, server components, and startup instrumentation are separate
// bundles. Share their in-process snapshots instead of rebuilding per bundle.
const processCache = globalThis as typeof globalThis & {
  __corePublicCaches?: Map<string, ReturnType<typeof createPublicCache>>;
};
const caches = processCache.__corePublicCaches ??= new Map<string, ReturnType<typeof createPublicCache>>();
export const cachedPublicData: ReturnType<typeof createPublicCache> = caches.get(namespace) ?? createPublicCache({
  read: (key) => redisGetJson(`coreboys:public:${namespace}:${key}`),
  write: (key, value, ttl) => redisSetJson(`coreboys:public:${namespace}:${key}`, value, ttl),
  background: (work) => {
    // Next keeps refresh work alive after the response has been sent.
    try { after(work); } catch { void work(); }
  },
});
caches.set(namespace, cachedPublicData);

// Thumbnail lookups have a much larger key space than page snapshots. Keep
// their bounded in-process LRU separate so they cannot evict the home catalog.
const thumbnailNamespace = `${namespace}:thumbnails`;
export const cachedThumbnailData: ReturnType<typeof createPublicCache> = caches.get(thumbnailNamespace) ?? createPublicCache({
  read: (key) => redisGetJson(`coreboys:public:${thumbnailNamespace}:${key}`),
  write: (key, value, ttl) => redisSetJson(`coreboys:public:${thumbnailNamespace}:${key}`, value, ttl),
  background: (work) => {
    try { after(work); } catch { void work(); }
  },
});
caches.set(thumbnailNamespace, cachedThumbnailData);
