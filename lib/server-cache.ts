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

export const cachedPublicData = createPublicCache({
  read: (key) => redisGetJson(`coreboys:public:${namespace}:${key}`),
  write: (key, value, ttl) => redisSetJson(`coreboys:public:${namespace}:${key}`, value, ttl),
  background: (work) => {
    // Next keeps refresh work alive after the response has been sent.
    try { after(work); } catch { void work(); }
  },
});
