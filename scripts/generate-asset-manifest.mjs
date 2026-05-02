#!/usr/bin/env node
// Walks /public/{members,crew,group} and writes a static manifest of
// every photo so the deployed site (where /public/* is empty because
// those folders are gitignored) can still enumerate what's available
// via the Spaces CDN. Asset-index reads this at module load.
//
// Usage: pnpm node scripts/generate-asset-manifest.mjs

import { readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const publicDir = join(repoRoot, "public");
const out = join(repoRoot, "lib", "asset-manifest.json");

const IMAGE_RE = /\.(jpe?g|png|webp|avif)$/i;

async function listImages(dir) {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const files = [];
  for (const e of entries) {
    const full = join(dir, e);
    const s = await stat(full);
    if (s.isFile() && IMAGE_RE.test(e)) files.push(e);
  }
  return files.sort();
}

async function listSlugs(dir) {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const slugs = [];
  for (const e of entries) {
    const full = join(dir, e);
    const s = await stat(full);
    if (s.isDirectory()) slugs.push(e);
  }
  return slugs.sort();
}

async function main() {
  const manifest = { members: {}, crew: {}, group: [] };

  const memberSlugs = await listSlugs(join(publicDir, "members"));
  for (const slug of memberSlugs) {
    const files = await listImages(join(publicDir, "members", slug));
    manifest.members[slug] = files.map((f) => `/members/${slug}/${f}`);
  }

  const crewSlugs = await listSlugs(join(publicDir, "crew"));
  for (const slug of crewSlugs) {
    const files = await listImages(join(publicDir, "crew", slug));
    manifest.crew[slug] = files.map((f) => `/crew/${slug}/${f}`);
  }

  const groupFiles = await listImages(join(publicDir, "group"));
  manifest.group = groupFiles.map((f) => `/group/${f}`);

  await writeFile(out, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  const counts = {
    members: Object.values(manifest.members).reduce((n, a) => n + a.length, 0),
    crew: Object.values(manifest.crew).reduce((n, a) => n + a.length, 0),
    group: manifest.group.length,
  };
  console.log(
    `wrote ${out}\n  members: ${counts.members}, crew: ${counts.crew}, group: ${counts.group}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
