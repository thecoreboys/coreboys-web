import { ArrowUpRight, Youtube } from "lucide-react";
import { MEMBERS } from "@/lib/members";
import { GROUP } from "@/lib/group";
import { fetchCombinedFeed, type FeedItem } from "@/lib/social-feed";

/**
 * Combined social feed — pulls latest videos from every member's
 * YouTube channel + the group account, merges by publish time,
 * shows the freshest 12 across the org. RSS-driven, free, no API key.
 *
 * Add X / Instagram / TikTok later by extending fetchCombinedFeed.
 * See BEFORE_DEPLOY.md for the API access required for those tiers.
 */
export async function CombinedFeed() {
  const youtubeChannels = [
    GROUP.socials.youtube.channelId
      ? {
          channelId: GROUP.socials.youtube.channelId,
          authorSlug: null,
          authorLabel: "CORE",
        }
      : null,
    ...MEMBERS.flatMap((m) =>
      m.youtubeChannelId
        ? [{ channelId: m.youtubeChannelId, authorSlug: m.slug, authorLabel: m.stageName }]
        : [],
    ),
  ].filter((x): x is { channelId: string; authorSlug: string | null; authorLabel: string } => !!x);

  let items: FeedItem[] = [];
  try {
    items = await fetchCombinedFeed({ youtubeChannels }, 12);
  } catch {
    items = [];
  }

  if (items.length === 0) {
    return (
      <section className="border-t border-[color:var(--rule)] bg-[color:var(--bg)]">
        <div className="mx-auto max-w-[1440px] px-6 py-16 md:px-8 md:py-20">
          <header className="mb-6">
            <p className="eyebrow">Feed · Across socials</p>
            <h2 className="mt-2 text-display text-[clamp(28px,3.6vw,44px)] text-[color:var(--ink)]">
              The combined feed.
            </h2>
          </header>
          <div className="rounded-lg border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] p-8 text-center">
            <p className="text-[14px] leading-relaxed text-[color:var(--ink-dim)]">
              Sorry everyone I havent made the backend logic for this yet. &lt;3
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="border-t border-[color:var(--rule)] bg-[color:var(--bg)]">
      <div className="mx-auto max-w-[1440px] px-6 py-16 md:px-8 md:py-20">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Feed · Across socials · Live</p>
            <h2 className="mt-2 text-display text-[clamp(28px,3.6vw,44px)] text-[color:var(--ink)]">
              The combined feed.
            </h2>
            <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-[color:var(--ink-dim)]">
              Latest uploads across every CORE channel — group account first, then per-member.
              Updates every 10 minutes.
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

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((it) => (
            <li key={it.id}>
              <a
                href={it.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex h-full flex-col overflow-hidden rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] transition-colors hover:border-[color:var(--rule-strong)] hover:bg-[color:var(--surface)]"
              >
                {it.thumbnailUrl ? (
                  <span className="relative block aspect-video w-full overflow-hidden bg-black media-tone">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.thumbnailUrl}
                      alt={it.title}
                      className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                      loading="lazy"
                    />
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-[#FF0033]/50 bg-[#FF0033]/12 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#FF7991]">
                      <Youtube size={10} />
                      YouTube
                    </span>
                  </span>
                ) : null}
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
                    {formatRelative(it.publishedAt)} · {it.authorLabel}
                  </span>
                  <h3 className="line-clamp-2 text-balance text-[14px] font-semibold leading-snug tracking-tight text-[color:var(--ink)] group-hover:text-[color:var(--ink)]">
                    {it.title}
                  </h3>
                  <span className="mt-auto inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)] group-hover:text-[#FF0033]">
                    Watch <ArrowUpRight size={11} />
                  </span>
                </div>
              </a>
            </li>
          ))}
        </ul>

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
