import Image from "next/image";
import { PlayCircle } from "@untitledui/icons";
import { BadgeWithDot } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Instagram, TikTok, X, YouTube } from "@/components/foundations/social-icons";
import { getHeroGroupPhoto } from "@/lib/asset-index";
import { getLatestPlatformTotalsForSlug } from "@/lib/metric-snapshots";

/**
 * CORE home hero — adapted from the vendored UUI split-image template
 * (`components/marketing/header-section/hero-split-image-01.tsx`). Keeps
 * that template's two-column layout, spacing and type scale; swaps the
 * marketing copy for CORE's real voice and the right-hand spirals image
 * for the real group photo.
 *
 * Server component: reads the hero photo off disk/manifest and the latest
 * per-platform group follower totals from `metric_snapshots`. Every read
 * is wrapped so the section degrades to "no chips" rather than throwing.
 */

const compactFormat = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return Math.round(n).toLocaleString("en-US");
};

type ChipDef = {
  platform: string;
  label: string;
  Icon: (props: { size?: number; className?: string }) => React.ReactElement;
  /** Real platform brand color for the logo. */
  iconClassName: string;
};

// Order + platform-key mapping for the follower chips. `getLatestPlatform-
// TotalsForSlug` keys by the lowercase platform name used by the snapshot
// writer (youtube / tiktok / instagram / x).
const CHIP_DEFS: ChipDef[] = [
  { platform: "youtube", label: "YouTube", Icon: YouTube, iconClassName: "text-[#FF0033]" },
  { platform: "tiktok", label: "TikTok", Icon: TikTok, iconClassName: "text-primary" },
  { platform: "instagram", label: "Instagram", Icon: Instagram, iconClassName: "text-[#E1306C]" },
  { platform: "x", label: "X", Icon: X, iconClassName: "text-primary" },
];

export async function HeroSplit() {
  const heroPhoto = getHeroGroupPhoto();

  let totals = new Map<string, number>();
  try {
    totals = await getLatestPlatformTotalsForSlug("__group__");
  } catch {
    totals = new Map();
  }

  const chips = CHIP_DEFS.map((def) => ({ ...def, count: totals.get(def.platform) ?? 0 })).filter(
    (c) => c.count > 0,
  );

  return (
    <section className="relative isolate overflow-hidden bg-primary py-16 md:py-24">
      {/* Premium Ironbow ambiance — soft contained glows, no full-page grain. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute -left-40 -top-40 size-[560px] rounded-full opacity-25 blur-[120px]"
          style={{ background: "radial-gradient(circle, #db0368, transparent 70%)" }}
        />
        <div
          className="absolute -right-40 top-1/4 size-[560px] rounded-full opacity-20 blur-[120px]"
          style={{ background: "radial-gradient(circle, #760299, transparent 70%)" }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-px"
          style={{ background: "linear-gradient(to right, transparent, rgba(219,3,104,0.45), transparent)" }}
        />
      </div>
      <div className="mx-auto grid max-w-container grid-cols-1 items-center gap-10 px-6 md:px-8 lg:grid-cols-2 lg:gap-16">
        {/* LEFT — copy */}
        <div className="flex flex-col items-start">
          <BadgeWithDot size="lg" color="brand" type="modern">
            Creator collective · Est. 2026
          </BadgeWithDot>

          <h1 className="mt-5 text-display-md font-semibold tracking-tight text-primary md:text-display-lg">
            Six creators. <span className="gradient-text">One house.</span>
          </h1>
          <p className="mt-4 max-w-lg text-lg text-balance text-tertiary md:mt-6 md:text-xl">
            Six creators under one roof, and we own everything we make. You found us early —
            and that&apos;s the best time to be here.
          </p>

          <div className="mt-8 flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center md:mt-10">
            <Button size="xl" href="#members">
              Meet the members
            </Button>
            <Button size="xl" color="link-color" href="/videos" iconLeading={<PlayCircle className="size-5" />}>
              Watch the latest
            </Button>
          </div>

          {chips.length > 0 && (
            <ul className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 md:mt-10">
              {chips.map(({ platform, label, Icon, iconClassName, count }) => (
                <li key={platform} className="flex items-center gap-2">
                  <Icon size={20} className={iconClassName} />
                  <span className="text-sm text-tertiary">
                    <span className="font-semibold text-primary">{compactFormat(count)}</span>{" "}
                    {label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* RIGHT — square group photo */}
        <div className="w-full lg:justify-self-end">
          <div className="group relative mx-auto aspect-square w-full max-w-[540px] overflow-hidden rounded-3xl ring-1 ring-secondary shadow-xl">
            <Image
              src={heroPhoto}
              alt="The CORE collective"
              fill
              priority
              sizes="(min-width: 1024px) 540px, 100vw"
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
