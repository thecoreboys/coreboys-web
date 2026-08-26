import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { listActivePassportEvents } from "@/lib/passport/read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId=await getCurrentFanUserId();
    const response = NextResponse.json({ events: await listActivePassportEvents(userId) });
    response.headers.set("Cache-Control", userId ? "private, no-store" : "public, max-age=10, stale-while-revalidate=20");
    return response;
  } catch (error) {
    console.error("Active Passport events failed", error);
    return NextResponse.json({ error: "passport_unavailable" }, { status: 500 });
  }
}
