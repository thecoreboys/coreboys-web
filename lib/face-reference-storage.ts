import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { FACE_REFERENCE_MAX_BYTES } from "@/lib/face-recognition-policy";

export class FaceReferenceStorageError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "FaceReferenceStorageError";
  }
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function storageRoot(): string {
  const configured = process.env.FACE_REFERENCE_STORAGE_DIR?.trim();
  if (!configured || !path.isAbsolute(configured)) {
    throw new FaceReferenceStorageError(
      "Protected face-reference storage is not configured with an absolute path.",
      503,
    );
  }
  const resolved = path.resolve(configured);
  const publicDir = path.resolve(process.cwd(), "public");
  if (isInside(publicDir.toLowerCase(), resolved.toLowerCase())) {
    throw new FaceReferenceStorageError(
      "Face-reference storage must be outside the public directory.",
      503,
    );
  }
  return resolved;
}

function safeOriginalName(value: string): string {
  const name = path.basename(value).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (name || "reference-image").slice(0, 240);
}

function targetForKey(key: string): { root: string; target: string } {
  if (!/^[0-9a-f-]{36}\.webp$/.test(key)) {
    throw new FaceReferenceStorageError("Stored reference key is invalid.", 500);
  }
  const root = storageRoot();
  const target = path.resolve(root, key);
  if (!isInside(root.toLowerCase(), target.toLowerCase())) {
    throw new FaceReferenceStorageError("Stored reference path escaped its protected root.", 500);
  }
  return { root, target };
}

export async function storeFaceReferenceFile(file: File) {
  if (!file || file.size <= 0 || file.size > FACE_REFERENCE_MAX_BYTES) {
    throw new FaceReferenceStorageError("Reference image must be between 1 byte and 15 MB.");
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new FaceReferenceStorageError("Reference image must be JPEG, PNG, or WebP.");
  }
  const source = Buffer.from(await file.arrayBuffer());
  let normalized: Buffer;
  let width: number;
  let height: number;
  try {
    const output = await sharp(source, { failOn: "warning" })
      .rotate()
      .resize({
        width: 2048,
        height: 2048,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 92 })
      .toBuffer({ resolveWithObject: true });
    normalized = output.data;
    width = output.info.width;
    height = output.info.height;
  } catch {
    throw new FaceReferenceStorageError("The uploaded file is not a valid supported image.");
  }
  if (width < 64 || height < 64) {
    throw new FaceReferenceStorageError("Reference images must be at least 64×64 pixels.");
  }
  const key = `${randomUUID()}.webp`;
  const { root, target } = targetForKey(key);
  await mkdir(root, { recursive: true });
  await writeFile(target, normalized, { flag: "wx", mode: 0o600 });
  return {
    storageKey: key,
    fileName: safeOriginalName(file.name),
    contentSha256: createHash("sha256").update(normalized).digest("hex"),
    contentType: "image/webp" as const,
    byteSize: normalized.byteLength,
    width,
    height,
  };
}

export async function deleteFaceReferenceFile(key: string): Promise<void> {
  const { target } = targetForKey(key);
  try {
    await unlink(target);
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }
}

export async function readFaceReferenceFile(key: string): Promise<Buffer> {
  const { target } = targetForKey(key);
  try {
    return await readFile(target);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new FaceReferenceStorageError("Protected reference image was not found.", 404);
    }
    throw error;
  }
}
