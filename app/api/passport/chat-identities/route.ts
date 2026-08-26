import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { getPassportChatIdentities } from "@/lib/passport/chat-identities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const logins = (url.searchParams.get("logins") ?? "").split(",");
  const channel = url.searchParams.get("channel")?.trim().toLowerCase() || null;
  if (channel && !/^[a-z0-9-]{1,40}$/.test(channel)) {
    return NextResponse.json({ error: "invalid_channel" }, { status: 400 });
  }
  try {
    const identities = await getPassportChatIdentities({
      logins,
      channelSlug: channel,
      viewerUserId: await getCurrentFanUserId(),
    });
    return NextResponse.json({ identities }, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    console.error("Passport chat identity lookup failed", error);
    return NextResponse.json({ identities: {} }, {
      headers: { "cache-control": "private, no-store" },
    });
  }
}
