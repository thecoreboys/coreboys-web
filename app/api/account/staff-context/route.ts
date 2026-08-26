import { NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The fan and staff sessions intentionally remain separate. This tiny endpoint
 * only exposes the current staff assignment when the independently verified
 * staff cookie is present; it never upgrades a fan session.
 */
export async function GET() {
  const staff = await getCurrentStaff();
  const response = NextResponse.json({ staff });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}
