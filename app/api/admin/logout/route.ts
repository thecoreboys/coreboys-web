import { NextResponse } from "next/server";
import { buildClearMfaChallengeCookie, buildClearSessionCookie } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", buildClearSessionCookie());
  res.headers.append("Set-Cookie", buildClearMfaChallengeCookie());
  return res;
}
