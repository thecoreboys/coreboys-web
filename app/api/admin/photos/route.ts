import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import exifr from "exifr";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-api";
import { uploadToSpaces } from "@/lib/spaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Photos — backs the admin Photos tool. POST is multipart/form-data:
 *  upload, EXIF parse, persist to media_assets. GET lists every asset. */

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
]);

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const r = await query<{
    id: string; cdn_url: string; mime: string;
    width: number | null; height: number | null;
    taken_at: string | null;
    camera_make: string | null; camera_model: string | null;
    created_at: string; size_bytes: string;
    member_refs: string[];
  }>(
    `SELECT id::text, cdn_url, mime, width, height,
            taken_at::text, camera_make, camera_model,
            created_at::text, size_bytes::text,
            COALESCE(
              ARRAY(
                SELECT DISTINCT tag.person_id
                  FROM media_face_tags tag
                 WHERE tag.asset_id = media_assets.id
                   AND tag.person_kind = 'member'
              ),
              ARRAY[]::text[]
            ) AS member_refs
       FROM media_assets
     ORDER BY COALESCE(taken_at, created_at) DESC
     LIMIT 500`,
  );
  return NextResponse.json({ photos: r.rows });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing 'file' field" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: `unsupported mime ${file.type}` },
      { status: 400 },
    );
  }
  const altText = (form.get("altText") as string | null)?.trim() || null;

  // Read once for both EXIF parse + Spaces upload.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const id = randomUUID();
  const key = `media/${id}.${ext}`;

  // EXIF — best effort. Many phone uploads strip metadata.
  let exif: {
    DateTimeOriginal?: Date | string;
    Make?: string;
    Model?: string;
    LensModel?: string;
    ISO?: number;
    FNumber?: number;
    ExposureTime?: number;
    FocalLength?: number;
    GPSLatitude?: number;
    GPSLongitude?: number;
    ExifImageWidth?: number;
    ExifImageHeight?: number;
  } = {};
  try {
    exif = (await exifr.parse(bytes)) ?? {};
  } catch {
    /* ignore */
  }

  let upload: { cdnUrl: string; key: string };
  try {
    upload = await uploadToSpaces({
      key,
      body: bytes,
      contentType: file.type,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "upload failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  const takenAt =
    exif.DateTimeOriginal instanceof Date
      ? exif.DateTimeOriginal.toISOString()
      : typeof exif.DateTimeOriginal === "string"
        ? exif.DateTimeOriginal
        : null;
  const exposureSec =
    typeof exif.ExposureTime === "number" ? `1/${Math.round(1 / exif.ExposureTime)}` : null;

  await query(
    `INSERT INTO media_assets
        (id, s3_key, cdn_url, mime, size_bytes, width, height,
         taken_at, camera_make, camera_model, lens_model, iso,
         f_number, exposure_time, focal_length, gps_latitude,
         gps_longitude, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'admin-upload')`,
    [
      id,
      upload.key,
      upload.cdnUrl,
      file.type,
      file.size,
      exif.ExifImageWidth ?? null,
      exif.ExifImageHeight ?? null,
      takenAt,
      exif.Make ?? null,
      exif.Model ?? null,
      exif.LensModel ?? null,
      exif.ISO ?? null,
      exif.FNumber ?? null,
      exposureSec,
      exif.FocalLength ?? null,
      exif.GPSLatitude ?? null,
      exif.GPSLongitude ?? null,
    ],
  );

  // alt_text would land in media_descriptions but that table requires a
  // generated_by enum we don't want to guess. We store the asset core
  // here; descriptions / credits / tags get added via separate routes.
  void altText;

  return NextResponse.json({
    id,
    cdnUrl: upload.cdnUrl,
    width: exif.ExifImageWidth ?? null,
    height: exif.ExifImageHeight ?? null,
  }, { status: 201 });
}
