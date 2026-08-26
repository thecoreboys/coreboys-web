/**
 * Server-only Postgres pool for the metrics pipeline. Connects to the
 * managed `coreboys-db` cluster on DigitalOcean. Lazy-initialised so
 * import-time evaluation in client bundles is a no-op (the `pg` module
 * itself is the guard — it throws if loaded in the browser).
 *
 * Keep the pool small. The metrics endpoints are low-throughput; we
 * just need one connection at a time. Idle clients reap fast so
 * serverless / single-instance reloads don't stack zombies.
 */
import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function getPool(): Pool {
  if (global.__pgPool) return global.__pgPool;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — required for metrics queries.",
    );
  }
  // Parse the URL by hand. `pg-connection-string` in pg ≥ 8.20 promotes
  // `sslmode=require` to `verify-full`, which then rejects DO's
  // self-signed CA chain. Building the config explicitly with
  // `ssl.rejectUnauthorized = false` keeps "encrypted but not strict CA
  // verified" — the DO documented stance for managed Postgres without
  // shipping the CA bundle.
  const u = new URL(url);
  const sslDisabled = u.searchParams.get("sslmode") === "disable";
  const isLocalDatabase = u.hostname === "127.0.0.1" || u.hostname === "localhost";
  const pool = new Pool({
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: sslDisabled || isLocalDatabase ? false : { rejectUnauthorized: false },
  });
  global.__pgPool = pool;
  return pool;
}

/**
 * Run a parameterised query and return rows. Pass `T` for the row type
 * to get end-to-end typing without manual casts.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: ReadonlyArray<unknown> = [],
): Promise<QueryResult<T>> {
  const pool = getPool();
  return pool.query<T>(text, params as unknown[]);
}

export type Sql = typeof query;

/**
 * Run related writes on one connection. Callers own the statements inside
 * the callback; this helper guarantees commit/rollback and always releases
 * the client. It is intentionally small so ordinary readers keep using
 * query() and the existing pool behavior.
 */
export async function withTransaction<T>(
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/* ------------------------------------------------------------------ *
 * Instagram sources migration (idempotent).
 *
 * No standalone migration runner exists in lib/db.ts; the SQL files in
 * scripts/migrations/ are applied out-of-band. To keep the Instagram
 * feature self-contained and zero-config, the schema is created lazily
 * the first time it's needed and guarded with `CREATE TABLE IF NOT
 * EXISTS` + `INSERT ... ON CONFLICT DO NOTHING`, so repeated calls are
 * safe and cheap. Mirrors the pattern in scripts/migrations/*.sql.
 * ------------------------------------------------------------------ */

let __instagramSchemaReady: Promise<void> | null = null;

/** A seed row for the instagram_sources table. */
export type InstagramSourceSeed = {
  ownerLabel: string;
  /** Bare handle, no leading @. */
  handle: string;
  /** "member" | "group". */
  kind: string;
};

/**
 * Create the `instagram_sources` table (idempotent) and seed it with the
 * provided handles. Safe to call repeatedly — the result is memoised per
 * process and every statement is conflict-guarded. Never throws to the
 * caller's happy path beyond connection failures (callers wrap in
 * try/catch).
 */
export async function ensureInstagramSchema(
  seeds: ReadonlyArray<InstagramSourceSeed> = [],
): Promise<void> {
  if (__instagramSchemaReady) return __instagramSchemaReady;
  __instagramSchemaReady = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS instagram_sources (
        id          SERIAL PRIMARY KEY,
        owner_label TEXT,
        handle      TEXT UNIQUE,
        kind        TEXT,
        enabled     BOOLEAN DEFAULT TRUE,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    for (const s of seeds) {
      if (!s.handle) continue;
      await query(
        `INSERT INTO instagram_sources (owner_label, handle, kind)
         VALUES ($1, $2, $3)
         ON CONFLICT (handle) DO NOTHING`,
        [s.ownerLabel, s.handle, s.kind],
      );
    }
  })().catch((err) => {
    // Reset so a later call can retry after a transient failure.
    __instagramSchemaReady = null;
    throw err;
  });
  return __instagramSchemaReady;
}
