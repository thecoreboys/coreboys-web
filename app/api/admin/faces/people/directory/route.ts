import { requireAdmin } from "@/lib/admin-api";
import { CreatorInput } from "@/lib/creator-tags/model";
import { creatorDirectory } from "@/lib/creator-tags/store";
import { FaceGuestProfileSchema } from "@/lib/face-people";
import { facePrivateJson, facePrivateResponse, faceRequestId, faceStoreErrorResponse } from "@/lib/face-recognition-http";
import { listFaceGuestProfiles, saveFaceGuestProfile } from "@/lib/face-recognition-store";
import { MEMBERS, CREW } from "@/lib/members";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const rosterIds = new Set([...MEMBERS, ...CREW].map((person) => person.slug));

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const creators = (await creatorDirectory()).filter((person) => person.active && !rosterIds.has(person.id));
  return facePrivateJson({ creators: creators.map(({ id, name }) => ({ id, name })) });
}

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request)) return facePrivateJson({ error: "invalid origin" }, 403);
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const body = await request.json().catch(() => null);
  const parsed = CreatorInput.shape.id.safeParse(body?.creatorId);
  if (!parsed.success || rosterIds.has(parsed.data)) return facePrivateJson({ error: "Choose a saved guest creator. CORE members and crew already have profiles here." }, 400);
  const creator = (await creatorDirectory()).find((person) => person.id === parsed.data && person.active);
  if (!creator) return facePrivateJson({ error: "That creator is unavailable in the saved directory." }, 404);
  const twitch = creator.socials.find((link) => link.platform === "twitch");
  const profile = FaceGuestProfileSchema.safeParse({
    slug: creator.id, displayName: creator.name,
    twitchLogin: twitch ? new URL(twitch.url).pathname.replace(/^\/|\/$/g, "") : null,
    youtubeUrl: creator.socials.find((link) => link.platform === "youtube")?.url ?? null,
    socialLinks: creator.socials,
    avatarUrl: creator.avatarUrl,
    avatarSourceProfile: creator.avatarSourceProfile,
    avatarCheckedAt: creator.avatarCheckedAt,
  });
  if (!profile.success) return facePrivateJson({ error: "Update this creator's profile details before importing." }, 422);
  try {
    const existing = (await listFaceGuestProfiles()).some((person) => person.slug === profile.data.slug);
    const person = await saveFaceGuestProfile(profile.data, existing ? "update" : "create", { actor: auth, requestId: faceRequestId(request) });
    return facePrivateJson({ person }, existing ? 200 : 201);
  } catch (error) {
    return faceStoreErrorResponse(error);
  }
}
