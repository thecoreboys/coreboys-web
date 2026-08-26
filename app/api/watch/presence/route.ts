import { FaceWatchContentIdSchema } from "@/lib/face-recognition-contracts";
import { facePublicJson } from "@/lib/face-recognition-http";
import {
  facePresencePublicIsEnabled,
  parseFacePresenceAtMs,
} from "@/lib/face-recognition-policy";
import { getPublicFacePresence } from "@/lib/face-recognition-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const contentId = FaceWatchContentIdSchema.safeParse(url.searchParams.get("contentId"));
  const atMs = parseFacePresenceAtMs(url.searchParams.get("atMs"));
  if (!contentId.success || atMs === undefined) {
    return facePublicJson({ error: "invalid presence query" }, 400);
  }
  if (!facePresencePublicIsEnabled()) {
    return facePublicJson({ contentId: contentId.data, atMs, tags: [] });
  }
  return facePublicJson(await getPublicFacePresence(contentId.data, atMs));
}
