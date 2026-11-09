#!/usr/bin/env node
/** Stage public metadata for admin review. Never creates consent or biometrics.
 * DATABASE_URL=... node scripts/import-face-profile-research.mjs manifest.json requester@example.com [--apply]
 * Existing profiles are left untouched, including completed admin reviews.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { rootCertificates } from "node:tls";
import vm from "node:vm";
import ts from "typescript";
import pg from "pg";
import { z } from "zod";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const loaded = new Map();
function load(file) {
  if (loaded.has(file)) return loaded.get(file);
  const exports = {};
  loaded.set(file, exports);
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInThisContext(`(function(exports, require) { ${source}\n })`, { filename: file })(exports,
    (id) => id.startsWith(".") ? load(resolve(dirname(file), `${id}.ts`)) : require(id));
  return exports;
}

export function parseResearchManifest(raw) {
  const { FaceGuestProfileSchema, FaceProfileResearchSchema } = load(resolve(root, "lib/face-people.ts"));
  const entries = z.array(z.object({ profile: FaceGuestProfileSchema, research: FaceProfileResearchSchema }).strict()).min(1).max(200).parse(raw);
  for (const key of ["slug", "twitchLogin"]) {
    const values = entries.map(({ profile }) => profile[key]).filter(Boolean);
    if (new Set(values).size !== values.length) throw new Error(`Duplicate ${key} in research manifest.`);
  }
  return entries;
}

export async function importResearch(db, entries, requester, apply) {
  const owner = (await db.query("SELECT id FROM admin_users WHERE lower(email)=lower($1) AND role='admin' AND deleted_at IS NULL", [requester])).rows[0];
  if (!owner) throw new Error("The requesting owner must have an active admin account.");
  const existing = new Set((await db.query("SELECT slug FROM face_guest_profiles")).rows.map((row) => row.slug));
  const pending = entries.filter(({ profile }) => !existing.has(profile.slug));
  if (!apply) return { mode: "preview", toCreate: pending.length, existingSkipped: entries.length - pending.length };
  let created = 0;
  await db.query("BEGIN");
  try {
    for (const { profile: p, research } of pending) {
      const inserted = await db.query(`INSERT INTO face_guest_profiles
        (slug,display_name,twitch_login,youtube_url,social_links,avatar_url,avatar_source_profile,avatar_checked_at,research,review_status,created_by,updated_by)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb,'pending',$10,$10)
        ON CONFLICT (slug) DO NOTHING RETURNING slug`,
      [p.slug,p.displayName,p.twitchLogin,p.youtubeUrl,JSON.stringify(p.socialLinks),p.avatarUrl ?? null,p.avatarSourceProfile ?? null,p.avatarCheckedAt ?? null,JSON.stringify(research),owner.id]);
      if (!inserted.rows.length) continue;
      created++;
      await db.query(`INSERT INTO face_audit_log(actor_type,actor_id,action,target_type,target_id,after_state,request_id)
        VALUES ('system','profile-research-import','guest_profile.research_prepared','face_guest_profile',$1,$2::jsonb,'creator-intake-20261109')`,
      [p.slug,JSON.stringify({ requestedBy: owner.id, status: "pending", checkedAt: research.checkedAt, sources: research.sources, consentCreated: false, referencesCreated: false })]);
    }
    await db.query("COMMIT");
    return { mode: "applied", created, existingSkipped: entries.length - created };
  } catch (error) { await db.query("ROLLBACK"); throw error; }
}

async function main() {
  const [file, requester, flag] = process.argv.slice(2);
  if (!file || !requester || (flag && flag !== "--apply")) throw new Error("Usage: import-face-profile-research.mjs manifest.json requester-email [--apply]");
  const entries = parseResearchManifest(JSON.parse(readFileSync(resolve(file), "utf8")));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const url = new URL(process.env.DATABASE_URL);
  const local = ["127.0.0.1", "localhost"].includes(url.hostname);
  const db = new pg.Client({ host: url.hostname, port: Number(url.port || 5432), database: url.pathname.slice(1),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), connectionTimeoutMillis: 15_000,
    ssl: local ? false : { rejectUnauthorized: true, ca: [...rootCertificates,readFileSync(resolve(root,"workers/face-analyzer/supabase-root-2021.crt"),"utf8")] } });
  try { await db.connect(); console.log(JSON.stringify(await importResearch(db,entries,requester,flag === "--apply"))); }
  finally { await db.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof z.ZodError ? "Research manifest validation failed." : error.message); process.exitCode = 1; });
}
