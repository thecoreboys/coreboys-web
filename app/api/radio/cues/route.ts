import { NextResponse } from "next/server";
import { z } from "zod";
import { selectRadioCue } from "@/lib/radio/catalog";
import { RADIO_NETWORK_SLUGS } from "@/lib/radio/public-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({
  kind: z.enum(["tune_in", "live_takeover", "intermission", "outro"]),
  network: z.enum(RADIO_NETWORK_SLUGS),
  // IDs are client-held short-lived history. Cap them so a URL cannot become
  // an oversized state channel, while preserving no-immediate-repeat rotation.
  exclude: z.string().optional().transform((value) => value
    ? value.split(",").map((entry) => entry.trim()).filter(Boolean).slice(0, 24)
    : []),
});

/**
 * Read-only cue selector. It returns an existing, approved recording only;
 * this endpoint never prompts or invokes a text-to-speech service.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = Query.safeParse({
    kind: url.searchParams.get("kind"),
    network: url.searchParams.get("network"),
    exclude: url.searchParams.get("exclude") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "invalid_radio_cue_request" }, { status: 400 });
  const selection = await selectRadioCue({
    kind: parsed.data.kind,
    networkSlug: parsed.data.network,
    excludedIds: parsed.data.exclude,
  });
  return NextResponse.json({ ...selection, generatedAt: new Date().toISOString() }, {
    // Selection is intentionally per interaction, not shared/cached CDN state.
    headers: { "Cache-Control": "private, no-store" },
  });
}
