import Image from "next/image";
import Link from "next/link";
import { PlayCircle } from "lucide-react";
import { getHeroGroupPhoto } from "@/lib/asset-index";
import { fetchUsersByLogin } from "@/lib/twitch";
import { fetchSocialCount } from "@/lib/social-fetch";
import { MEMBERS } from "@/lib/members";
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

  // Look up Twitch profile pics server-side. Falls back to portrait
  // if the lookup fails (no env, no creds, etc.).
  let avatars: Record<string, string> = {};
  try {
    const users = await fetchUsersByLogin(MEMBERS.map((m) => m.twitchLogin));
    for (const [login, u] of Object.entries(users)) {
      if (u.profile_image_url) avatars[login] = u.profile_image_url;
    }
  } catch {
    avatars = {};
  }

  // Group-account follower counts (YT subs, TikTok / IG / X followers)
  // for the floating chips in the hero. Cached 6h via Social Fetch.
  const [ytSubs, ttFollowers, igFollowers, xFollowers] = await Promise.all([
    fetchSocialCount("youtube", GROUP.socials.youtube.handle, GROUP.socials.youtube.url),
    fetchSocialCount("tiktok", GROUP.socials.tiktok.handle),
    fetchSocialCount("instagram", GROUP.socials.instagram.handle),
    fetchSocialCount("x", GROUP.socials.x.handle),
  ]);
  const floatingCounts: FloatingCountItem[] = (
    [
      {
        platform: "youtube" as const,
        count: ytSubs ?? 0,
        handle: GROUP.socials.youtube.handle,
        brand: "#FF0033",
        unit: "subs",
        href: GROUP.socials.youtube.url,
      },
      {
        platform: "tiktok" as const,
        count: ttFollowers ?? 0,
        handle: GROUP.socials.tiktok.handle,
        brand: "#FE2C55",
        unit: "followers",
        href: GROUP.socials.tiktok.url,
      },
      {
        platform: "instagram" as const,
        count: igFollowers ?? 0,
        handle: GROUP.socials.instagram.handle,
        brand: "#E1306C",
        unit: "followers",
        href: GROUP.socials.instagram.url,
      },
      {
        platform: "x" as const,
        count: xFollowers ?? 0,
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
            "radial-gradient(70% 60% at 22% 30%, rgba(239,68,68,0.18), transparent 60%), radial-gradient(40% 35% at 78% 12%, rgba(99,102,241,0.10), transparent 70%), radial-gradient(50% 40% at 90% 110%, rgba(239,68,68,0.10), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-12 h-[420px] w-[420px] rounded-full"
        style={{
          background: "radial-gradient(closest-side, rgba(239,68,68,0.55), transparent 70%)",
          filter: "blur(80px)",
          mixBlendMode: "screen",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 top-40 h-[300px] w-[300px] rounded-full"
        style={{
          background: "radial-gradient(closest-side, rgba(255,180,140,0.35), transparent 70%)",
          filter: "blur(70px)",
          mixBlendMode: "screen",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(to right, transparent 0%, rgba(239,68,68,0.6) 30%, rgba(99,102,241,0.4) 70%, transparent 100%)",
        }}
      />

      <div className="relative mx-auto max-w-[1440px] px-6 pt-24 pb-16 md:px-8 md:pt-32 md:pb-24">
        <div className="grid grid-cols-12 gap-8 lg:gap-12">
          <div className="col-span-12 corp-reveal lg:col-span-7">
            {/* Status row — "live now" indicator if anyone is streaming. */}
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--ink-dim)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--success)] core-pulse" aria-hidden />
              <span>Content Organization · Est. 2026</span>
            </div>

            {/* Wordmark — single-word "CORE" hero. */}
            <h1 className="mt-7">
              <span
                className="block font-logo text-[clamp(72px,11vw,180px)] leading-[0.84] tracking-[-0.04em] text-[color:var(--ink)]"
                style={{
                  textShadow:
                    "0 0 28px rgba(244,244,245,0.45), 0 0 8px rgba(244,244,245,0.35), 0 2px 30px rgba(0,0,0,0.6)",
                }}
              >
                CORE
              </span>
            </h1>

            <p className="mt-3 max-w-[28ch] text-[clamp(18px,2vw,26px)] font-semibold leading-[1.25] tracking-[-0.01em] text-[color:var(--ink)]">
              Create. Own. <span className="text-[color:var(--core)]">Run Everything.</span>
            </p>

            <div className="mt-5">
              <HeroFloatingCounts items={floatingCounts} />
            </div>

            <p className="mt-6 max-w-[60ch] text-[16px] leading-relaxed text-[color:var(--ink-dim)] md:text-[17px]">
              Built, owned and run by the people on screen.
              <br />
              Marlon, StableRonaldo, Adapt, JasonTheWeen, Lacy and Silky.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="#members" className="btn btn-secondary">
                Meet the boys
              </Link>
              <a
                href="https://youtu.be/Wrc7pCsGKTI"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-2 text-[13px] font-medium text-[color:var(--ink-dim)] transition-colors hover:text-[color:var(--ink)] cursor-pointer"
              >
                <PlayCircle size={14} />
                House tour
              </a>
            </div>

            {/* Roster strip — Twitch profile pictures */}
            <ul className="mt-12 grid grid-cols-6 gap-2 border-t border-[color:var(--rule)] pt-6">
              {MEMBERS.map((m) => {
                const avatar = m.portrait ?? avatars[m.twitchLogin.toLowerCase()];
                return (
                  <li key={m.slug}>
                    <Link
                      href={`/m/${m.slug}` as `/m/${string}`}
                      className="group flex flex-col items-start gap-2 cursor-pointer"
                    >
                      <span
                        className="relative aspect-square w-full overflow-hidden rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] transition-colors group-hover:border-[var(--card-accent)]"
                        style={{ ["--card-accent" as string]: m.accent }}
                      >
                        <Image
                          src={avatar}
                          alt={m.stageName}
                          fill
                          sizes="80px"
                          unoptimized
                          className="object-cover grayscale-[0.35] transition duration-500 group-hover:grayscale-0 group-hover:scale-105"
                        />
                      </span>
                      <span className="hidden truncate text-[11px] font-medium text-[color:var(--ink-dim)] transition-colors group-hover:text-[color:var(--ink)] sm:block">
                        {m.stageName.split(" ")[0]}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div
            className="col-span-12 corp-reveal lg:col-span-5"
            style={{ animationDelay: "200ms" }}
          >
            {/* Group photo — tall portrait card on the right. */}
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl border border-[color:var(--rule)] bg-black media-tone image-grain">
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
                <span className="rounded-md border border-white/15 bg-black/55 px-2 py-1 text-[10px] font-bold tracking-tight text-on-image-dim backdrop-blur">
                  CORE
                </span>
                <span className="rounded-md border border-white/15 bg-black/55 px-2 py-1 text-[10px] font-bold tracking-tight text-on-image-dim backdrop-blur">
                  6 / 6
                </span>
              </div>
              <div className="absolute inset-x-4 bottom-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-on-image-dim">
                  House · Roll call
                </p>
                <p className="mt-1 text-[18px] font-bold leading-tight text-on-image">
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
