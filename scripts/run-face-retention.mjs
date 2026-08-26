/** Invoke the idempotent face-data retention route from a scheduler or shell. */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const envPath = join(scriptDir, "..", ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}

const siteUrl = process.env.FACE_RETENTION_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
const secret = process.env.FACE_RETENTION_CRON_SECRET;
if (!siteUrl) throw new Error("Set FACE_RETENTION_URL or NEXT_PUBLIC_SITE_URL.");
if (!secret || secret.trim().length < 32) {
  throw new Error("FACE_RETENTION_CRON_SECRET must contain at least 32 characters.");
}
const endpoint = new URL("/api/admin/faces/maintenance", siteUrl);
const response = await fetch(endpoint, {
  method: "POST",
  headers: { "x-face-retention-secret": secret },
});
const body = await response.text();
if (!response.ok && response.status !== 202) {
  throw new Error(`Face retention failed (${response.status}): ${body}`);
}
console.log(body);
