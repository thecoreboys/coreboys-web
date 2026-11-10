import { NextResponse } from "next/server";
import { z } from "zod";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { buildNetworkChannelHub, buildNetworkChannelLineup, resolveNetworkChannel, type NetworkChannelMode } from "@/lib/watch/channels";
import { createChannelPageSnapshot } from "@/lib/watch/channel-page-snapshot";
import type { CompletedLiveInterruption } from "@/lib/watch/continuous-schedule";
import { MEMBERS } from "@/lib/members";

export const dynamic = "force-dynamic";
const Interruptions = z.array(z.object({
  id: z.string().min(1).max(200), platform: z.enum(["twitch", "youtube"]),
  startsAtMs: z.number().finite(), endsAtMs: z.number().finite(),
})).max(20);
const MODES = new Set<NetworkChannelMode>(["live", "videos", "shorts", "continuous"]);

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const channel = resolveNetworkChannel((await params).slug);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  const parsed = Interruptions.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid schedule request" }, { status: 400 });
  const requestedMode = new URL(request.url).searchParams.get("mode") as NetworkChannelMode;
  const mode = MODES.has(requestedMode) && (requestedMode !== "live" || channel.memberSlug !== null) ? requestedMode : "continuous";
  try {
    const catalog = await getWatchCatalog();
    const now = Date.now();
    const completedLiveInterruptions = parsed.data.flatMap((entry): CompletedLiveInterruption[] => {
      if (entry.endsAtMs <= entry.startsAtMs || entry.endsAtMs > now || entry.endsAtMs <= now - 86_400_000 || entry.startsAtMs < now - 7 * 86_400_000) return [];
      const member = MEMBERS.find((member) => entry.platform === "twitch" && entry.id === `live-${member.slug}`);
      const item = catalog.all.find((item) => item.id === entry.id && item.platform === entry.platform) ?? (member ? {
        id: entry.id, platform: "twitch" as const, kind: "live" as const, format: "live" as const,
        title: member.stageName, memberSlug: member.slug, memberLabel: member.stageName,
        poster: member.portrait, backdrop: member.portrait, accent: member.accent,
        href: `/watch/live/${member.twitchLogin}`, live: { login: member.twitchLogin, startedAt: new Date(entry.startsAtMs).toISOString() },
      } : null);
      if (!item || (channel.memberSlug && item.memberSlug !== channel.memberSlug)) return [];
      return [{ item, startsAtMs: entry.startsAtMs, endsAtMs: entry.endsAtMs }];
    });
    return NextResponse.json(createChannelPageSnapshot({
      channel, mode, now, completedLiveInterruptions,
      items: buildNetworkChannelLineup(catalog, channel, mode),
      continuousItems: buildNetworkChannelLineup(catalog, channel, "continuous"),
      hub: buildNetworkChannelHub(catalog, channel),
    }), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "The channel update could not be loaded." }, { status: 503 });
  }
}
