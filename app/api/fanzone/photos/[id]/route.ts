import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { getApprovedFanPhoto } from "@/lib/fanzone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "not found" }, { status: 404 });
  const photo = await getApprovedFanPhoto(id.data, await getCurrentFanUserId());
  if (!photo) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ photo }, { headers: { "Cache-Control": "private, no-store" } });
}
