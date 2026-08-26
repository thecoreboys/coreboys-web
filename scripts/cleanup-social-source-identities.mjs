import pg from "pg";
import { GROUP_SOCIALS, MEMBERS } from "@coreboys/shared";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const apply = process.argv.includes("--apply");

function bareHandle(raw = "") {
  const fromUrl = raw.match(/(?:x|twitter)\.com\/([^/?#]+)/i)?.[1];
  return (fromUrl ?? raw).trim().replace(/^@+/, "").toLowerCase();
}

const groupX = GROUP_SOCIALS.find((social) => social.platform === "x");
const expectedX = new Set([
  bareHandle(groupX?.handle || groupX?.url),
  ...MEMBERS.map((member) => {
    const social = member.socials.find((candidate) => candidate.platform === "x");
    return bareHandle(social?.handle || social?.url);
  }),
].filter(Boolean));

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
    `SELECT s.id::text, s.provider, s.account_ref, s.webhook_state,
            s.last_received_at IS NOT NULL AS received,
            COUNT(e.id)::int AS event_references
       FROM social_source_registry s
       LEFT JOIN social_content_events e ON e.source_id=s.id
      WHERE s.provider IN ('youtube','x')
      GROUP BY s.id
      ORDER BY s.provider, s.account_ref`,
  );
  const candidates = result.rows.filter((row) => {
    const wrongIdentity = row.provider === "youtube"
      ? !/^UC[0-9A-Za-z_-]{22}$/.test(row.account_ref)
      : !expectedX.has(bareHandle(row.account_ref));
    return wrongIdentity
      && row.webhook_state !== "verified"
      && !row.received
      && row.event_references === 0;
  });

  console.log(JSON.stringify(candidates.map(({ id: _id, ...row }) => row), null, 2));
  if (!apply) {
    console.log(`Dry run: ${candidates.length} removable identity rows. Re-run with --apply to delete exactly these rows.`);
  } else if (candidates.length) {
    await client.query("BEGIN");
    try {
      const deleted = await client.query(
        `DELETE FROM social_source_registry WHERE id = ANY($1::uuid[])`,
        [candidates.map((row) => row.id)],
      );
      await client.query("COMMIT");
      console.log(`Deleted ${deleted.rowCount ?? 0} unverified, unreferenced identity rows.`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } else {
    console.log("No removable identity rows found.");
  }
} finally {
  await client.end();
}
