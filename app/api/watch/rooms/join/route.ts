import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { joinWatchRoom, normalizeInviteCode } from "@/lib/watch-together/store";
import { PeerId, privateJson, requestHasSameOrigin, watchRoomError } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JoinBody = z.object({
  peerId: PeerId,
  inviteCode: z.string().min(8).max(24),
}).strict();

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request)) return privateJson({ error: "invalid_origin" }, { status: 403 });
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized" }, { status: 401 });
  const parsed = JoinBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateJson({ error: "invalid_payload" }, { status: 400 });
  const inviteCode = normalizeInviteCode(parsed.data.inviteCode);
  if (inviteCode.length !== 10) return privateJson({ error: "invalid_invite" }, { status: 400 });

  try {
    const room = await joinWatchRoom({ userId, peerId: parsed.data.peerId, inviteCode });
    return privateJson({ room });
  } catch (error) {
    const response = watchRoomError(error);
    if (response) return response;
    console.error("watch room join failed", error);
    return privateJson({ error: "room_unavailable" }, { status: 503 });
  }
}
