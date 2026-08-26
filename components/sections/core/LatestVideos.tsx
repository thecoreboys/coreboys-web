import { ArrowRight, PlayCircle } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { GROUP } from "@/lib/group";
import { MEMBERS } from "@/lib/members";
import { fetchYouTubeFeedByRef, type FeedItem } from "@/lib/social-feed";
import { BrowserRelativeTime } from "@/components/ui/BrowserDateTime";

/**
 * Home "Fresh uploads" feed — pulls the latest YouTube videos across the org
 * channel + every member (RSS, no API key) and shows the 8 newest as cards.
 * Server component; resilient — a failed/empty channel just contributes
 * nothing, and the whole section hides if there are no videos at all.
 */

type Src = { key: string; label: string; ref: string };

export async function LatestVideos() {
  const sources: Src[] = [];
  const orgRef = GROUP.socials.youtube.channelId || GROUP.socials.youtube.url;
  if (orgRef) sources.push({ key: "org", label: "Main channel", ref: orgRef });
  for (const m of MEMBERS) {
    for (const s of m.socials.filter((x) => x.platform === "youtube")) {
      const ref = s.url || s.handle || "";
      if (ref) sources.push({ key: m.slug, label: m.stageName, ref });
    }
  }

  const perSource = await Promise.all(
    sources.map((s) =>
      fetchYouTubeFeedByRef(s.ref, s.key, s.label, 4)
        .then((items) => items.map((it) => ({ ...it, authorLabel: s.label, authorSlug: s.key })))
        .catch(() => [] as FeedItem[]),
    ),
  );

  const videos = perSource
    .flat()
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
    .slice(0, 8);

  if (videos.length === 0) return null;

  return (
    <section className="bg-primary py-16 md:py-24">
      <div className="mx-auto max-w-container px-6 md:px-8">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4 md:mb-14">
          <div>
            <p className="text-sm font-semibold text-brand-secondary">Fresh uploads</p>
            <h2 className="mt-2 text-display-sm font-semibold tracking-tight text-primary md:text-display-md">
              Latest from <span className="gradient-text">every channel.</span>
            </h2>
          </div>
          <Button color="secondary" size="lg" href="/videos" iconTrailing={<ArrowRight className="size-5" />} className="hidden sm:inline-flex">
            All videos
          </Button>
        </div>

        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {videos.map((v) => (
            <li key={v.id}>
              <a
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
              >
                <div className="relative aspect-video overflow-hidden rounded-xl bg-secondary ring-1 ring-inset ring-secondary">
                  {v.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  ) : null}
                  <span className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 transition group-hover:opacity-100" />
                  <span className="absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
                    <PlayCircle className="size-12 text-white drop-shadow-lg" />
                  </span>
                </div>
                <h3 className="mt-3 line-clamp-2 text-sm font-semibold text-primary">{v.title}</h3>
                <p className="mt-1 text-xs text-tertiary">
                  {v.authorLabel} · <BrowserRelativeTime value={v.publishedAt} absoluteAfterDays={30} />
                </p>
              </a>
            </li>
          ))}
        </ul>

        <div className="mt-8 sm:hidden">
          <Button color="secondary" size="lg" href="/videos" iconTrailing={<ArrowRight className="size-5" />} className="w-full">
            All videos
          </Button>
        </div>
      </div>
    </section>
  );
}
