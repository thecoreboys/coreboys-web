import { NextResponse } from "next/server";
import { z } from "zod";
import { getUnavailableReferenceKeys } from "@/lib/watch/available-references";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Id = z.string().max(500).optional();
const Url = z.string().max(2_000).optional();
const Body = z.object({ items: z.array(z.object({
  id: Id, platform: Id, provider: Id, providerId: Id, canonicalId: Id, canonicalProviderId: Id,
  sourceUrl: Url, url: Url, href: Url,
  x: z.object({ statusId: Id }).optional(),
  twitch: z.object({ vodId: Id }).optional(),
  dvr: z.object({ twitchVodId: Id }).optional(),
})).min(1).max(100) });

/** A local suppression lookup only: browser traffic never invokes a provider. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_content_references" }, { status: 400 });
  try {
    const keys = await getUnavailableReferenceKeys(parsed.data.items);
    return NextResponse.json({ unavailableKeys: [...keys] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "availability_unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
