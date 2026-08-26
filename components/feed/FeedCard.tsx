import { ArrowUpRight, PlayCircle } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { PlatformLogo, PLATFORM_BRAND } from "@/components/clips/PlatformLogo";
import type { FeedItem, SocialPlatform } from "./types";
import { cn } from "@/lib/utils";
import { BrowserRelativeTime } from "@/components/ui/BrowserDateTime";

const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  x: "X",
};

// UUI Badge colors mapped per platform so the chip reads on-brand.
const PLATFORM_BADGE: Record<SocialPlatform, "error" | "pink" | "purple" | "gray"> = {
  youtube: "error",
  tiktok: "pink",
  instagram: "purple",
  x: "gray",
};

/**
 * One feed item rendered as a UUI media card: thumbnail, platform Badge,
 * title, author/channel + relative date, link-out with a hover lift.
 * Pure presentational + server-safe (no client hooks).
 */
export function FeedCard({ item }: { item: FeedItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex h-full flex-col overflow-hidden rounded-xl bg-secondary ring-1 ring-inset ring-secondary shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <span className="relative block aspect-video w-full overflow-hidden bg-black media-tone">
        {item.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnailUrl}
            alt={item.title}
            className="h-full w-full object-cover transition group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-full w-full items-center justify-center"
            style={{ color: PLATFORM_BRAND[item.platform] }}
          >
            <PlatformLogo platform={item.platform} size={40} />
          </span>
        )}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(180deg, transparent 58%, rgba(8,8,10,0.78) 100%)" }}
        />
        <span className="absolute left-3 top-3">
          <Badge type="pill-color" color={PLATFORM_BADGE[item.platform]} size="sm">
            <span className="inline-flex items-center gap-1.5">
              <span style={{ color: PLATFORM_BRAND[item.platform] }}>
                <PlatformLogo platform={item.platform} size={11} />
              </span>
              {PLATFORM_LABEL[item.platform]}
            </span>
          </Badge>
        </span>
        {item.platform === "youtube" ? (
          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
            <PlayCircle
              className="size-12 text-white"
              style={{ filter: "drop-shadow(0 4px 18px rgba(0,0,0,.6))" }}
            />
          </span>
        ) : null}
      </span>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="text-xs font-medium uppercase tracking-wide text-tertiary">
          <BrowserRelativeTime value={item.publishedAt} /> · {item.authorLabel}
        </span>
        <h3 className="line-clamp-2 text-balance text-sm font-semibold leading-snug tracking-tight text-primary">
          {item.title}
        </h3>
        <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-tertiary group-hover:text-brand-secondary">
          Open <ArrowUpRight className="size-3" />
        </span>
      </div>
    </a>
  );
}

/** Dashed empty-state tile for a platform whose fetcher is still stubbed. */
export function FeedPlatformEmpty({
  platform,
  className,
}: {
  platform: SocialPlatform;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-secondary bg-secondary/40 p-6 text-center",
        className,
      )}
    >
      <span
        className="inline-flex size-10 items-center justify-center rounded-full bg-secondary ring-1 ring-inset ring-secondary"
        style={{ color: PLATFORM_BRAND[platform] }}
      >
        <PlatformLogo platform={platform} size={18} />
      </span>
      <p className="text-sm font-semibold text-primary">{PLATFORM_LABEL[platform]} feed</p>
      <p className="max-w-[34ch] text-xs leading-relaxed text-tertiary">
        {PLATFORM_LABEL[platform]} feed connects when its API key is added.
      </p>
    </div>
  );
}
