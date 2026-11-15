import { NextResponse } from "next/server";
import { z } from "zod";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { resolveHomeItems } from "@/lib/watch/home-catalog";
import { filterAvailableReferences } from "@/lib/watch/available-references";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Body = z.object({ refs: z.array(z.string().min(1).max(200)).min(1).max(100) });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_references" }, { status: 400 });
  const [catalog, availableRefs] = await Promise.all([getWatchCatalog(), filterAvailableReferences(parsed.data.refs)]);
  const visible = new Set(availableRefs);
  return NextResponse.json({ items: resolveHomeItems(catalog, availableRefs),
    removedRefs: parsed.data.refs.filter((ref) => !visible.has(ref)) }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
