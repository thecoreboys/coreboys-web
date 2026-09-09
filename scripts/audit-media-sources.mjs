/** Read-only source discovery. Never prints credentials, raw payloads or signed URLs. */
import pg from "pg";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const output = (section, rows) => console.log(JSON.stringify({ section, rows }));
const databaseUrl = process.env.CORE_AUDIT_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  const client = new pg.Client({
    host: url.hostname, port: Number(url.port) || 5432,
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    database: url.pathname.slice(1), ssl: ["localhost", "127.0.0.1"].includes(url.hostname) ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000, statement_timeout: 15_000,
  });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    output("source_registry", (await client.query(`
      SELECT provider, credential_state, count(*)::int AS sources
      FROM social_source_registry GROUP BY provider, credential_state ORDER BY provider
    `)).rows);
    output("persisted_events", (await client.query(`
      SELECT provider, content_type, count(*)::int AS items,
        count(*) FILTER (WHERE nullif(platform_payload->>'mediaUrl','') IS NOT NULL
          OR nullif(platform_payload->>'media_url','') IS NOT NULL)::int AS direct_media,
        count(*) FILTER (WHERE platform_payload ? 'transcript' OR platform_payload ? 'captions')::int AS caption_fields
      FROM social_content_events GROUP BY provider, content_type ORDER BY provider, content_type
    `)).rows);
    output("indexed_assets", (await client.query(`
      SELECT platform, count(*)::int AS assets,
        count(*) FILTER (WHERE nullif(item->>'mediaUrl','') IS NOT NULL)::int AS direct_media,
        count(*) FILTER (WHERE item ? 'transcript' OR item ? 'captions')::int AS caption_fields
      FROM media_intelligence_assets WHERE active GROUP BY platform ORDER BY platform
    `)).rows);
    output("transcript_imports", (await client.query(`
      SELECT status, count(*)::int AS imports FROM media_intelligence_transcript_imports GROUP BY status
    `)).rows);
    if (process.argv.includes("--sample-youtube")) {
      output("youtube_source_sample", (await client.query(`
        SELECT asset_key, title, creator_label, item->>'accountLabel' AS account_label
        FROM media_intelligence_assets
        WHERE active AND platform='youtube' AND NOT is_live AND creator_slug IS NULL
        ORDER BY published_at DESC NULLS LAST LIMIT 3
      `)).rows);
    }
    await client.query("ROLLBACK");
  } catch (error) {
    // PostgreSQL error codes are sufficient here and cannot contain payload values.
    output("database_error", { code: error.code ?? "connection_failed",
      timedOut: /timeout|timed out/i.test(error.message ?? "") });
    process.exitCode = 1;
  } finally { await client.end(); }
}

const storageNames = ["SPACES_REGION", "SPACES_ENDPOINT", "SPACES_KEY", "SPACES_SECRET", "SPACES_BUCKET"];
output("storage_configuration", Object.fromEntries(storageNames.map((name) => [name, Boolean(process.env[name])])));
if (storageNames.every((name) => process.env[name])) {
  const client = new S3Client({
    region: process.env.SPACES_REGION, endpoint: process.env.SPACES_ENDPOINT,
    credentials: { accessKeyId: process.env.SPACES_KEY, secretAccessKey: process.env.SPACES_SECRET },
    maxAttempts: 1,
  });
  // Only the site's known public creator-asset prefixes, never viewer uploads.
  for (const prefix of ["members/", "crew/", "group/", "comms/", "brand/", "special-message/", "house-reveal.mp4"]) {
    let continuationToken;
    let objects = 0;
    const media = [];
    let pages = 0;
    try {
      do {
        const result = await client.send(new ListObjectsV2Command({
          Bucket: process.env.SPACES_BUCKET, Prefix: prefix, MaxKeys: 1000,
          ContinuationToken: continuationToken,
        }), { abortSignal: AbortSignal.timeout(15_000) });
        for (const object of result.Contents ?? []) {
          objects += 1;
          if (/\.(mp4|webm|mov|m4a|mp3|wav|vtt|srt)$/i.test(object.Key ?? "")) {
            media.push({ key: object.Key, bytes: object.Size });
          }
        }
        continuationToken = result.NextContinuationToken;
        pages += 1;
      } while (continuationToken && pages < 10);
      output("public_storage_prefix", { prefix, objects, media, truncated: Boolean(continuationToken) });
    } catch (error) {
      output("storage_error", { prefix, status: error.$metadata?.httpStatusCode ?? null, name: error.name });
      process.exitCode = 1;
      if (["NoSuchBucket", "AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch"].includes(error.name)) break;
    }
  }
  client.destroy();
}
