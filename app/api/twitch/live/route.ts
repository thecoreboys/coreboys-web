import { after, NextResponse } from "next/server";
import { MEMBERS } from "@/lib/members";
import { buildLiveResponse, type LiveResponse } from "@/lib/twitch";
import { maybeRecordLiveSessions } from "@/lib/streams/reconcile";
import { cachedPublicData } from "@/lib/server-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const logins = MEMBERS.map((m) => m.twitchLogin);
  try {
    // Every open tab polls this route; share one Helix snapshot per ~15s
    // across requests and replicas instead of rebuilding per caller.
    const payload: LiveResponse = await cachedPublicData("twitch-live:v1", () => buildLiveResponse(logins), {
      freshSeconds: 15,
      staleSeconds: 60,
      validate: (value): value is LiveResponse => Boolean(value && typeof value === "object" && Array.isArray((value as LiveResponse).live)),
    });
    after(async () => {
      await maybeRecordLiveSessions(payload.live).catch(() => {});
    });
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[/api/twitch/live]", message);
    return NextResponse.json(
      { live: logins.map((login) => ({ login, isLive: false })), fetchedAt: new Date().toISOString(), error: message },
      { status: 502 },
    );
  }
}
