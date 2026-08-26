import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { PassportInventoryQuerySchema } from "@/lib/passport/schemas";
import { listPassportCards } from "@/lib/passport/read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const parsed = PassportInventoryQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  const result = await listPassportCards({ userId, ...parsed.data });
  const response = NextResponse.json(result);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
