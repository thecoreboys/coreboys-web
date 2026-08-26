/** Invoke the idempotent FanZone cleanup route from a scheduler or local shell. */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const envPath = join(scriptDir, "..", ".env.local");
if (existsSync(envPath)) {
  const envText = readFileSync(envPath, "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}

const siteUrl = process.env.FANZONE_RETENTION_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
const secret = process.env.FANZONE_CRON_SECRET;
if (!siteUrl) throw new Error("Set FANZONE_RETENTION_URL or NEXT_PUBLIC_SITE_URL.");
if (!secret) throw new Error("FANZONE_CRON_SECRET is not configured.");
const endpoint = new URL("/api/admin/fanzone/cleanup", siteUrl);
const response = await fetch(endpoint, {
  method: "POST",
  headers: { "x-cron-secret": secret },
});
const body = await response.text();
if (!response.ok) throw new Error(`Cleanup failed (${response.status}): ${body}`);
console.log(body);
