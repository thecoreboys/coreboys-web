import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { PassportError } from "@/lib/passport/policy";
import { getSettledPassportDashboard } from "@/lib/passport/store";
import { handlePassportAction } from "@/app/api/account/passport/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentFanUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const response = NextResponse.json(await getSettledPassportDashboard(userId));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    if (error instanceof PassportError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    console.error("Passport dashboard failed", error);
    return NextResponse.json({ error: "passport_unavailable" }, { status: 500 });
  }
}

/** Compatibility endpoint; new clients should use /action. */
export async function POST(req: Request) {
  return handlePassportAction(req);
}
