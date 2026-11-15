import { createHash, randomUUID } from "node:crypto";
import { query } from "@/lib/db";

type CachedResponse = { value: unknown };

export type SocialFetchRequestStore = {
  read(key: string): Promise<CachedResponse | null>;
  claim(key: string, token: string): Promise<boolean>;
  complete(key: string, token: string, value: unknown, ttlSeconds: number): Promise<void>;
};

type SharedRequest<T> = {
  key: string;
  ttlSeconds: number;
  load: () => Promise<T>;
  unavailable: () => T;
  successful: (value: T) => boolean;
};

type SharedResult<T> = { value: T; reused: boolean };

/** A credential change gets its own namespace without storing the credential. */
export function socialFetchRequestKey(endpoint: string, apiKey: string): string {
  const canonical = new URL(endpoint);
  canonical.hash = "";
  canonical.searchParams.sort();
  canonical.pathname = canonical.pathname.replace(
    /(\/(?:twitter|instagram|tiktok)\/profiles\/)([^/]+)/,
    (_match, prefix: string, handle: string) => `${prefix}${handle.toLowerCase()}`,
  );
  return createHash("sha256").update(`social-fetch:v1\0${apiKey}\0${canonical}`).digest("hex");
}

/**
 * The durable claim precedes both the credit reservation and the HTTP request.
 * A busy/unavailable store fails closed rather than spending on another replica.
 * No transaction or database connection stays open during the provider call.
 */
export function createSharedSocialFetchRequests(store: SocialFetchRequestStore) {
  const inFlight = new Map<string, Promise<SharedResult<unknown>>>();
  return async function sharedRequest<T>(input: SharedRequest<T>): Promise<SharedResult<T>> {
    const pending = inFlight.get(input.key);
    if (pending) return { value: (await pending).value as T, reused: true };
    const work = (async (): Promise<SharedResult<T>> => {
      const token = randomUUID();
      try {
        const cached = await store.read(input.key);
        if (cached) return { value: cached.value as T, reused: true };
        if (!await store.claim(input.key, token)) {
          // The winning replica may have finished between our read and claim.
          const completed = await store.read(input.key);
          return { value: completed ? completed.value as T : input.unavailable(), reused: true };
        }
      } catch {
        return { value: input.unavailable(), reused: true };
      }

      let value: T;
      try { value = await input.load(); } catch { value = input.unavailable(); }
      const ttl = input.successful(value)
        ? Math.max(1, Math.min(24 * 60 * 60, Math.floor(input.ttlSeconds)))
        : 2 * 60;
      try {
        await store.complete(input.key, token, value, ttl);
      } catch {
        // The lease remains in place when persistence fails, preventing an
        // immediate second paid attempt. The owner's result is still usable.
      }
      return { value, reused: false };
    })();
    inFlight.set(input.key, work);
    try { return await work; }
    finally { if (inFlight.get(input.key) === work) inFlight.delete(input.key); }
  };
}

export const socialFetchRequestStore: SocialFetchRequestStore = {
  async read(key) {
    const result = await query<{ payload: unknown }>(
      `SELECT payload FROM social_fetch_request_cache
        WHERE request_key=$1 AND expires_at > now() AND payload IS NOT NULL`, [key],
    );
    return result.rows[0] ? { value: result.rows[0].payload } : null;
  },
  async claim(key, token) {
    const result = await query(
      `INSERT INTO social_fetch_request_cache (request_key,lease_token,lease_until,expires_at)
       VALUES ($1,$2::uuid,now() + interval '2 minutes',now())
       ON CONFLICT (request_key) DO UPDATE
         SET lease_token=EXCLUDED.lease_token,lease_until=EXCLUDED.lease_until,
             payload=NULL,updated_at=now()
       WHERE social_fetch_request_cache.expires_at <= now()
         AND (social_fetch_request_cache.lease_until IS NULL OR social_fetch_request_cache.lease_until <= now())
       RETURNING request_key`, [key, token],
    );
    return (result.rowCount ?? 0) > 0;
  },
  async complete(key, token, value, ttlSeconds) {
    await query(
      `UPDATE social_fetch_request_cache
          SET payload=$3::jsonb,expires_at=now() + ($4::integer * interval '1 second'),
              lease_token=NULL,lease_until=NULL,updated_at=now()
        WHERE request_key=$1 AND lease_token=$2::uuid`,
      [key, token, JSON.stringify(value), ttlSeconds],
    );
  },
};

/** Disposable cursor responses are purged centrally, never once per viewer/request. */
export async function pruneSharedSocialFetchRequests(): Promise<number> {
  const result = await query(
    // Repeat the guards on the DELETE itself: PostgreSQL rechecks them after a
    // competing claim releases its row lock, so its new lease cannot be erased
    // by the candidate subquery's earlier snapshot.
    `DELETE FROM social_fetch_request_cache
      WHERE expires_at < now() - interval '1 day'
        AND (lease_until IS NULL OR lease_until <= now())
        AND request_key IN (
       SELECT request_key FROM social_fetch_request_cache
        WHERE expires_at < now() - interval '1 day'
          AND (lease_until IS NULL OR lease_until <= now())
        ORDER BY expires_at LIMIT 500
     )`,
  );
  return result.rowCount ?? 0;
}

let requestRunner = createSharedSocialFetchRequests(socialFetchRequestStore);

export function sharedSocialFetchRequest<T>(input: SharedRequest<T>): Promise<SharedResult<T>> {
  return requestRunner(input);
}

/** Explicit isolated store for network-adapter tests; production always uses Postgres. */
export function setSocialFetchRequestStoreForTests(store: SocialFetchRequestStore | null): void {
  if (process.env.NODE_ENV === "production") throw new Error("Cannot replace the paid request store in production.");
  requestRunner = createSharedSocialFetchRequests(store ?? socialFetchRequestStore);
}
