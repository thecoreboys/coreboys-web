import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { getFanUserById } from "@/lib/fan-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const id = await getCurrentFanUserId();
  if (!id) return NextResponse.json({ user: null }, { status: 401 });
  const user = await getFanUserById(id);
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user });
}
