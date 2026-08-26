import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Mail01 } from "@untitledui/icons";
import { MEMBERS } from "@/lib/members";
import { Button } from "@/components/base/buttons/button";
import {
  formatCount,
  getMemberStats,
  platformLabel,
  type PlatformStat,
} from "@/lib/stats";
import { LiveDot } from "@/components/ui/LiveDot";
import { SocialIcon } from "@/components/ui/SocialIcon";
import { BrowserDateTime } from "@/components/ui/BrowserDateTime";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MemberPulse } from "@/components/watch/MemberPulse";
import { getMemberWithProfileOverrides } from "@/lib/member-profile-overrides";
import { MemberTwitchTrackerAnalytics } from "@/components/metrics/TwitchTrackerAnalytics";
import { loadMemberTwitchTrackerSummary } from "@/lib/twitchtracker-snapshots";

type Params = { params: Promise<{ slug: string }> };

export const revalidate = 3600;

const BOOKING_EMAIL = process.env.NEXT_PUBLIC_BOOKING_EMAIL ?? "booking@thecoreboys.com";

export async function generateStaticParams() {
  return MEMBERS.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const member = await getMemberWithProfileOverrides(slug);
  if (!member) return {};
  return {
    title: `${member.stageName} — Numbers`,
    description: `Audience and reach for ${member.stageName}, member of CORE.`,
    alternates: { canonical: `/about/${member.slug}/numbers` },
    openGraph: {
      title: `${member.stageName} — Numbers`,
      description: `Audience and reach for ${member.stageName}.`,
      url: `/about/${member.slug}/numbers`,
      type: "profile",
    },
  };
}

export default async function MemberNumbersPage({ params }: Params) {
  const { slug } = await params;
  const member = await getMemberWithProfileOverrides(slug);
  if (!member) notFound();
  const [stats, twitchTrackerSummary] = await Promise.all([
    getMemberStats(slug),
    loadMemberTwitchTrackerSummary(slug).catch(() => null),
  ]);
  if (!stats) notFound();

  const headline = stats.headline;
  const yt = stats.platforms.find((p) => p.platform === "youtube");
  const tw = stats.platforms.find((p) => p.platform === "twitch");
  const isLive =
    tw?.recent != null && tw.recent.value > 0 && tw.recent.window === "7d";

  return (
    <div className="relative min-h-screen pb-32">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-[color:var(--rule)] px-6 pb-12 pt-24 md:px-8 md:pb-16 md:pt-32">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            background: `radial-gradient(50% 50% at 30% 50%, ${member.accent}55, transparent 70%)`,
          }}
        />
        <div className="relative mx-auto max-w-container">
          <Link
            href={`/about/${member.slug}` as Route}
            className="mb-6 inline-flex items-center gap-1 text-sm font-semibold text-tertiary hover:text-primary"
          >
            <ChevronLeft size={14} /> Back to {member.stageName}
          </Link>

          <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-[auto_1fr]">
            <div
              className="relative h-[180px] w-[140px] shrink-0 overflow-hidden rounded-xl border bg-[color:var(--bg-elev)] md:h-[260px] md:w-[200px]"
              style={{ borderColor: member.accent }}
            >
              <Image
                src={member.portrait}
                alt={member.stageName}
                fill
                priority
                sizes="(min-width: 768px) 200px, 140px"
                className="object-cover"
              />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-quaternary">
                CORE / {member.realName}
              </p>
              <h1
                className="mt-2 font-display text-display-md font-bold leading-[0.92] tracking-tight md:text-display-lg"
                style={{ color: member.accent }}
              >
                {member.stageName}
              </h1>
              <p className="mt-3 max-w-2xl text-md leading-relaxed text-tertiary md:text-lg">
                {member.bio}
              </p>
              {isLive ? (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[color:var(--core)] bg-[color:var(--core)]/10 px-3 py-1.5">
                  <LiveDot live />
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--core)]">
                    Live now · {formatCount(tw?.recent?.value ?? 0)} watching
                  </span>
                </div>
              ) : null}
              <MemberPulse slug={member.slug} login={member.twitchLogin} className="mt-3" href="/metrics" />
            </div>
          </div>
        </div>
      </header>

      {/* Headline number */}
      {headline ? (
        <section className="border-b border-[color:var(--rule)] px-6 py-12 md:px-8">
          <div className="mx-auto max-w-container">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-quaternary">
              {headline.label}
            </p>
            <p
              className="mt-2 font-display text-display-xl font-bold leading-[0.92] tracking-tight text-primary md:text-display-2xl"
            >
              {formatCount(headline.value)}
            </p>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
              via {platformLabel(headline.platform)} · refreshed hourly
            </p>
          </div>
        </section>
      ) : null}

      <MemberTwitchTrackerAnalytics
        summary={twitchTrackerSummary}
        memberName={member.stageName}
        accent={member.accent}
      />

      {/* Platform breakdown */}
      <section className="border-b border-[color:var(--rule)] px-6 py-14 md:px-8">
        <div className="mx-auto max-w-container">
          <p className="text-sm font-semibold text-brand-secondary">
            Platform breakdown
          </p>
          <h2 className="mt-1 font-display text-display-sm font-semibold tracking-tight text-primary md:text-display-md">
            Where {member.stageName} ships.
          </h2>

          <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stats.platforms.map((p) => (
              <PlatformCard key={`${p.platform}:${p.url}`} stat={p} accent={member.accent} />
            ))}
          </ul>
        </div>
      </section>

      {/* Press / booking */}
      <section className="px-6 py-16 md:px-8 md:py-20">
        <div className="mx-auto max-w-[720px] text-center">
          <p className="text-sm font-semibold text-brand-secondary">
            Booking
          </p>
          <h2 className="mt-3 font-display text-display-sm font-semibold leading-tight tracking-tight text-primary md:text-display-md">
            Work with {member.stageName}.
          </h2>
          <p className="mt-3 text-md text-tertiary">
            Brand integrations, event activations, content campaigns. Reach the
            org&apos;s booking team — every member shares one inbox.
          </p>
          <div className="mt-5 flex justify-center">
            <Button
              href={`mailto:${BOOKING_EMAIL}?subject=Booking%20%E2%80%94%20${encodeURIComponent(member.stageName)}`}
              size="lg"
              color="primary"
              iconLeading={<Mail01 data-icon />}
            >
              {BOOKING_EMAIL}
            </Button>
          </div>
          <p className="mt-6 text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
            Numbers refreshed{" "}
            {yt?.fetchedAt
              ? <BrowserDateTime value={yt.fetchedAt} fallback="—" />
              : "—"}
          </p>
        </div>
      </section>
    </div>
  );
}

function PlatformCard({ stat, accent }: { stat: PlatformStat; accent: string }) {
  const unit =
    stat.followers != null
      ? "followers"
      : stat.recent != null
        ? "concurrent viewers"
        : "no public number";
  return (
    <li>
      <MetricCard
        icon={<SocialIcon platform={stat.platform as never} className="h-5 w-5" />}
        label={platformLabel(stat.platform)}
        value={formatCount(stat.followers ?? stat.recent?.value ?? null)}
        unit={unit}
        accent={stat.followers != null ? accent : undefined}
        href={stat.url}
        className="h-full"
      />
    </li>
  );
}
