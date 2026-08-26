#!/usr/bin/env node
// Copies the workspace's /assets folder into /public so next/image and the
// hero <video> can find them. This is a dev-time helper — production builds
// should push these to a CDN and update paths.
//
// Usage: pnpm sync-assets

import { cp, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const workspaceAssets = resolve(repoRoot, "../../assets");
const publicDir = resolve(repoRoot, "public");

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function safeCopy(from, to) {
  if (!existsSync(from)) {
    console.warn(`skip: ${from} (not present)`);
    return;
  }
  const s = await stat(from);
  await ensureDir(s.isDirectory() ? to : dirname(to));
  await cp(from, to, { recursive: true, force: true });
  console.log(`copied: ${from} → ${to}`);
}

const memberFolders = {
  marlon: "marlon",
  ron: "ron",
  adapt: "adapt",
  jason: "jason",
  lacy: "lacy",
  silky: "silky",
};

// Crew slug → folder name in /assets. The folder name doesn't always match
// the canonical slug (e.g. crew slug "drew-wall" lives in /assets/drew).
const crewFolders = {
  rocket: "rocket",
  "drew-wall": "drew",
  laiys: "laiys",
  gilbert: "gilbert",
  lazer: "lazer",
  "john-ngo": "john",
  wojito: "wojito",
  said: "said",
  bepsy: "bepsy",
  sixty: "sixty",
};

// Comm logo files in /assets are named `{twitchLogin}_comm.png`. We expose
// them under /public/comms/{slug}.png so member pages can <Image src=…>
// them by slug without thinking about Twitch handles.
const commLogos = {
  marlon: "marlon_comm.png",
  ron: "stableronaldo_comm.png",
  adapt: "adapt_comm.png",
  jason: "jasontheween_comm.png",
  lacy: "lacy_comm.png",
  silky: "silky_comm.png",
};

async function main() {
  if (!existsSync(workspaceAssets)) {
    console.error(`No /assets folder found at ${workspaceAssets}`);
    process.exit(1);
  }

  await ensureDir(resolve(publicDir, "members"));
  await ensureDir(resolve(publicDir, "group"));
  await ensureDir(resolve(publicDir, "comms"));
  await ensureDir(resolve(publicDir, "crew"));

  for (const [slug, folder] of Object.entries(memberFolders)) {
    await safeCopy(
      resolve(workspaceAssets, folder),
      resolve(publicDir, "members", slug),
    );
  }

  for (const [slug, folder] of Object.entries(crewFolders)) {
    await safeCopy(
      resolve(workspaceAssets, folder),
      resolve(publicDir, "crew", slug),
    );
  }

  for (const [slug, file] of Object.entries(commLogos)) {
    await safeCopy(
      resolve(workspaceAssets, file),
      resolve(publicDir, "comms", `${slug}.png`),
    );
  }

  await safeCopy(
    resolve(workspaceAssets, "group-photos"),
    resolve(publicDir, "group"),
  );
  await safeCopy(
    resolve(workspaceAssets, "thecoreboys-group-photo.jpg"),
    resolve(publicDir, "group", "thecoreboys.jpg"),
  );
  await safeCopy(
    resolve(workspaceAssets, "house-reveal.mp4"),
    resolve(publicDir, "house-reveal.mp4"),
  );

  console.log("\nAssets synced. Remember the video is large (~110MB) and is gitignored.");
}

await main();
