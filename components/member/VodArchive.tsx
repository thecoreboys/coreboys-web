"use client";

import { PlayCircle, Clock, Eye } from "@untitledui/icons";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import type { TwitchVod } from "@/lib/twitch";

/**
 * Stream VOD archive — recent Twitch past broadcasts for a member, in an
 * Untitled UI card grid. Server-safe (presentational). Twitch only retains
 * VODs for a limited window, so an empty list renders a calm empty state.
 */
export function VodArchive({
  vods,
  memberName,
  memberSlug,
}: {
  vods: TwitchVod[];
  memberName: string;
  memberSlug?: string;
}) {
  return (
    <section className="border-t border-secondary bg-secondary">
      <div className="mx-auto max-w-container px-6 py-14 md:px-8 md:py-20">
        <div className="mb-8 flex flex-col gap-1">
          <p className="text-sm font-semibold text-brand-secondary">Stream archive</p>
          <h2 className="text-display-sm font-semibold tracking-tight text-primary md:text-display-md">
            Recent <span className="gradient-text">broadcasts</span>
          </h2>
          <p className="text-md text-tertiary">
            {memberName}&apos;s latest Twitch VODs — newest first.
          </p>
        </div>

        {vods.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-secondary bg-primary px-6 py-12 text-center">
            <FeaturedIcon icon={PlayCircle} color="gray" theme="modern" size="lg" />
            <div className="flex max-w-sm flex-col gap-1">
              <p className="text-sm font-semibold text-primary">No recent VODs</p>
              <p className="text-sm text-tertiary">
                Twitch only keeps past broadcasts for a limited time — check back after the next stream.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {vods.map((v) => (
              <a
                key={v.id}
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  void fetch("/api/account/presence", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      kind: "vod_play",
                      subject: memberSlug ?? "house",
                      ref: v.id,
                    }),
                  });
                }}
                className="group flex flex-col overflow-hidden rounded-xl bg-primary ring-1 ring-inset ring-secondary shadow-xs transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="relative aspect-video w-full overflow-hidden bg-secondary">
                  {hasThumb(v.thumbnailUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.thumbnailUrl}
                      alt={v.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-fg-quaternary">
                      <PlayCircle className="size-10" />
                    </div>
                  )}
                  <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums backdrop-blur-sm">
                    <Clock className="size-3" />
                    {formatDuration(v.duration)}
                  </span>
                  <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <PlayCircle className="size-12 text-white drop-shadow-lg" />
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <p className="line-clamp-2 text-sm font-semibold text-primary">{v.title}</p>
                  <div className="mt-auto flex items-center gap-3 text-xs text-tertiary tabular-nums">
                    <span>{formatRelative(v.createdAt)}</span>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="size-3.5" />
                      {formatViews(v.viewCount)}
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function hasThumb(url: string): boolean {
  return Boolean(url) && !url.includes("_404") && !url.endsWith("%{width}x%{height}.jpg");
}

function formatDuration(raw: string): string {
  const h = /(\d+)h/.exec(raw)?.[1];
  const m = /(\d+)m/.exec(raw)?.[1];
  const s = /(\d+)s/.exec(raw)?.[1];
  if (h) return `${h}h ${m ?? 0}m`;
  if (m) return `${m}m`;
  return `${s ?? 0}s`;
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} views`;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
