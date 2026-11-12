import { withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import { Mail01, ArrowRight } from "@untitledui/icons";
import { MEMBERS } from "@/lib/members";
import { fetchUsersByLogin } from "@/lib/twitch";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { FanWallClient } from "@/components/fanzone/FanWallClient";
import { FanMailDirectory } from "@/components/fanzone/FanMailDirectory";
import { CommunityPolls } from "@/components/community/CommunityPolls";
import { PageHeader } from "@/components/ui/PageHeader";
import { FanZonePulse } from "@/components/fanzone/FanZonePulse";
import { FanZoneNav } from "@/components/fanzone/FanZoneNav";
import { CommunitiesHub } from "@/components/fanzone/CommunitiesHub";

export const metadata: Metadata = withPageMetadata("/fanzone", {
  title: "Fanzone",
  description: "Explore CORE fan communities, creator updates, community polls, fan art, ideas, and fan mail for The Core Boys.",
  alternates: { canonical: "/fanzone" },
});

// Render at request time, not at build. The PO box cards depend on
// Twitch profile pics fetched via TWITCH_CLIENT_* envs which are
// RUN_TIME-scoped on App Platform — a build-time render returns
// empty avatars and the page falls back to local portraits. The 10-
// min ISR cache also pinned that miss in place. Force dynamic so
// the first server render has the secrets available.
export const dynamic = "force-dynamic";

export default async function FanzonePage() {
  let avatars: Record<string, string> = {};
  try {
    const users = await fetchUsersByLogin(MEMBERS.map((m) => m.twitchLogin));
    for (const [login, u] of Object.entries(users)) {
      if (u.profile_image_url) avatars[login] = u.profile_image_url;
    }
  } catch {
    avatars = {};
  }

  const memberOptions = MEMBERS.map((m) => ({
    slug: m.slug,
    stageName: m.stageName,
    accent: m.accent,
    avatarUrl: avatars[m.twitchLogin.toLowerCase()] ?? m.portrait,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Fanzone"
        title="CORE communities"
        supporting="Join a community, follow what is happening, share an idea, or send something to the house."
      />

      <FanZoneNav />
      <FanZonePulse />

      <section id="communities" className="scroll-mt-36 border-t border-secondary">
        <div className="mx-auto max-w-container px-6 py-12 md:px-8 md:py-16">
          <header className="mb-8">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">Find your people</p>
            <h2 className="mt-3 font-display text-[24px] font-semibold tracking-[-0.02em] text-[color:var(--ink)] md:text-[32px]">
              Communities.
            </h2>
            <p className="mt-2 max-w-[64ch] text-base leading-relaxed text-[color:var(--ink-dim)]">
              Choose CORE, Flock, Stable, Thugs, M3, NMS, or SLG to see creator posts and fan contributions.
            </p>
          </header>
          <CommunitiesHub />
        </div>
      </section>

      {/* PO box wall — top */}
      <section id="mail" className="scroll-mt-36 border-t border-secondary bg-secondary">
        <div className="mx-auto max-w-container px-6 py-12 md:px-8 md:py-16">
          <header className="mb-8">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">Mail in</p>
            <h2 className="mt-3 font-display text-[24px] font-semibold tracking-[-0.02em] text-[color:var(--ink)] md:text-[32px]">
              Addresses.
            </h2>
            <p className="mt-2 max-w-[60ch] text-base leading-relaxed text-[color:var(--ink-dim)]">
              Find a creator’s public mailing address and check the details before sending letters, fan art, or packages.
            </p>
            <details className="mt-4 max-w-[680px] rounded-xl border border-secondary bg-primary px-4 py-3">
              <summary className="cursor-pointer list-none text-sm font-semibold text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                Before you mail something
              </summary>
              <div className="mt-3 grid gap-2 border-t border-secondary pt-3 text-sm leading-relaxed text-tertiary sm:grid-cols-2">
                <p>Write the member&apos;s full recipient line exactly as shown and include your return address.</p>
                <p>Use tracked shipping for valuable packages. Never mail cash, perishables, or anything unsafe.</p>
              </div>
            </details>
          </header>

          {/* Buy-a-postcard entry — we print & mail it for you. */}
          <Link
            href="/fan-mail/postcard"
            className="group mb-8 flex flex-col gap-4 rounded-2xl bg-primary p-5 ring-1 ring-inset ring-secondary transition-all hover:-translate-y-0.5 hover:ring-brand-solid/40 sm:flex-row sm:items-center sm:justify-between md:p-6"
          >
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-solid text-white">
                <Mail01 className="size-5" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-secondary">
                  Postcard studio paused
                </p>
                <p className="mt-1 text-lg font-semibold tracking-tight text-primary">
                  Online postcard orders are temporarily unavailable.
                </p>
                <p className="mt-1 text-sm text-tertiary">
                  You can still send fan mail yourself using the addresses below.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-brand-solid px-4 py-2.5 text-sm font-semibold text-white sm:self-center">
              Details <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>

          <FanMailDirectory members={MEMBERS.map((m) => ({
            slug: m.slug,
            stageName: m.stageName,
            realName: m.realName,
            accent: m.accent,
            avatarUrl: avatars[m.twitchLogin.toLowerCase()] ?? m.portrait,
            poBox: m.poBox,
            commLogo: m.comm.logo,
            commName: m.comm.name,
          }))} />
        </div>
      </section>

      {/* Fan wall + Have-a-photo trigger */}
      <section id="wall" className="scroll-mt-36 border-t border-secondary">
        <div className="mx-auto max-w-container px-6 py-12 md:px-8 md:py-16">
          <FanWallClient memberOptions={memberOptions} />
        </div>
      </section>

      {/* Community polls — merged in from the old /community page */}
      <section id="polls" className="scroll-mt-36 border-t border-secondary bg-secondary">
        <div className="mx-auto max-w-container px-6 py-12 md:px-8 md:py-16">
          <header className="mb-8">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">Have your say</p>
            <h2 className="mt-3 font-display text-[24px] font-semibold tracking-[-0.02em] text-[color:var(--ink)] md:text-[32px]">
              Polls.
            </h2>
            <p className="mt-2 max-w-[60ch] text-base leading-relaxed text-[color:var(--ink-dim)]">
              Take part in available community polls and view the results.
            </p>
          </header>
          <CommunityPolls />
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
