import { NextResponse } from "next/server";
import { MEMBERS } from "@/lib/members";
import { buildLiveResponse, type LiveResponse } from "@/lib/twitch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 30;

export async function GET() {
  const logins = MEMBERS.map((m) => m.twitchLogin);
  try {
    const payload: LiveResponse = await buildLiveResponse(logins);
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
