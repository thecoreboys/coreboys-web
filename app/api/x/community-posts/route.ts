import { NextResponse } from "next/server";
import { X_COMMUNITY_POSTING_CAPABILITY } from "@/lib/x/community-posting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { capability: X_COMMUNITY_POSTING_CAPABILITY },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}

/** Hard-disabled: deliberately performs no auth, DB, vault or X API work. */
export function POST() {
  return NextResponse.json(
    { ok: false, capability: X_COMMUNITY_POSTING_CAPABILITY },
    { status: 501, headers: { "Cache-Control": "no-store" } },
  );
}
