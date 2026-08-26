"use client";

import { ArrowUpRight } from "lucide-react";
import { SocialIcon } from "@/components/ui/SocialIcon";
import { useTheme } from "@/components/providers/ThemeProvider";

export type PlatformKey =
  | "youtube"
  | "twitch"
  | "tiktok"
  | "instagram"
  | "x"
  | "snapchat";

type PlatformMeta = {
  label: string;
  brand: string;
  /** Brand color used in light mode when `brand` is too light to read. */
  brandLight?: string;
  ink: string;
  ring: string;
};

const PLATFORM: Record<PlatformKey, PlatformMeta> = {
  youtube: { label: "YouTube", brand: "#FF0033", ink: "#fff", ring: "#FF003322" },
  twitch: { label: "Twitch", brand: "#9146FF", ink: "#fff", ring: "#9146FF22" },
  tiktok: { label: "TikTok", brand: "#FE2C55", ink: "#fff", ring: "#FE2C5522" },
  instagram: { label: "Instagram", brand: "#E1306C", ink: "#fff", ring: "#E1306C22" },
  x: { label: "X", brand: "#FFFFFF", brandLight: "#0a0a0a", ink: "#000", ring: "#ffffff22" },
  snapchat: { label: "Snapchat", brand: "#FFFC00", brandLight: "#a37e00", ink: "#000", ring: "#FFFC0022" },
};

export type PlatformLinkProps = {
  platform: PlatformKey;
  url: string;
  /** Per-link label (handle, channel name) — shown beside the platform name. */
  handle?: string;
  /** Optional metric: "1.2M followers", "120k subs", etc. */
  metric?: string;
  variant?: "primary" | "secondary";
};

/**
 * Clickable platform-coordinated social link. Default variant fills with
 * the platform's brand color on hover, secondary stays surface-toned and
 * gets a colored border/ring glow. Used on member pages + group socials.
 */
export function PlatformLink({
  platform,
  url,
  handle,
  metric,
  variant = "secondary",
}: PlatformLinkProps) {
  const raw = PLATFORM[platform];
  const { resolvedTheme: theme } = useTheme();
  // X / Snapchat have brand colors that disappear on the opposite theme;
  // pick the light variant when we know the surface won't carry contrast.
  const brand = theme === "light" && raw.brandLight ? raw.brandLight : raw.brand;
  const meta: PlatformMeta = { ...raw, brand };

  if (variant === "primary") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-3 rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-4 py-3 transition-all duration-200 hover:-translate-y-px"
        style={{
          ["--brand" as string]: meta.brand,
          ["--brand-ink" as string]: meta.ink,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = meta.brand;
          e.currentTarget.style.borderColor = meta.brand;
          e.currentTarget.style.boxShadow = `0 8px 24px -8px ${meta.brand}aa`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "";
          e.currentTarget.style.borderColor = "";
          e.currentTarget.style.boxShadow = "";
        }}
      >
        <SocialIcon
          platform={platform as never}
          size={18}
          className="text-[color:var(--ink)] transition-colors group-hover:text-[var(--brand-ink)]"
        />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-sm font-semibold text-[color:var(--ink)] group-hover:text-[var(--brand-ink)]">
            {meta.label}
          </span>
          {handle ? (
            <span className="mt-0.5 truncate font-mono text-xs uppercase tracking-[0.16em] text-[color:var(--ink-dim)] group-hover:text-[var(--brand-ink)]/85">
              {handle}
            </span>
          ) : null}
        </span>
        {metric ? (
          <span className="font-mono text-xs tabular-nums text-[color:var(--ink-dim)] group-hover:text-[var(--brand-ink)]">
            {metric}
          </span>
        ) : null}
        <ArrowUpRight
          size={14}
          className="text-[color:var(--ink-dim)] transition-colors group-hover:text-[var(--brand-ink)]"
        />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 py-2.5 transition-all duration-200 hover:-translate-y-px"
      style={{ ["--brand" as string]: meta.brand }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = meta.brand;
        e.currentTarget.style.boxShadow = `inset 0 0 0 1px ${meta.brand}, 0 8px 24px -10px ${meta.brand}88`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "";
        e.currentTarget.style.boxShadow = "";
      }}
    >
      <span
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] transition-colors"
        style={{ color: meta.brand }}
      >
        <SocialIcon platform={platform as never} size={14} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-sm font-semibold text-[color:var(--ink)]">
          {meta.label}
        </span>
        {handle ? (
          <span className="mt-0.5 truncate font-mono text-xs uppercase tracking-[0.16em] text-[color:var(--ink-dim)]">
            {handle}
          </span>
        ) : null}
      </span>
      {metric ? (
        <span className="font-mono text-xs tabular-nums text-[color:var(--ink-dim)]">
          {metric}
        </span>
      ) : null}
      <ArrowUpRight
        size={14}
        className="text-[color:var(--ink-dim)] transition-colors group-hover:text-[var(--brand)]"
      />
    </a>
  );
}
