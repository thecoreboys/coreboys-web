import "server-only";
import { readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import exifr from "exifr";
import sharp from "sharp";

/**
 * Reads the synced asset folders under /public and exposes ordered photo
 * lists per slug, plus EXIF + filesystem metadata. Designed to be called
 * from server components.
 *
 * In production this gets replaced by the `coreboys-api` `/v1/media`
 * endpoint backed by Postgres + S3 — the shape of `PhotoMeta` matches
 * the `MediaAsset` table 1:1 so the swap is mechanical.
 */

const PUBLIC = path.join(process.cwd(), "public");
const IMAGE_RE = /\.(jpe?g|png|webp|avif)$/i;

export type PhotoMeta = {
  src: string;
  /** Bytes on disk. */
  size: number;
  /** Filesystem mtime (ISO). Falls back here when EXIF DateTimeOriginal is absent. */
  fileModified: string;
  /** Best-known capture timestamp (EXIF DateTimeOriginal or fileModified). */
  takenAt: string;
  width?: number;
  height?: number;
  camera?: string;
  lens?: string;
  iso?: number;
  fNumber?: number;
  exposureTime?: string;
  focalLength?: number;
  /** {lat, lng} when GPS is in EXIF. */
  gps?: { latitude: number; longitude: number };
  /** Approximate place name (server can resolve via reverse geocoding). */
  place?: string;
};

function listImages(absDir: string, urlPrefix: string): string[] {
  if (!existsSync(absDir)) return [];
  return readdirSync(absDir)
    .filter((f) => IMAGE_RE.test(f))
    .map((f) => `${urlPrefix}/${f}`);
}

async function readPhotoMeta(urlPath: string): Promise<PhotoMeta> {
  const abs = path.join(PUBLIC, urlPath.replace(/^\//, ""));
  let size = 0;
  let fileModified = new Date().toISOString();
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

  const takenAtRaw =
    exif?.DateTimeOriginal ?? exif?.CreateDate ?? null;
  const takenAt =
    takenAtRaw instanceof Date
      ? takenAtRaw.toISOString()
      : typeof takenAtRaw === "string"
        ? takenAtRaw
        : fileModified;

  let width =
    (exif?.ImageWidth as number | undefined) ??
    (exif?.ExifImageWidth as number | undefined);
  let height =
    (exif?.ImageHeight as number | undefined) ??
    (exif?.ExifImageHeight as number | undefined);

  // Many uploaded photos (Instagram exports etc.) ship without EXIF
  // dimension tags. Fall back to reading the actual image dimensions via
  // sharp so the metadata sidebar always has resolution.
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

  const make = exif?.Make as string | undefined;
  const model = exif?.Model as string | undefined;
  const camera = [make, model].filter(Boolean).join(" ").trim() || undefined;

  const exposureTimeRaw = exif?.ExposureTime as number | undefined;
  const exposureTime =
    typeof exposureTimeRaw === "number"
      ? exposureTimeRaw >= 1
        ? `${exposureTimeRaw.toFixed(1)}s`
        : `1/${Math.round(1 / exposureTimeRaw)}s`
      : undefined;

  const lat = exif?.latitude as number | undefined;
  const lng = exif?.longitude as number | undefined;
  const gps =
    typeof lat === "number" && typeof lng === "number"
      ? { latitude: lat, longitude: lng }
      : undefined;

  return {
    src: urlPath,
    size,
    fileModified,
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
  };
}

const memberPhotos = new Map<string, string[]>();
const crewPhotos = new Map<string, string[]>();
let groupPhotos: string[] | null = null;

const photoMetaCache = new Map<string, PhotoMeta>();
async function getMeta(src: string): Promise<PhotoMeta> {
  const cached = photoMetaCache.get(src);
  if (cached) return cached;
  const meta = await readPhotoMeta(src);
  photoMetaCache.set(src, meta);
  return meta;
}

export async function readPhotoMetadata(srcs: readonly string[]): Promise<PhotoMeta[]> {
  return Promise.all(srcs.map(getMeta));
}

/** Sort by `takenAt` desc — newest first. */
export function sortNewestFirst(metas: readonly PhotoMeta[]): PhotoMeta[] {
  return [...metas].sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1));
}

export function getMemberPhotos(slug: string): string[] {
  const cached = memberPhotos.get(slug);
  if (cached) return cached;
  const list = listImages(path.join(PUBLIC, "members", slug), `/members/${slug}`);
  memberPhotos.set(slug, list);
  return list;
}

export function getMemberPortrait(slug: string): string | null {
  const photos = getMemberPhotos(slug);
  return photos[0] ?? null;
}

export function getCrewPhotos(slug: string): string[] {
  const cached = crewPhotos.get(slug);
  if (cached) return cached;
  const list = listImages(path.join(PUBLIC, "crew", slug), `/crew/${slug}`);
  crewPhotos.set(slug, list);
  return list;
}

export function getCrewPortrait(slug: string): string | null {
  const photos = getCrewPhotos(slug);
  return photos[0] ?? null;
}

export function getGroupPhotos(): string[] {
  if (groupPhotos) return groupPhotos;
  groupPhotos = listImages(path.join(PUBLIC, "group"), "/group");
  return groupPhotos;
}

export function getHeroGroupPhoto(): string {
  const explicit = "/group/thecoreboys.jpg";
  if (existsSync(path.join(PUBLIC, "group", "thecoreboys.jpg"))) return explicit;
  const all = getGroupPhotos();
  return all[0] ?? explicit;
}
