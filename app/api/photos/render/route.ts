import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type SharpType from "sharp";

type SharpModule = typeof SharpType;

/**
 * Server-side photo renderer.
 *
 *   GET /api/photos/render?src=/members/marlon/foo.jpg&format=jpg
 *   GET /api/photos/render?src=/members/marlon/foo.jpg&format=png
 *   GET /api/photos/render?src=/members/marlon/foo.jpg&format=half
 *
 * Reads the source from /public, transcodes via Sharp, returns the bytes
 * with a download-friendly Content-Disposition. The /media download
 * column uses this for the JPG / PNG / 0.5x variants — no S3 round-trip
 * needed in dev / Phase-1.
 *
 * Phase 4 swaps to S3-stored renditions read from the
 * `media_asset_versions` table. The query shape stays the same so
 * callers don't change.
 */
export const runtime = "nodejs";

const PUBLIC = path.join(process.cwd(), "public");
const ALLOWED = new Set(["jpg", "png", "half"] as const);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const src = url.searchParams.get("src") ?? "";
  const format = (url.searchParams.get("format") ?? "") as
    | "jpg"
    | "png"
    | "half"
    | "";

  if (!src.startsWith("/") || src.includes("..")) {
    return NextResponse.json({ error: "invalid src" }, { status: 400 });
  }
  if (!ALLOWED.has(format as never)) {
    return NextResponse.json({ error: "invalid format" }, { status: 400 });
  }

  const abs = path.join(PUBLIC, src.replace(/^\//, ""));
  if (!existsSync(abs)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Lazy-load: keeps cold start fast on routes that don't render.
  let sharp: SharpModule;
  try {
    sharp = (await import("sharp")).default as unknown as SharpModule;
  } catch {
    // Sharp isn't installed (or its native binaries aren't present).
    // Fall back to streaming the source bytes — better than 500.
    const bytes = readFileSync(abs);
    const arr = new Uint8Array(bytes.byteLength);
    arr.set(bytes);
    return new NextResponse(arr, {
      headers: {
        "Content-Type": guessMime(abs),
        "Content-Disposition": `attachment; filename="${path.basename(abs)}"`,
      },
    });
  }

  const baseName = path.basename(abs, path.extname(abs));
  let pipeline = sharp(abs);

  if (format === "jpg") {
    pipeline = pipeline.jpeg({ quality: 86, mozjpeg: true });
  } else if (format === "png") {
    pipeline = pipeline.png({ compressionLevel: 9 });
  } else if (format === "half") {
    const meta = await pipeline.metadata();
    const w = meta.width ?? 1600;
    pipeline = pipeline.resize({ width: Math.round(w * 0.5) }).jpeg({ quality: 80, mozjpeg: true });
  }

  const buf = await pipeline.toBuffer();
  const ext = format === "png" ? "png" : "jpg";
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return new NextResponse(out, {
    headers: {
      "Content-Type": format === "png" ? "image/png" : "image/jpeg",
      "Content-Disposition": `attachment; filename="${baseName}-${format}.${ext}"`,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}

function guessMime(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".avif") return "image/avif";
  return "image/jpeg";
}
