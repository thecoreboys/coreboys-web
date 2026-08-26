/** Apply the additive FanZone migration to DATABASE_URL from .env.local. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, "..");
const envText = readFileSync(join(webRoot, ".env.local"), "utf8");
for (const line of envText.split(/\r?\n/)) {
  const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
  if (!match) continue;
  let value = match[2];
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (!(match[1] in process.env)) process.env[match[1]] = value;
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not configured.");
const parsed = new URL(url);
const client = new pg.Client({
  host: parsed.hostname,
  port: parsed.port ? Number(parsed.port) : 5432,
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database: parsed.pathname.replace(/^\//, ""),
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const sql = readFileSync(join(webRoot, "scripts", "migrations", "008_fanzone_wall.sql"), "utf8");
  await client.query(sql);
  console.log("Applied 008_fanzone_wall.sql.");
} finally {
  await client.end();
}
