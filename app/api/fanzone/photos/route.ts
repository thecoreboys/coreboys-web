import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import {
  ensureFanzoneSchema,
  hashReceiptToken,
  listApprovedFanPhotos,
  type FanPhotoKind,
} from "@/lib/fanzone";
import { deletePrivateFanPhoto, putPrivateFanPhoto } from "@/lib/fanzone-storage";
import { MEMBERS } from "@/lib/members";
import { moderateTextLocal } from "@/lib/moderation";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SOURCE_BYTES = 6 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_SOURCE_BYTES + 128 * 1024;
const MEMBER_SLUGS = new Set(MEMBERS.map((member) => member.slug));
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

const Fields = z.object({
  submitterFirstName: z.string().trim().min(1).max(40),
  submitterLastName: z.string().trim().min(1).max(60),
  submitterEmail: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  caption: z.string().trim().max(180).optional().default(""),
  story: z.string().trim().max(900).optional().default(""),
  eventName: z.string().trim().max(80).optional().default(""),
  happenedOn: z.string().trim().max(10).optional().default(""),
  locationLabel: z.string().trim().max(80).optional().default(""),
  photographerCredit: z.string().trim().max(80).optional().default(""),
  kind: z.enum(["photo", "art"]).default("photo"),
  rotation: z.coerce.number().int().refine((value) => [0, 90, 180, 270].includes(value)),
  consent: z.literal("true"),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kindValue = url.searchParams.get("kind");
  const kind: FanPhotoKind | null = kindValue === "photo" || kindValue === "art" ? kindValue : null;
  const member = cleanFilter(url.searchParams.get("member"), 64);
  const event = cleanFilter(url.searchParams.get("event"), 80);
  const sortValue = url.searchParams.get("sort");
  const sort = sortValue === "newest" || sortValue === "loved" ? sortValue : "featured";
  const userId = await getCurrentFanUserId();
  const photos = await listApprovedFanPhotos(userId, { kind, member, event, sort });
  const eventRows = await query<{ event_name: string }>(
    `SELECT DISTINCT event_name FROM fan_submissions
      WHERE status = 'approved' AND event_name IS NOT NULL AND event_name <> ''
      ORDER BY event_name ASC LIMIT 80`,
  );
  const events = eventRows.rows.map((row) => row.event_name);
  return NextResponse.json(
    { photos, facets: { events }, signedIn: Boolean(userId) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(req: Request) {
  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Photo is larger than 6 MB." }, { status: 413 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected a photo upload." }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a photo first." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_SOURCE_BYTES) {
    return NextResponse.json({ error: "Photo must be between 1 byte and 6 MB." }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: "Use a JPG, PNG, WEBP, or AVIF image." }, { status: 400 });
  }

  const rawMembers = form.get("memberSlugs");
  const memberSlugs = String(rawMembers ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value, index, values) => MEMBER_SLUGS.has(value) && values.indexOf(value) === index)
    .slice(0, MEMBERS.length);
  if (memberSlugs.length === 0) {
    return NextResponse.json({ error: "Choose at least one CORE member." }, { status: 400 });
  }

  let fields: z.infer<typeof Fields>;
  try {
    fields = Fields.parse({
      submitterFirstName: form.get("submitterFirstName"),
      submitterLastName: form.get("submitterLastName"),
      submitterEmail: form.get("submitterEmail"),
      caption: form.get("caption") ?? "",
      story: form.get("story") ?? "",
      eventName: form.get("eventName") ?? "",
      happenedOn: form.get("happenedOn") ?? "",
      locationLabel: form.get("locationLabel") ?? "",
      photographerCredit: form.get("photographerCredit") ?? "",
      kind: form.get("kind") ?? "photo",
      rotation: form.get("rotation") ?? "0",
      consent: form.get("consent"),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Check the required details and try again.", detail: error instanceof Error ? error.message : undefined },
      { status: 400 },
    );
  }

  if (fields.happenedOn) {
    const happened = new Date(`${fields.happenedOn}T12:00:00Z`);
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    if (Number.isNaN(happened.getTime()) || happened.getTime() > tomorrow) {
      return NextResponse.json({ error: "Use a valid date that is not in the future." }, { status: 400 });
    }
  }

  const textForReview = [fields.caption, fields.story, fields.eventName, fields.locationLabel]
    .filter(Boolean)
    .join("\n");
  if (textForReview) {
    const moderation = moderateTextLocal(textForReview);
    if (!moderation.ok) {
      return NextResponse.json({ error: moderation.reason ?? "Please revise the written details." }, { status: 400 });
    }
  }

  await ensureFanzoneSchema();
  const userId = await getCurrentFanUserId();
  const recent = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM fan_submissions
      WHERE created_at > now() - interval '24 hours'
        AND (lower(submitter_email) = $1 OR ($2::text IS NOT NULL AND user_id = $2))`,
    [fields.submitterEmail, userId],
  );
  if (Number(recent.rows[0]?.count ?? 0) >= 8) {
    return NextResponse.json(
      { error: "You have reached today’s submission limit. Try again tomorrow." },
      { status: 429 },
    );
  }

  let fullBytes: Buffer;
  let thumbBytes: Buffer;
  let width: number;
  let height: number;
  try {
    const source = new Uint8Array(await file.arrayBuffer());
    const normalized = await sharp(source, { failOn: "error", limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .toBuffer();
    let image = sharp(normalized, { failOn: "error", limitInputPixels: 40_000_000 });
    if (fields.rotation) image = image.rotate(fields.rotation);
    fullBytes = await image
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86, effort: 4 })
      .toBuffer();
    const metadata = await sharp(fullBytes).metadata();
    width = metadata.width ?? 0;
    height = metadata.height ?? 0;
    if (!width || !height) throw new Error("No image dimensions.");
    thumbBytes = await sharp(fullBytes)
      .resize({ width: 900, height: 1100, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 })
      .toBuffer();
  } catch {
    return NextResponse.json(
      { error: "We couldn’t read that image. Export it as JPG, PNG, WEBP, or AVIF and try again." },
      { status: 400 },
    );
  }

  const imageHash = createHash("sha256").update(fullBytes).digest("hex");
  const duplicate = await query(
    `SELECT 1 FROM fan_submissions
      WHERE image_sha256 = $1 AND status <> 'denied'
        AND created_at > now() - interval '180 days'
      LIMIT 1`,
    [imageHash],
  );
  if (duplicate.rows.length > 0) {
    return NextResponse.json({ error: "That exact image is already in review or on the wall." }, { status: 409 });
  }

  const id = randomUUID();
  const storageKey = `fanzone/pending/${id}.webp`;
  const thumbStorageKey = `fanzone/pending/${id}-thumb.webp`;
  const receiptToken = randomBytes(24).toString("base64url");
  try {
    const uploads = await Promise.allSettled([
      putPrivateFanPhoto(storageKey, fullBytes, "image/webp"),
      putPrivateFanPhoto(thumbStorageKey, thumbBytes, "image/webp"),
    ]);
    if (uploads.some((upload) => upload.status === "rejected")) {
      throw new Error("One or more stored image variants failed.");
    }
    await query(
      `INSERT INTO fan_submissions (
         id, file_url, thumb_url, storage_key, thumb_storage_key,
         mime, size_bytes, width, height, caption, story, submission_kind,
         submitter_first_name, submitter_last_name, submitter_email, user_id,
         member_slugs, event_name, happened_on, location_label,
         photographer_credit, image_sha256, receipt_token_hash,
         consent_version, moderation_status
       ) VALUES (
         $1, $2, $3, $4, $5, 'image/webp', $6, $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
         '2026-08-20', 'unreviewed'
       )`,
      [
        id,
        `/api/fanzone/photos/${id}/image`,
        `/api/fanzone/photos/${id}/image?size=thumb`,
        storageKey,
        thumbStorageKey,
        fullBytes.byteLength,
        width,
        height,
        fields.caption || null,
        fields.story || null,
        fields.kind,
        fields.submitterFirstName,
        fields.submitterLastName,
        fields.submitterEmail,
        userId,
        memberSlugs,
        fields.eventName || null,
        fields.happenedOn || null,
        fields.locationLabel || null,
        fields.photographerCredit || null,
        imageHash,
        hashReceiptToken(receiptToken),
      ],
    );
  } catch (error) {
    await Promise.allSettled([
      deletePrivateFanPhoto(storageKey),
      deletePrivateFanPhoto(thumbStorageKey),
    ]);
    return NextResponse.json(
      { error: "Upload is temporarily unavailable.", detail: process.env.NODE_ENV === "development" && error instanceof Error ? error.message : undefined },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { id, receiptToken, status: "pending", submittedAt: new Date().toISOString() },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

function cleanFilter(value: string | null, max: number): string | null {
  const clean = value?.trim().slice(0, max) ?? "";
  return clean || null;
}
