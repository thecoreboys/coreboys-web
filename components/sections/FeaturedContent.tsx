import { ArrowUpRight, PlayCircle, Youtube } from "lucide-react";
import { GROUP } from "@/lib/group";
import { fetchYouTubeChannelFeed, type FeedItem } from "@/lib/social-feed";

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
      <div className="mx-auto max-w-[1440px] px-6 py-16 md:px-8 md:py-20">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow inline-flex items-center gap-2">
              <Youtube size={11} className="text-[#FF0033]" />
              Featured · CORE on YouTube
            </p>
            <h2 className="mt-2 text-display text-[clamp(28px,3.6vw,44px)] font-bold text-[color:var(--ink)]">
              Latest from the org channel.
            </h2>
            <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-[color:var(--ink-dim)]">
              Just the group account &mdash; everything published on
              <a
                href={GROUP.socials.youtube.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 underline decoration-[color:var(--ink-faint)] underline-offset-4 hover:text-[color:var(--ink)]"
              >
                {GROUP.socials.youtube.handle}
              </a>
              .
            </p>
          </div>
          <a
            href={GROUP.socials.youtube.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-youtube"
          >
            <Youtube size={14} /> Watch on YouTube <ArrowUpRight size={14} />
          </a>
        </header>

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] p-8 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
              No videos yet
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {items.slice(0, 4).map((it) => (
              <li key={it.id}>
                <a
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex h-full flex-col overflow-hidden rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] transition-colors hover:border-[color:var(--rule-strong)] hover:bg-[color:var(--surface)]"
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
                        size={48}
                        className="text-[color:var(--ink)]"
                        style={{ filter: "drop-shadow(0 4px 18px rgba(0,0,0,.6))" }}
                      />
                    </span>
                  </span>
                  <div className="flex flex-1 flex-col gap-1.5 p-4">
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
                      {formatRelative(it.publishedAt)} · CORE
                    </span>
                    <h3 className="line-clamp-2 text-balance text-[14px] font-semibold leading-snug tracking-tight text-[color:var(--ink)]">
                      {it.title}
                    </h3>
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

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 14 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
