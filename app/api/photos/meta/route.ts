import { NextResponse } from "next/server";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import exifr from "exifr";
import sharp from "sharp";

/**
 * Photo metadata lookup for the client-side lightbox on member / crew
 * pages. Returns the same `PhotoMetaLite` shape `MediaGallery` uses on
 * `/media`, so the modal layout is consistent across the site.
 *
 *   GET /api/photos/meta?src=/members/marlon/foo.jpg
 */
export const runtime = "nodejs";

const PUBLIC = path.join(process.cwd(), "public");

export async function GET(req: Request) {
  const url = new URL(req.url);
  const src = url.searchParams.get("src") ?? "";
  if (!src.startsWith("/") || src.includes("..")) {
    return NextResponse.json({ error: "invalid src" }, { status: 400 });
  }
  const abs = path.join(PUBLIC, src.replace(/^\//, ""));
  if (!existsSync(abs)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let size = 0;
  let fileModified: string | undefined;
  try {
    const s = statSync(abs);
    size = s.size;
    fileModified = new Date(s.mtimeMs).toISOString();
  } catch {
    /* ignore */
  }

  let exif: Record<string, unknown> | null = null;
  try {
    exif = (await exifr.parse(abs, {
      tiff: true,
      exif: true,
      gps: true,
      pick: [
        "DateTimeOriginal",
        "CreateDate",
        "ImageWidth",
        "ImageHeight",
        "ExifImageWidth",
        "ExifImageHeight",
        "Make",
        "Model",
        "LensModel",
        "ISO",
        "FNumber",
        "ExposureTime",
        "FocalLength",
        "latitude",
        "longitude",
      ],
    })) as Record<string, unknown> | null;
  } catch {
    exif = null;
  }

  let width =
    (exif?.ImageWidth as number | undefined) ??
    (exif?.ExifImageWidth as number | undefined);
  let height =
    (exif?.ImageHeight as number | undefined) ??
    (exif?.ExifImageHeight as number | undefined);
  if (!width || !height) {
    try {
      const meta = await sharp(abs).metadata();
      if (meta.width && meta.height) {
        width = meta.width;
        height = meta.height;
      }
    } catch {
      /* ignore */
    }
  }

  const takenAtRaw = exif?.DateTimeOriginal ?? exif?.CreateDate ?? null;
  const takenAt =
    takenAtRaw instanceof Date
      ? takenAtRaw.toISOString()
      : typeof takenAtRaw === "string"
        ? takenAtRaw
        : fileModified;

  const exposureTimeRaw = exif?.ExposureTime as number | undefined;
  const exposureTime =
    typeof exposureTimeRaw === "number"
      ? exposureTimeRaw >= 1
        ? `${exposureTimeRaw.toFixed(1)}s`
        : `1/${Math.round(1 / exposureTimeRaw)}s`
      : undefined;

  const make = exif?.Make as string | undefined;
  const model = exif?.Model as string | undefined;
  const camera = [make, model].filter(Boolean).join(" ").trim() || undefined;

  const lat = exif?.latitude as number | undefined;
  const lng = exif?.longitude as number | undefined;
  const gps =
    typeof lat === "number" && typeof lng === "number"
      ? { latitude: lat, longitude: lng }
      : undefined;

  return NextResponse.json({
    src,
    size,
    takenAt,
    width,
    height,
    camera,
    lens: exif?.LensModel as string | undefined,
    iso: exif?.ISO as number | undefined,
    fNumber: exif?.FNumber as number | undefined,
    exposureTime,
    focalLength: exif?.FocalLength as number | undefined,
    gps,
  });
}
