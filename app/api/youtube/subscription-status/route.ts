import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { listLoyalty } from "@/lib/oauth/loyalty";
import { allTargets } from "@/lib/oauth/roster";
import { youtubeSubscribeHref } from "@/lib/youtube-subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UnknownReason = "signed_out" | "not_synced" | "verification_unavailable";

function response(
  target: ReturnType<typeof allTargets>[number],
  verification: { status: "subscribed" | "not_subscribed" } | { status: "unknown"; reason: UnknownReason },
) {
  const result = NextResponse.json({
    ...verification,
    member: target.slug,
    channelName: target.label,
    subscribeHref: youtubeSubscribeHref({
      channelId: target.youtubeChannelIds[0],
      handle: target.youtubeHandles[0],
    }),
  });
  result.headers.set("Cache-Control", "private, no-store");
  return result;
}

export async function GET(request: Request) {
  const member = new URL(request.url).searchParams.get("member")?.trim().toLowerCase() ?? "";
  const target = allTargets().find((candidate) => candidate.slug === member);
  if (!target) {
    const result = NextResponse.json({ error: "unknown YouTube channel" }, { status: 404 });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  }

  const subscribeHref = youtubeSubscribeHref({
    channelId: target.youtubeChannelIds[0],
    handle: target.youtubeHandles[0],
  });
  if (!subscribeHref) {
    const result = NextResponse.json({ error: "YouTube channel is not configured" }, { status: 404 });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  }

  const userId = await getCurrentFanUserId();
  if (!userId) return response(target, { status: "unknown", reason: "signed_out" });

  try {
    // Playback never calls YouTube. Account connect/sync refreshes this fact;
    // the player only reads the persisted result shared by every page visit.
    const cached = (await listLoyalty(userId)).find((fact) => (
      fact.platform === "youtube"
      && fact.subject === target.slug
      && fact.kind === "sub"
    ));
    if (!cached) return response(target, { status: "unknown", reason: "not_synced" });
    return response(target, { status: cached.value ? "subscribed" : "not_subscribed" });
  } catch {
    return response(target, { status: "unknown", reason: "verification_unavailable" });
  }
}
