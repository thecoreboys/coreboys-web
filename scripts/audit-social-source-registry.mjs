import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const databaseUrl = new URL(process.env.DATABASE_URL);
const local = databaseUrl.hostname === "localhost" || databaseUrl.hostname === "127.0.0.1";
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: local ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 5_000,
  statement_timeout: 5_000,
});

await client.connect();
try {
  const result = await client.query(
    `SELECT provider, account_ref, member_slug, credential_state, webhook_state,
            last_received_at IS NOT NULL AS received
       FROM social_source_registry
      ORDER BY provider, account_ref`,
  );
  console.log(JSON.stringify(result.rows, null, 2));
} finally {
  await client.end();
}
