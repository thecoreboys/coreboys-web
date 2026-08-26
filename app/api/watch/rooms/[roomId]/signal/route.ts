import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { postWatchRoomSignal } from "@/lib/watch-together/store";
import {
  jsonSize,
  PeerId,
  privateJson,
  requestHasSameOrigin,
  RoomId,
  watchRoomError,
} from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ roomId: string }> };

const SignalBody = z.object({
  peerId: PeerId,
  targetPeerId: PeerId.nullable().default(null),
  kind: z.enum(["offer", "answer", "ice", "bye"]),
  payload: z.unknown(),
}).strict();

export async function POST(request: Request, context: Context) {
  if (!requestHasSameOrigin(request)) return privateJson({ error: "invalid_origin" }, { status: 403 });
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized" }, { status: 401 });
  const roomIdResult = RoomId.safeParse((await context.params).roomId);
  if (!roomIdResult.success) return privateJson({ error: "invalid_room" }, { status: 400 });
  const parsed = SignalBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateJson({ error: "invalid_payload" }, { status: 400 });
  if (jsonSize(parsed.data.payload) > 64_000) {
    return privateJson({ error: "payload_too_large" }, { status: 413 });
  }

  try {
    const signalId = await postWatchRoomSignal({
      roomId: roomIdResult.data,
      userId,
      peerId: parsed.data.peerId,
      targetPeerId: parsed.data.targetPeerId,
      kind: parsed.data.kind,
      payload: parsed.data.payload,
    });
    return privateJson({ ok: true, signalId }, { status: 201 });
  } catch (error) {
    const response = watchRoomError(error);
    if (response) return response;
    console.error("watch room signaling failed", error);
    return privateJson({ error: "room_unavailable" }, { status: 503 });
  }
}
