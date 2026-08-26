import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { requireAccountEntitlement } from "@/lib/subscriptions/entitlements";
import {
  getWatchRoom,
  leaveWatchRoom,
  updateWatchRoomState,
} from "@/lib/watch-together/store";
import { normalizeWatchRoomState } from "@/lib/watch-together/types";
import {
  jsonSize,
  PeerId,
  privateJson,
  requestHasSameOrigin,
  requestHostname,
  RoomId,
  watchRoomError,
} from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ roomId: string }> };

const ReadQuery = z.object({
  peerId: PeerId,
  afterSignalId: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
});

const PatchBody = z.object({
  peerId: PeerId,
  baseVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  scope: z.enum(["host", "queue"]),
  state: z.unknown(),
}).strict();

const DeleteBody = z.object({
  peerId: PeerId,
  close: z.boolean().default(false),
}).strict();

async function parsedRoomId(context: Context): Promise<string | null> {
  const result = RoomId.safeParse((await context.params).roomId);
  return result.success ? result.data : null;
}

export async function GET(request: Request, context: Context) {
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized" }, { status: 401 });
  const roomId = await parsedRoomId(context);
  if (!roomId) return privateJson({ error: "invalid_room" }, { status: 400 });
  const url = new URL(request.url);
  const parsed = ReadQuery.safeParse({
    peerId: url.searchParams.get("peerId"),
    afterSignalId: url.searchParams.get("afterSignalId") ?? 0,
  });
  if (!parsed.success) return privateJson({ error: "invalid_query" }, { status: 400 });

  try {
    const room = await getWatchRoom({ roomId, userId, ...parsed.data });
    return privateJson({ room });
  } catch (error) {
    const response = watchRoomError(error);
    if (response) return response;
    console.error("watch room read failed", error);
    return privateJson({ error: "room_unavailable" }, { status: 503 });
  }
}

export async function PATCH(request: Request, context: Context) {
  if (!requestHasSameOrigin(request)) return privateJson({ error: "invalid_origin" }, { status: 403 });
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized" }, { status: 401 });
  const roomId = await parsedRoomId(context);
  if (!roomId) return privateJson({ error: "invalid_room" }, { status: 400 });
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateJson({ error: "invalid_payload" }, { status: 400 });
  if (jsonSize(parsed.data.state) > 150_000) {
    return privateJson({ error: "payload_too_large" }, { status: 413 });
  }

  try {
    if (parsed.data.scope === "host") {
      await requireAccountEntitlement({
        userId,
        requestHostname: requestHostname(request),
        featureId: "rooms.private",
      });
    }
    const room = await updateWatchRoomState({
      roomId,
      userId,
      peerId: parsed.data.peerId,
      baseVersion: parsed.data.baseVersion,
      scope: parsed.data.scope,
      state: normalizeWatchRoomState(parsed.data.state),
    });
    return privateJson({ room });
  } catch (error) {
    const response = watchRoomError(error);
    if (response) return response;
    console.error("watch room update failed", error);
    return privateJson({ error: "room_unavailable" }, { status: 503 });
  }
}

export async function DELETE(request: Request, context: Context) {
  if (!requestHasSameOrigin(request)) return privateJson({ error: "invalid_origin" }, { status: 403 });
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized" }, { status: 401 });
  const roomId = await parsedRoomId(context);
  if (!roomId) return privateJson({ error: "invalid_room" }, { status: 400 });
  const parsed = DeleteBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateJson({ error: "invalid_payload" }, { status: 400 });

  try {
    if (parsed.data.close) {
      await requireAccountEntitlement({
        userId,
        requestHostname: requestHostname(request),
        featureId: "rooms.private",
      });
    }
    await leaveWatchRoom({ roomId, userId, ...parsed.data });
    return privateJson({ ok: true });
  } catch (error) {
    const response = watchRoomError(error);
    if (response) return response;
    console.error("watch room leave failed", error);
    return privateJson({ error: "room_unavailable" }, { status: 503 });
  }
}
