import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { XTweetsRail } from "@/components/watch/XTweetsRail";
import type { FeedItem } from "@/components/feed/types";
import {
  getPersistedPublicXArchive,
  X_SOCIAL_ARCHIVE_PAGE_SIZE,
} from "@/lib/social-feed-events";
import { resolveNetworkChannel, type NetworkChannel } from "@/lib/watch/channels";
import type { WatchHomeXPost } from "@/lib/watch/x-posts";

export const dynamic = "force-dynamic";

type RouteProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ before?: string | string[] }>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeHttpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function cleanPostText(value: string): string {
  return value.replace(
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,
    "",
  ).trim();
}

function archivePost(item: FeedItem, channel: NetworkChannel): WatchHomeXPost | null {
  const source = safeHttpsUrl(item.sourceUrl ?? item.url);
  if (!source) return null;
  const url = new URL(source);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const match = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})(?:\/|$)/i.exec(url.pathname);
  if ((host !== "x.com" && host !== "twitter.com") || !match) return null;

  const handle = match[1]!;
  const statusId = match[2]!;
  const published = Date.parse(item.publishedAt);
  const text = cleanPostText(item.title);
  if (!Number.isFinite(published) || !text) return null;

  const thumbnailUrl = safeHttpsUrl(item.thumbnailUrl);
  const width = Number.isFinite(item.width) && (item.width ?? 0) > 0 ? item.width! : null;
  const height = Number.isFinite(item.height) && (item.height ?? 0) > 0 ? item.height! : null;
  const orientation = width && height
    ? height > width * 1.12
      ? "portrait" as const
      : width > height * 1.12
        ? "landscape" as const
        : "square" as const
    : item.orientation ?? "landscape";

  return {
    id: `x-${statusId}`,
    statusId,
    text,
    sourceUrl: `https://x.com/${handle}/status/${statusId}`,
    publishedAt: new Date(published).toISOString(),
    author: {
      slug: channel.memberSlug ?? "core",
      label: item.authorLabel === "X" ? channel.host : item.authorLabel,
      handle: `@${handle}`,
      portrait: channel.artwork,
      profileUrl: `https://x.com/${handle}`,
      accent: channel.accent,
      verified: false,
    },
    media: thumbnailUrl ? [{
      id: `${item.id}-media`,
      kind: item.mediaType === "video" || item.mediaType === "animated_gif" ? "video" : "image",
      thumbnailUrl,
      mediaUrl: null,
      orientation,
      width,
      height,
    }] : [],
    entities: [],
  };
}

export async function generateMetadata({ params }: Pick<RouteProps, "params">): Promise<Metadata> {
  const { slug } = await params;
  const channel = resolveNetworkChannel(slug);
  if (!channel) return {};
  return {
    title: `${channel.host} X post archive`,
    description: `Browse saved X posts from ${channel.host}, newest first.`,
    alternates: { canonical: `/channels/${channel.slug}/x` },
  };
}

export default async function ChannelXArchivePage({ params, searchParams }: RouteProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const channel = resolveNetworkChannel(slug);
  if (!channel) notFound();

  const before = first(query.before)?.trim();
  let archive: Awaited<ReturnType<typeof getPersistedPublicXArchive>>;
  try {
    archive = await getPersistedPublicXArchive({
      memberSlug: channel.memberSlug,
      before,
      limit: X_SOCIAL_ARCHIVE_PAGE_SIZE,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_x_social_archive_cursor") notFound();
    throw error;
  }
  const posts = archive.items.flatMap((item) => {
    const post = archivePost(item, channel);
    return post ? [post] : [];
  });

  return (
    <main className="min-h-screen bg-primary pb-24 pt-24 text-primary md:pt-28">
      <div className="mx-auto max-w-container">
        <header className="px-6 pb-8 md:px-10 md:pb-10">
          <Link
            href={`/channels/${channel.slug}`}
            className="text-sm font-semibold text-tertiary transition hover:text-primary"
          >
            ← Back to {channel.name}
          </Link>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-brand-secondary">
            Saved X posts
          </p>
          <h1 className="mt-2 font-display text-display-sm font-semibold tracking-tight md:text-display-md">
            {channel.host}&apos;s X archive
          </h1>
          <p className="mt-3 max-w-2xl text-md text-tertiary">
            Cached posts from the connected account, ordered newest first. Each page is limited to {X_SOCIAL_ARCHIVE_PAGE_SIZE} posts.
          </p>
        </header>

        {posts.length ? (
          <XTweetsRail
            items={posts}
            title={`${channel.host}'s saved posts on X`}
            maxItems={X_SOCIAL_ARCHIVE_PAGE_SIZE}
            showHeading={false}
          />
        ) : (
          <section className="mx-6 rounded-2xl border border-secondary bg-secondary p-8 text-tertiary md:mx-10">
            No saved X posts are available on this page yet.
          </section>
        )}

        <nav
          className="flex items-center justify-between gap-4 px-6 pt-8 text-sm font-semibold md:px-10"
          aria-label="X archive pages"
        >
          {before ? (
            <Link className="text-tertiary transition hover:text-primary" href={`/channels/${channel.slug}/x` as Route}>
              ← Newest posts
            </Link>
          ) : <span />}
          {archive.nextCursor ? (
            <Link
              className="text-primary transition hover:text-brand-secondary"
              href={`/channels/${channel.slug}/x?before=${encodeURIComponent(archive.nextCursor)}` as Route}
            >
              Older posts →
            </Link>
          ) : null}
        </nav>
      </div>
    </main>
  );
}
