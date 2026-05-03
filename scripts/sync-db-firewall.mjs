#!/usr/bin/env node
/**
 * predev hook: sync this machine's public IP into the DigitalOcean
 * managed-database firewall for `coreboys-db` so `pnpm dev` can hit
 * Postgres directly. Replaces any stale `ip_addr` rules with the
 * current IP, leaves `app/<id>` rules (the App Platform allowlist)
 * untouched.
 *
 * Fails soft: if `DIGITALOCEAN_ACCESS_TOKEN` isn't set, prints a
 * warning and exits 0 so `pnpm dev` still launches.
 *
 * Reads env from `.env.local` directly so this script doesn't depend
 * on Next.js' env loader.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

// ── tiny .env.local parser (no deps) ─────────────────────────────────
function loadEnv() {
  const file = resolve(REPO_ROOT, ".env.local");
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key] != null) continue; // existing env wins
    let v = raw.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[key] = v;
  }
}
loadEnv();

const TOKEN = process.env.DIGITALOCEAN_ACCESS_TOKEN;
const CLUSTER_ID = process.env.DO_DB_CLUSTER_ID;

if (!TOKEN || !CLUSTER_ID) {
  console.warn(
    "[db-firewall] DIGITALOCEAN_ACCESS_TOKEN or DO_DB_CLUSTER_ID not set; skipping sync.",
  );
  process.exit(0);
}

const API = "https://api.digitalocean.com/v2";
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

async function getPublicIp() {
  const res = await fetch("https://api.ipify.org?format=json", {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`ipify ${res.status}`);
  const json = await res.json();
  if (!json.ip || typeof json.ip !== "string") {
    throw new Error("ipify returned no ip");
  }
  return json.ip;
}

async function listRules() {
  const res = await fetch(`${API}/databases/${CLUSTER_ID}/firewall`, {
    headers: HEADERS,
  });
  if (!res.ok) throw new Error(`list firewall ${res.status}`);
  const json = await res.json();
  return json.rules ?? [];
}

async function putRules(rules) {
  // PUT replaces the entire ruleset. Pass through everything we got
  // back, only changing the `ip_addr` rules. `uuid` round-trips through.
  const res = await fetch(`${API}/databases/${CLUSTER_ID}/firewall`, {
    method: "PUT",
    headers: HEADERS,
    body: JSON.stringify({ rules }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`put firewall ${res.status}: ${body}`);
  }
}

(async () => {
  try {
    const ip = await getPublicIp();
    const existing = await listRules();
    const ipRules = existing.filter((r) => r.type === "ip_addr");
    const otherRules = existing.filter((r) => r.type !== "ip_addr");
    const alreadyTrusted = ipRules.some((r) => r.value === ip);

    if (alreadyTrusted && ipRules.length === 1) {
      console.log(`[db-firewall] ✓ ${ip} already trusted, no change.`);
      return;
    }

    const next = [
      ...otherRules.map((r) => ({ type: r.type, value: r.value })),
      { type: "ip_addr", value: ip },
    ];

    await putRules(next);
    console.log(
      `[db-firewall] ✓ trusted IP ${ip} (replaced ${ipRules.length} prior ip_addr rule${ipRules.length === 1 ? "" : "s"})`,
    );
  } catch (e) {
    console.warn(`[db-firewall] sync failed: ${e instanceof Error ? e.message : e}`);
    console.warn("[db-firewall] continuing — local Postgres may not connect until firewall is fixed.");
    process.exit(0);
  }
})();
