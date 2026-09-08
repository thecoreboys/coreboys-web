/** Read-only job diagnostics. Credentials are supplied in the process environment, never printed. */
import pg from "pg";
const url = new URL(process.env.CORE_AUDIT_DATABASE_URL);
const client = new pg.Client({
  host: url.hostname, port: Number(url.port) || 5432,
  user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000, statement_timeout: 15_000,
});
try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  console.log(JSON.stringify((await client.query(`
    SELECT status, left(last_error,300) AS error, count(*)::int AS jobs
    FROM media_intelligence_jobs
    WHERE updated_at > now() - interval '2 hours'
    GROUP BY status, left(last_error,300) ORDER BY jobs DESC LIMIT 15
  `)).rows));
  console.log(JSON.stringify((await client.query("SELECT word, catcode FROM pg_get_keywords() WHERE word='references'")).rows));
  console.log(JSON.stringify((await client.query(`
    SELECT r.is_current, j.status, count(*)::int AS jobs
    FROM media_intelligence_jobs j JOIN media_intelligence_revisions r ON r.revision_id=j.revision_id
    WHERE j.last_error='media_job_revision_mismatch'
    GROUP BY r.is_current,j.status
  `)).rows));
  await client.query("ROLLBACK");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await client.end(); }
