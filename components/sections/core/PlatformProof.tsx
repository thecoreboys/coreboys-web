import { PlatformLogo, PLATFORM_BRAND } from "@/components/clips/PlatformLogo";
import { ArrowUpRight } from "@untitledui/icons";
import { GROUP } from "@/lib/group";
import {
  getOrgFollowerTotals,
  getLatestPlatformTotalsForSlug,
} from "@/lib/metric-snapshots";

/**
 * "Find us on every platform" — a bold Ironbow brand band. (The UUI
 * `bg-brand-section` token collapses to a plain neutral in dark mode, so we
 * paint the brand gradient directly to keep this a real, premium-looking
 * branded section.) Real CORE platform marks as cards, each linking to the
 * live account, with combined reach + per-platform follower counts pulled
 * from `metric_snapshots` (resilient — degrades to no numbers).
 */
function compact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
    .format(n)
    .replace(/\.0([KMB])/, "$1");
}

type PlatformKey = "youtube" | "twitch" | "tiktok" | "instagram" | "x";

const PLATFORMS: Array<{ key: PlatformKey; label: string; url?: string }> = [
  { key: "youtube", label: "YouTube", url: GROUP.socials.youtube.url },
  { key: "twitch", label: "Twitch", url: "/chat" },
  { key: "tiktok", label: "TikTok", url: GROUP.socials.tiktok.url },
  { key: "instagram", label: "Instagram", url: GROUP.socials.instagram.url },
  { key: "x", label: "X", url: GROUP.socials.x.url },
];

const BRAND_BG = "var(--ironbow-band)";

export async function PlatformProof() {
  const [followerTotals, groupTotals] = await Promise.all([
    getOrgFollowerTotals(),
    getLatestPlatformTotalsForSlug("__group__"),
  ]);

  return (
    <section className="relative isolate overflow-hidden py-16 md:py-24" style={{ background: BRAND_BG }}>
      {/* soft depth highlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-1/3 left-1/2 -z-10 size-[680px] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.18), transparent 65%)" }}
      />

      <div className="mx-auto max-w-container px-6 md:px-8">
        <div className="flex flex-col items-center gap-10 text-center">
          <div className="flex max-w-2xl flex-col items-center gap-3">
            <p className="text-sm font-semibold text-white/70">Wherever you watch</p>
            <h2 className="text-display-sm font-semibold tracking-tight text-white md:text-display-md">
              Find us on every platform.
            </h2>
            <p className="text-lg text-white/80">
              {followerTotals.hasData ? (
                <>
                  <span className="font-semibold text-white">{compact(followerTotals.total)}</span>{" "}
                  of you already follow along across every channel. Wherever you watch, we&apos;re right there with you.
                </>
              ) : (
                <>Wherever you like to watch, that&apos;s where we are. Pick your platform and come hang out.</>
              )}
            </p>
          </div>

          {/* Platform cards */}
          <ul className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 md:max-w-4xl md:grid-cols-5 md:gap-4">
            {PLATFORMS.map(({ key, label, url }) => {
              const count = groupTotals.get(key) ?? 0;
              const external = url?.startsWith("http");
              return (
                <li key={key}>
                  <a
                    href={url}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noopener noreferrer" : undefined}
                    aria-label={`CORE on ${label}`}
                    className="group flex h-full flex-col items-center gap-2 rounded-2xl bg-white/10 px-4 py-5 ring-1 ring-inset ring-white/15 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/15 hover:ring-white/25"
                  >
                    <span
                      className="text-white transition group-hover:scale-110"
                      style={key === "x" ? undefined : { color: PLATFORM_BRAND[key] }}
                    >
                      <PlatformLogo platform={key} size={32} />
                    </span>
                    <span className="mt-1 flex items-center gap-0.5 text-sm font-semibold text-white">
                      {label}
                      <ArrowUpRight className="size-3.5 opacity-0 transition group-hover:opacity-70" />
                    </span>
                    {count > 0 ? (
                      <span className="text-sm font-medium tabular-nums text-white/70">
                        {compact(count)}
                      </span>
                    ) : (
                      <span className="text-sm text-white/40">Follow</span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
