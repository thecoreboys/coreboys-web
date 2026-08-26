#!/usr/bin/env node

/**
 * Upload the large, gitignored media library to the configured S3-compatible
 * object store (Cloudflare R2 in production).
 *
 * Dry-run is the default. Pass --apply to perform writes.
 */

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicRoot = resolve(repoRoot, "public");
const apply = process.argv.includes("--apply");

const roots = [
  "members",
  "crew",
  "group",
  "comms",
  "brand",
  "house-reveal.mp4",
];

const mimeByExtension = new Map([
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webm", "video/webm"],
  [".webp", "image/webp"],
]);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function filesUnder(path) {
  const info = await stat(path);
  if (info.isFile()) return [{ path, size: info.size }];

  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => filesUnder(resolve(path, entry.name))),
  );
  return nested.flat();
}

function objectKey(path) {
  return relative(publicRoot, path).split(sep).join("/");
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

async function main() {
  const paths = (await Promise.all(roots.map((root) => filesUnder(resolve(publicRoot, root))))).flat();
  const bytes = paths.reduce((total, file) => total + file.size, 0);

  console.log(`${apply ? "Uploading" : "Dry run:"} ${paths.length} files (${(bytes / 1024 / 1024).toFixed(1)} MiB)`);
  if (!apply) {
    console.log("No remote changes made. Re-run with --apply after approval.");
    return;
  }

  const client = new S3Client({
    region: required("SPACES_REGION"),
    endpoint: required("SPACES_ENDPOINT"),
    forcePathStyle: false,
    credentials: {
      accessKeyId: required("SPACES_KEY"),
      secretAccessKey: required("SPACES_SECRET"),
    },
  });
  const bucket = required("SPACES_BUCKET");

  await mapLimit(paths, 4, async (file, index) => {
    const key = objectKey(file.path);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(file.path),
        ContentLength: file.size,
        ContentType: mimeByExtension.get(extname(file.path).toLowerCase()) || "application/octet-stream",
        CacheControl: "public, max-age=86400, stale-while-revalidate=604800",
      }),
    );
    console.log(`[${index + 1}/${paths.length}] ${key}`);
  });

  console.log("Upload complete.");
}

await main();
