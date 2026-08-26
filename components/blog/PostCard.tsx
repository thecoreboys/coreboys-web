import Link from "next/link";
import type { Route } from "next";
import type { PostListItem } from "@/lib/blog";
import { BrowserDateTime } from "@/components/ui/BrowserDateTime";

type Props = {
  post: PostListItem;
  /** Optional cover URL fetched separately; cards otherwise rely on the
   * server fetch having flown the cover URL through (the API does this in
   * the post detail endpoint but not in the list endpoint, so callers can
   * pass it through here when known). */
  coverUrl?: string | null;
  variant: "hero" | "featured" | "grid";
};

/**
 * Editorial card: kicker (date · author), display title, single-line
 * excerpt, accent rule on hover. Pure RSC — no client JS.
 */
export function PostCard({ post, coverUrl, variant }: Props) {
  const date = post.publishedAt ?? post.createdAt;

  if (variant === "hero") {
    return (
      <Link
        href={`/blog/${post.slug}` as Route}
        className="post-card group relative block overflow-hidden rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)]"
      >
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-black md:aspect-[21/9]">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.025]"
              loading="eager"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-[color:var(--surface)] to-[color:var(--bg)]" />
          )}
          <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        </div>
        <div className="absolute inset-x-0 bottom-0 p-6 md:p-10">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
            <BrowserDateTime value={date} options={{ year: "numeric", month: "short", day: "numeric" }} fallback="Local date" />
          </p>
          <h2 className="mt-2 max-w-3xl font-display text-display-sm font-bold leading-[1.05] tracking-[-0.03em] text-white md:text-display-md">
            {post.title}
          </h2>
          {post.excerpt ? (
            <p className="mt-3 line-clamp-2 max-w-2xl text-md text-white/80 md:text-lg">{post.excerpt}</p>
          ) : null}
          <span className="mt-4 inline-flex h-1 w-12 origin-left scale-x-0 bg-[color:var(--core)] transition-transform duration-500 group-hover:scale-x-100" />
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/blog/${post.slug}` as Route}
      className="post-card group relative block overflow-hidden rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)]"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-black">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[color:var(--surface)] to-[color:var(--bg)]" />
        )}
      </div>
      <div className="p-4">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-[color:var(--ink-faint)]">
          <BrowserDateTime value={date} options={{ year: "numeric", month: "short", day: "numeric" }} fallback="Local date" />
        </p>
        <h3
          className={
            variant === "featured"
              ? "mt-1.5 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-[color:var(--ink)] md:text-display-xs"
              : "mt-1.5 font-display text-lg font-bold leading-tight tracking-[-0.02em] text-[color:var(--ink)]"
          }
        >
          {post.title}
        </h3>
        {post.excerpt ? (
          <p className="mt-1.5 line-clamp-1 text-sm text-[color:var(--ink-dim)]">{post.excerpt}</p>
        ) : null}
        <span className="mt-3 block h-px w-8 origin-left scale-x-0 bg-[color:var(--core)] transition-transform duration-500 group-hover:scale-x-100" />
      </div>
    </Link>
  );
}
