import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { requireAccountEntitlement } from "@/lib/subscriptions/entitlements";
import { createWatchRoom } from "@/lib/watch-together/store";
import { normalizeWatchRoomState } from "@/lib/watch-together/types";
import {
  jsonSize,
  PeerId,
  privateJson,
  requestHasSameOrigin,
  requestHostname,
  RoomTitle,
  watchRoomError,
} from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateBody = z.object({
  peerId: PeerId,
  title: RoomTitle,
  state: z.unknown(),
}).strict();

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request)) return privateJson({ error: "invalid_origin" }, { status: 403 });
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized" }, { status: 401 });
  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateJson({ error: "invalid_payload" }, { status: 400 });
  if (jsonSize(parsed.data.state) > 150_000) {
    return privateJson({ error: "payload_too_large" }, { status: 413 });
  }

  try {
    await requireAccountEntitlement({
      userId,
      requestHostname: requestHostname(request),
      featureId: "rooms.private",
    });
    const created = await createWatchRoom({
      userId,
      peerId: parsed.data.peerId,
      title: parsed.data.title,
      state: normalizeWatchRoomState(parsed.data.state),
    });
    return privateJson({ inviteCode: created.inviteCode, room: created.snapshot }, { status: 201 });
  } catch (error) {
    const response = watchRoomError(error);
    if (response) return response;
    console.error("watch room creation failed", error);
    return privateJson({ error: "room_unavailable" }, { status: 503 });
  }
}
