import { GROUP } from "@/lib/group";
import { MEMBERS } from "@/lib/members";
import { fetchYouTubeFeedByRef, type FeedItem } from "@/lib/social-feed";
import { FeaturedWatchFrame } from "./FeaturedWatchFrame";

async function getLatestHouseFilm(): Promise<FeedItem | null> {
  const orgRef = GROUP.socials.youtube.channelId || GROUP.socials.youtube.url;
  if (orgRef) {
    const org = await fetchYouTubeFeedByRef(orgRef, null, "CORE", 1);
    if (org[0]) return org[0];
  }

  const memberFeeds = await Promise.all(
    MEMBERS.flatMap((m) =>
      m.socials
        .filter((s) => s.platform === "youtube")
        .map((s) => {
          const ref = s.url || s.handle || "";
          if (!ref) return Promise.resolve([] as FeedItem[]);
          return fetchYouTubeFeedByRef(ref, m.slug, m.stageName, 1);
        }),
    ),
  );

  return (
    memberFeeds
      .flat()
      .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))[0] ?? null
  );
}

export async function FeaturedWatch() {
  const film = await getLatestHouseFilm();
  return <FeaturedWatchFrame film={film} />;
}
