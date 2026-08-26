import type { Metadata } from "next";
import { GROUP } from "@/lib/group";
import { MEMBERS } from "@/lib/members";
import { fetchYouTubeFeedByRef, type FeedItem } from "@/lib/social-feed";
import { fetchUsersByLogin } from "@/lib/twitch";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { fetchDurations } from "@/lib/youtube-duration";
import { VideosGrid, type VideoChannel } from "@/components/videos/VideosGrid";
import { SitePresence } from "@/components/account/SitePresence";

/** Bare YouTube video id from a FeedItem (id `yt-<id>` or watch?v=<id>). */
function youTubeIdOf(item: FeedItem): string {
  if (item.id?.startsWith("yt-")) return item.id.slice(3);
  const m = /[?&]v=([0-9A-Za-z_-]{6,})/.exec(item.url ?? "");
  return m?.[1] ?? "";
}

export const metadata: Metadata = {
  title: "Videos",
  description:
    "The latest YouTube videos from the CORE org channel and every member — all in one place.",
  alternates: { canonical: "/videos" },
};

// Keep the feed fresh. RSS needs no API key, so this returns real videos
// on every revalidate window without burning credits.
export const revalidate = 600;

type ChannelSource = {
  /** Stable filter key — "org" or the member slug. */
  key: string;
  label: string;
  /** Handle / channel-URL / id to resolve → RSS. */
  ref: string;
};

export default async function VideosPage() {
  // ── Build the channel list: org first, then every member's YouTube
  //    channel(s). Members can run multiple channels (Marlon has 3); each
  //    is its own source but they collapse under the member's filter key.
  const sources: ChannelSource[] = [];

  if (GROUP.socials.youtube.channelId || GROUP.socials.youtube.url) {
    sources.push({
      key: "org",
      label: "Main channel",
      ref: GROUP.socials.youtube.channelId || GROUP.socials.youtube.url,
    });
  }

  for (const m of MEMBERS) {
    const ytLinks = m.socials.filter((s) => s.platform === "youtube");
    for (const link of ytLinks) {
      const ref = link.url || link.handle || "";
      if (!ref) continue; // skip gracefully when a channel ref is missing
      sources.push({ key: m.slug, label: m.stageName, ref });
    }
  }

  // Fetch every channel's latest videos in parallel; a failed/empty
  // channel just contributes nothing (fetchYouTubeFeedByRef never throws).
  const perSource = await Promise.all(
    sources.map(async (s) => {
      const items = await fetchYouTubeFeedByRef(s.ref, s.key, s.label, 8);
      return items.map((it) => ({ ...it, authorLabel: s.label, authorSlug: s.key }));
    }),
  );

  const allVideos: FeedItem[] = perSource
    .flat()
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

  // Real Twitch profile avatars for the member chips. Resolient: if Twitch
  // fails for any reason we just render chips without avatars.
  let twAvatars: Record<string, { profile_image_url?: string }> = {};
  try {
    twAvatars = await fetchUsersByLogin(MEMBERS.map((m) => m.twitchLogin));
  } catch {
    twAvatars = {};
  }
  const avatarBySlug = new Map<string, string | undefined>(
    MEMBERS.map((m) => [
      m.slug,
      twAvatars[m.twitchLogin.toLowerCase()]?.profile_image_url,
    ]),
  );

  // Which channels actually returned videos — drives the filter chips so
  // we never show a tab that resolves to an empty list. Each chip carries
  // a count, a kind (org → YouTube mark, member → Twitch avatar) and the
  // resolved avatar URL.
  const order: string[] = [];
  const meta = new Map<string, { label: string; count: number }>();
  for (const v of allVideos) {
    const key = v.authorSlug ?? "org";
    const existing = meta.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      order.push(key);
      meta.set(key, { label: v.authorLabel, count: 1 });
    }
  }
  // Durations aren't in RSS — fetch them from the YouTube Data API for the
  // loaded video ids (no-op returning {} when YOUTUBE_API_KEY is unset or
  // anything fails). Cards hide the badge when a duration is missing.
  let durationById: Record<string, string> = {};
  try {
    const ids = allVideos.map(youTubeIdOf).filter(Boolean);
    durationById = await fetchDurations(ids);
  } catch {
    durationById = {};
  }

  const channels: VideoChannel[] = order.map((key) => {
    const m = meta.get(key)!;
    return {
      key,
      label: m.label,
      count: m.count,
      kind: key === "org" ? "org" : "member",
      avatarUrl: key === "org" ? undefined : avatarBySlug.get(key),
    };
  });

  return (
    <>
      <SitePresence kind="video_play" subject="house" reference="videos-page" />
      <header className="border-b border-[color:var(--rule)]">
        <div className="mx-auto max-w-container px-6 py-12 md:px-16 md:py-16">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
            From the house
          </p>
          <h1 className="mt-4 font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] text-[color:var(--ink)] md:text-[48px]">
            Watch.
          </h1>
          <p className="mt-4 max-w-[60ch] text-base leading-relaxed text-[color:var(--ink-dim)] md:text-lg">
            The latest from the house channel and all six members. Click to play.
          </p>
        </div>
      </header>

      <section>
        <div className="mx-auto max-w-container px-6 py-10 md:px-16 md:py-14">
          <VideosGrid
            videos={allVideos}
            channels={channels}
            durationById={durationById}
          />
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
