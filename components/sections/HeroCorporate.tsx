import Image from "next/image";
import { PlayCircle } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Badge, BadgeWithDot } from "@/components/base/badges/badges";
import { getHeroGroupPhoto } from "@/lib/asset-index";
import { getLatestPlatformTotalsForSlug } from "@/lib/metric-snapshots";
import { GROUP } from "@/lib/group";
import { BroadcastOrbClient } from "@/components/three/BroadcastOrbDynamic";
import {
  HeroFloatingCounts,
  type FloatingCountItem,
} from "@/components/sections/HeroFloatingCounts";

/**
 * Corporate dark hero. Two-column at lg+. Wordmark stack:
 *
 *   THE                       <- mono eyebrow over CORE
 *   CORE  BOYS                <- giant "CORE", smaller "BOYS" baseline-aligned
 *
 * Twitch profile pictures populate the small roster strip; the larger
 * group photo on the right uses the synced asset.
 */
export async function HeroCorporate() {
  const groupPhoto = getHeroGroupPhoto();

  // Group-account follower counts come from the metric_snapshots table
  // (written nightly by the cron-snapshot job, with API → scrape
  // fallback). No live API on the render path so the page stays fast
  // and the chips don't disappear when the upstream is degraded.
  const groupCounts = await getLatestPlatformTotalsForSlug("__group__");
  const floatingCounts: FloatingCountItem[] = (
    [
      {
        platform: "youtube" as const,
        count: groupCounts.get("youtube") ?? 0,
        handle: GROUP.socials.youtube.handle,
        brand: "#FF0033",
        unit: "subs",
        href: GROUP.socials.youtube.url,
      },
      {
        platform: "tiktok" as const,
        count: groupCounts.get("tiktok") ?? 0,
        handle: GROUP.socials.tiktok.handle,
        brand: "#FE2C55",
        unit: "followers",
        href: GROUP.socials.tiktok.url,
      },
      {
        platform: "instagram" as const,
        count: groupCounts.get("instagram") ?? 0,
        handle: GROUP.socials.instagram.handle,
        brand: "#E1306C",
        unit: "followers",
        href: GROUP.socials.instagram.url,
      },
      {
        platform: "x" as const,
        count: groupCounts.get("x") ?? 0,
        handle: GROUP.socials.x.handle,
        brand: "#FFFFFF",
        unit: "followers",
        href: GROUP.socials.x.url,
      },
    ] satisfies FloatingCountItem[]
  ).filter((item) => item.count > 0);

  return (
    <section className="relative overflow-hidden border-b border-[color:var(--rule)] bg-dot-grid">
      {/* 3D orb — full-bleed background, behind the wordmark. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-65"
      >
        <BroadcastOrbClient />
      </div>

      {/* Atmospheric layer — soft radials + a blurred lens-flare orb. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 60% at 22% 30%, rgba(219,3,104,0.16), transparent 60%), radial-gradient(40% 35% at 78% 12%, rgba(168,10,143,0.12), transparent 70%), radial-gradient(50% 40% at 90% 110%, rgba(219,3,104,0.10), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-12 h-[420px] w-[420px] rounded-full"
        style={{
          background: "radial-gradient(closest-side, rgba(219,3,104,0.50), transparent 70%)",
          filter: "blur(80px)",
          mixBlendMode: "screen",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 top-40 h-[300px] w-[300px] rounded-full"
        style={{
          background: "radial-gradient(closest-side, rgba(118,2,153,0.35), transparent 70%)",
          filter: "blur(70px)",
          mixBlendMode: "screen",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(to right, transparent 0%, rgba(219,3,104,0.6) 30%, rgba(168,10,143,0.45) 70%, transparent 100%)",
        }}
      />

      <div className="relative mx-auto max-w-container px-6 pt-20 pb-16 md:px-8 md:pt-32 md:pb-24">
        <div className="grid grid-cols-12 items-center gap-8 lg:gap-12">
          <div className="col-span-12 corp-reveal flex flex-col justify-center lg:col-span-7">
            {/* Status row — "live now" indicator if anyone is streaming. */}
            <div>
              <BadgeWithDot type="pill-color" color="success" size="md">
                Content Organization · Est. 2026
              </BadgeWithDot>
            </div>

            {/* Wordmark — single-word "CORE" hero. Filled with the animated
                Ironbow gradient so it reads premium in BOTH themes (the old
                white-glow textShadow only worked on the dark canvas). The
                -webkit-text-stroke from .font-logo is cleared so the gradient
                fills the glyph cleanly. */}
            <h1 className="mt-7">
              <span
                className="gradient-text-core block font-logo text-[clamp(72px,11vw,180px)] leading-[0.84] tracking-[-0.04em]"
                style={{ WebkitTextStroke: "0" }}
              >
                CORE
              </span>
            </h1>

            <p className="mt-3 max-w-[28ch] text-[clamp(18px,2vw,26px)] font-semibold leading-[1.25] tracking-[-0.01em] text-[color:var(--ink)]">
              Create. Own.{" "}
              <span className="gradient-text-core">Run. Everything.</span>
            </p>

            <div className="mt-5">
              <HeroFloatingCounts items={floatingCounts} />
            </div>

            <p className="mt-6 max-w-[60ch] text-lg text-[color:var(--ink-dim)]">
              Built, owned and run by the people on screen.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button href="#members" color="primary" size="lg">
                Meet the boys
              </Button>
              <Button
                href="https://youtu.be/Wrc7pCsGKTI"
                target="_blank"
                rel="noopener noreferrer"
                color="link-gray"
                size="lg"
                iconLeading={<PlayCircle className="size-5" />}
              >
                House tour
              </Button>
            </div>

          </div>

          <div
            className="col-span-12 corp-reveal lg:col-span-5"
            style={{ animationDelay: "200ms" }}
          >
            {/* Group photo — tall portrait card on the right. */}
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-black ring-1 ring-inset ring-[color:var(--rule)] shadow-lg media-tone image-grain">
              <Image
                src={groupPhoto}
                alt="The CORE house"
                fill
                priority
                unoptimized
                sizes="(max-width: 1024px) 100vw, 42vw"
                className="object-cover"
                style={{ objectPosition: "50% 35%" }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(8,8,10,0.0) 45%, rgba(8,8,10,0.92) 100%)",
                }}
              />
              <div className="absolute inset-x-4 top-4 flex items-center justify-between">
                <Badge type="modern" color="gray" size="sm">
                  CORE
                </Badge>
                <Badge type="modern" color="gray" size="sm">
                  6 / 6
                </Badge>
              </div>
              <div className="absolute inset-x-4 bottom-4">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-on-image-dim">
                  House · Roll call
                </p>
                <p className="mt-1 text-lg font-semibold leading-tight text-on-image">
                  Six creators. One house.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
