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
import { Pool, type QueryResult, type QueryResultRow } from "pg";

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
  const pool = new Pool({
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: false },
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
