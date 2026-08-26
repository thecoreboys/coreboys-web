import { ArrowUpRight, PlayCircle, VideoRecorder } from "@untitledui/icons";
import { GROUP } from "@/lib/group";
import { fetchYouTubeChannelFeed, type FeedItem } from "@/lib/social-feed";
import { Button } from "@/components/base/buttons/button";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { SocialIcon } from "@/components/ui/SocialIcon";
import { BrowserRelativeTime } from "@/components/ui/BrowserDateTime";

/**
 * Featured content — pulls only from the **org** YouTube channel
 * (`@createownruneverything`). Fed by RSS, no API key needed once the
 * channel ID is filled into `lib/group.ts`.
 *
 * If the channel ID isn't set yet, the section degrades to a clear
 * placeholder pointing at BEFORE_DEPLOY.md.
 */
export async function FeaturedContent() {
  let items: FeedItem[] = [];
  if (GROUP.socials.youtube.channelId) {
    try {
      items = await fetchYouTubeChannelFeed(
        GROUP.socials.youtube.channelId,
        null,
        "CORE",
        8,
      );
    } catch {
      items = [];
    }
  }

  return (
    <section className="border-t border-[color:var(--rule)] bg-[color:var(--bg)]">
      <div className="mx-auto max-w-container px-6 py-16 md:px-8 md:py-20">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow inline-flex items-center gap-2">
              <SocialIcon platform="youtube" size={11} className="text-[#FF0033]" />
              Featured · CORE on YouTube
            </p>
            <h2 className="mt-2 text-display-sm font-semibold tracking-tight text-[color:var(--ink)] md:text-display-md">
              Latest from the <span className="gradient-text">org channel.</span>
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button href="/videos" color="secondary" size="md" iconTrailing={<ArrowUpRight data-icon="trailing" className="size-5 pointer-events-none" />}>
              View all videos
            </Button>
            <Button
              href={GROUP.socials.youtube.url}
              target="_blank"
              rel="noopener noreferrer"
              color="primary"
              size="md"
              iconLeading={<SocialIcon platform="youtube" size={16} />}
              iconTrailing={<ArrowUpRight data-icon="trailing" className="size-5 pointer-events-none" />}
            >
              Watch on YouTube
            </Button>
          </div>
        </header>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl bg-[color:var(--bg-elev)] p-10 text-center ring-1 ring-inset ring-[color:var(--rule)] shadow-xs-skeuomorphic">
            <FeaturedIcon icon={VideoRecorder} size="lg" theme="modern" color="gray" />
            <div>
              <p className="text-md font-semibold text-[color:var(--ink)]">No videos yet</p>
              <p className="mt-1 text-sm text-[color:var(--ink-dim)]">
                New uploads from the CORE channel will appear here.
              </p>
            </div>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {items.slice(0, 4).map((it) => (
              <li key={it.id}>
                <a
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-icon="youtube"
                  className="group flex h-full flex-col overflow-hidden rounded-xl bg-[color:var(--bg-elev)] ring-1 ring-inset ring-[color:var(--rule)] shadow-xs-skeuomorphic transition-colors hover:ring-[color:var(--rule-strong)] hover:bg-[color:var(--surface)]"
                >
                  <span className="relative block aspect-video w-full overflow-hidden bg-black media-tone">
                    {it.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.thumbnailUrl}
                        alt={it.title}
                        className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                    ) : null}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(180deg, transparent 60%, rgba(8,8,10,0.85) 100%)",
                      }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                      <PlayCircle
                        className="size-12 text-[color:var(--ink)]"
                        style={{ filter: "drop-shadow(0 4px 18px rgba(0,0,0,.6))" }}
                      />
                    </span>
                  </span>
                  <div className="flex flex-1 flex-col gap-1.5 p-4">
                    <h3 className="line-clamp-2 text-balance text-sm font-semibold leading-snug tracking-tight text-[color:var(--ink)]">
                      {it.title}
                    </h3>
                    <span className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
                      <BrowserRelativeTime value={it.publishedAt} /> · CORE
                    </span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
