import Link from "next/link";
import { ArrowUpRight, Youtube } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { FeedCard } from "@/components/feed/FeedCard";
import { GROUP } from "@/lib/group";
import { getHouseFeed, type FeedItem } from "@/lib/social-feed";

/**
 * Combined HOUSE feed — pulls the latest across every member's socials
 * (YouTube live via RSS; TikTok/IG/X via the credential-ready stubs),
 * merges by publish time, and shows the freshest 8 on the home page.
 * Full surface (with a House/CORE switch) lives at /feed.
 *
 * UUI surface: rounded-xl FeedCard tiles, UUI Button header CTA,
 * UUI type scale.
 */
export async function CombinedFeed() {
  let items: FeedItem[] = [];
  try {
    items = await getHouseFeed(8);
  } catch {
    items = [];
  }

  if (items.length === 0) {
    return (
      <section className="border-t border-secondary bg-primary">
        <div className="mx-auto max-w-container px-6 py-16 md:px-8 md:py-20">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-brand-secondary">Feed · Across socials</p>
              <h2 className="mt-2 text-display-xs font-semibold tracking-tight text-primary md:text-display-sm">
                The combined feed.
              </h2>
            </div>
            <Button
              href="/feed"
              size="lg"
              color="secondary"
              iconTrailing={<ArrowUpRight className="size-5" />}
            >
              View full feed
            </Button>
          </header>
          <div className="rounded-xl bg-secondary p-8 text-center ring-1 ring-inset ring-secondary shadow-xs">
            <p className="text-sm leading-relaxed text-tertiary">
              The feed is warming up — fresh uploads land here on the next refresh.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="border-t border-secondary bg-primary">
      <div className="mx-auto max-w-container px-6 py-16 md:px-8 md:py-20">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-brand-secondary">Feed · Across socials · Live</p>
            <h2 className="mt-2 text-display-xs font-semibold tracking-tight text-primary md:text-display-sm">
              The combined feed.
            </h2>
            <p className="mt-2 max-w-[60ch] text-md leading-relaxed text-tertiary">
              Latest uploads across every CORE channel — the whole house in one place. Updates
              every 10 minutes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              href={GROUP.socials.youtube.url}
              target="_blank"
              rel="noopener noreferrer"
              size="lg"
              color="secondary"
              iconLeading={<Youtube className="size-5" />}
              iconTrailing={<ArrowUpRight className="size-5" />}
            >
              Watch on YouTube
            </Button>
          </div>
        </header>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((it) => (
            <li key={it.id}>
              <FeedCard item={it} />
            </li>
          ))}
        </ul>

        <div className="mt-8 flex justify-center">
          <Link
            href="/feed"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-secondary transition-colors hover:text-brand-secondary_hover"
          >
            View full feed
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
