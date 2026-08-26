#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import pg from "pg";

const { Client } = pg;
const snapshotPath = process.env.X_FEED_LOCAL_SNAPSHOT_PATH?.trim()
  || ".cache/x-feed-snapshot.json";

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validateSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Local X snapshot is malformed.");
  }
  if (!Array.isArray(value.payload) || value.payload.length === 0) {
    throw new Error("Local X snapshot has no items.");
  }
  if (!validTimestamp(value.refreshedAt) || !validTimestamp(value.attemptedAt)) {
    throw new Error("Local X snapshot timestamps are invalid.");
  }
  if (value.payload.some((item) => item?.platform !== "x" || !item?.id)) {
    throw new Error("Local X snapshot contains an invalid item.");
  }
  return value;
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required.");
  }
  const snapshot = validateSnapshot(JSON.parse(await readFile(snapshotPath, "utf8")));
  const statusCount = new Set(
    snapshot.payload.map((item) => item?.x?.statusId || item.id).filter(Boolean),
  ).size;
  const userCount = new Set(
    snapshot.payload.map((item) => item?.x?.authorId).filter(Boolean),
  ).size;
  const postUnitUsd = Number(process.env.X_API_READ_POST_UNIT_USD);
  const userUnitUsd = Number(process.env.X_API_READ_USER_UNIT_USD);
  const estimatedCostMicrousd = Math.round(1_000_000 * (
    statusCount * (Number.isFinite(postUnitUsd) ? Math.max(0, postUnitUsd) : 0)
    + userCount * (Number.isFinite(userUnitUsd) ? Math.max(0, userUnitUsd) : 0)
  ));
  const idempotencyKey = `local-snapshot:${snapshot.refreshedAt}`;
  const parsed = new URL(process.env.DATABASE_URL);
  const localDatabase = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: localDatabase ? false : { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO x_feed_snapshots
         (cache_key,payload,refreshed_at,attempted_at,last_error)
       VALUES('core-roster',$1::jsonb,$2,$3,NULL)
       ON CONFLICT(cache_key) DO UPDATE SET
         payload=EXCLUDED.payload,
         refreshed_at=EXCLUDED.refreshed_at,
         attempted_at=EXCLUDED.attempted_at,
         last_error=NULL`,
      [JSON.stringify(snapshot.payload), snapshot.refreshedAt, snapshot.attemptedAt],
    );
    await client.query(
      `INSERT INTO x_api_usage
         (category,endpoint,operation,resource_count,estimated_cost_microusd,cache_hit,success,idempotency_key)
       SELECT 'read','/2/tweets/search/recent','feed.snapshot.refresh.local_recovery',$1,$2,false,true,$3
       WHERE NOT EXISTS (
         SELECT 1 FROM x_api_usage WHERE idempotency_key=$3
       )`,
      [statusCount, estimatedCostMicrousd, idempotencyKey],
    );
    await client.query(
      `UPDATE x_api_usage
          SET resource_count=$1,estimated_cost_microusd=$2
        WHERE idempotency_key=$3`,
      [statusCount, estimatedCostMicrousd, idempotencyKey],
    );
    await client.query("COMMIT");
    console.log(JSON.stringify({
      ok: true,
      importedItems: snapshot.payload.length,
      uniquePosts: statusCount,
      uniqueUsers: userCount,
      estimatedCostUsd: estimatedCostMicrousd / 1_000_000,
      upstreamRequests: 0,
    }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "X snapshot import failed.");
  process.exitCode = 1;
});
