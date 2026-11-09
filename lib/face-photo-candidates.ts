import { z } from "zod";
import { FaceCanonicalKeySchema } from "./face-people";

/** Source links are navigation only; the app never fetches these URLs. */
export function safeFacePhotoSource(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("https://") || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.port) return null;
    const path = url.pathname.split("/").map((part) => encodeURIComponent(decodeURIComponent(part))).join("/");
    const search = Array.from(url.searchParams, ([key, entry]) => `${encodeURIComponent(key)}=${encodeURIComponent(entry)}`).join("&");
    return "https://" + encodeURIComponent(url.hostname) + path + (search ? "?" + search : "");
  } catch { return null; }
}

export const FacePhotoCandidateSchema = z.object({
  id: z.string().uuid(),
  canonicalKey: FaceCanonicalKeySchema,
  sourceUrl: z.string().refine((value) => safeFacePhotoSource(value) !== null),
  sourceLabel: z.string().min(1).max(240),
  researchNote: z.string().max(1500),
  checkedAt: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  status: z.enum(["pending", "submitted", "dismissed"]),
  previewUrl: z.string().regex(/^\/api\/admin\/faces\/photo-candidates\/[0-9a-f-]{36}\/image$/),
  referenceId: z.string().uuid().nullable(),
});
export type FacePhotoCandidate = z.infer<typeof FacePhotoCandidateSchema>;

export const FacePhotoCandidateActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("submit"),
    identityId: z.string().uuid(),
    subjectApproved: z.literal(true),
    rightsConfirmed: z.literal(true),
    note: z.string().trim().min(3).max(500),
  }).strict(),
  z.object({ action: z.literal("dismiss"), reason: z.string().trim().min(3).max(500) }).strict(),
]);
