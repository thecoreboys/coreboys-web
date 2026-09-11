import { NextResponse } from "next/server";
import { z } from "zod";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { resolveHomeItems } from "@/lib/watch/home-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Body = z.object({ refs: z.array(z.string().min(1).max(200)).min(1).max(100) });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_references" }, { status: 400 });
  const catalog = await getWatchCatalog();
  return NextResponse.json({ items: resolveHomeItems(catalog, parsed.data.refs) }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
