import { NextResponse } from "next/server";
import { fetchTwitchChatBadges } from "@/lib/twitch";

export const revalidate = 3600;

const cleanChannelIds = (value: string | null): string[] =>
  [...new Set((value ?? "").split(",").map((id) => id.trim()).filter((id) => /^\d+$/.test(id)))].slice(0, 8);

export async function GET(request: Request) {
  const channelIds = cleanChannelIds(new URL(request.url).searchParams.get("channelIds"));
  const [global, channelEntries] = await Promise.all([
    fetchTwitchChatBadges(),
    Promise.all(
      channelIds.map(async (channelId) => [channelId, await fetchTwitchChatBadges(channelId)] as const),
    ),
  ]);

  return NextResponse.json(
    { global, channels: Object.fromEntries(channelEntries) },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
      },
    },
  );
}
