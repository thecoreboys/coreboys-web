import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, Mail } from "lucide-react";
import { MEMBERS, MEMBERS_BY_SLUG } from "@/lib/members";
import {
  formatCount,
  getMemberStats,
  platformLabel,
  type PlatformStat,
} from "@/lib/stats";
import { LiveDot } from "@/components/ui/LiveDot";
import { SocialIcon } from "@/components/ui/SocialIcon";

type Params = { params: Promise<{ slug: string }> };

export const revalidate = 3600;

const BOOKING_EMAIL = process.env.NEXT_PUBLIC_BOOKING_EMAIL ?? "booking@corecrew.org";

export async function generateStaticParams() {
  return MEMBERS.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const member = MEMBERS_BY_SLUG[slug];
  if (!member) return {};
  return {
    title: `${member.stageName} — Numbers`,
    description: `Audience and reach for ${member.stageName}, member of CORE.`,
    alternates: { canonical: `/m/${slug}/numbers` },
    openGraph: {
      title: `${member.stageName} — Numbers`,
      description: `Audience and reach for ${member.stageName}.`,
      url: `/m/${slug}/numbers`,
      type: "profile",
    },
  };
}

export default async function MemberNumbersPage({ params }: Params) {
  const { slug } = await params;
  const member = MEMBERS_BY_SLUG[slug];
  if (!member) notFound();
  const stats = await getMemberStats(slug);
  if (!stats) notFound();

  const headline = stats.headline;
  const yt = stats.platforms.find((p) => p.platform === "youtube");
  const tw = stats.platforms.find((p) => p.platform === "twitch");
  const isLive =
    tw?.recent != null && tw.recent.value > 0 && tw.recent.window === "7d";

  return (
    <div className="relative min-h-screen pb-32">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-[color:var(--rule)] px-6 pb-12 pt-24 md:px-16 md:pb-16 md:pt-32">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            background: `radial-gradient(50% 50% at 30% 50%, ${member.accent}55, transparent 70%)`,
          }}
        />
        <div className="relative mx-auto max-w-[1280px]">
          <Link
            href={`/m/${member.slug}` as Route}
            className="mb-6 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)] hover:text-[color:var(--ink)]"
          >
            <ChevronLeft size={12} /> Back to {member.stageName}
          </Link>

          <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-[auto_1fr]">
            <div
              className="relative h-[180px] w-[140px] shrink-0 overflow-hidden rounded-[8px] border bg-[color:var(--bg-elev)] md:h-[260px] md:w-[200px]"
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
              <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
                CORE / {member.realName}
              </p>
              <h1
                className="mt-2 font-display text-[44px] font-black leading-[0.92] tracking-[-0.04em] md:text-[96px]"
                style={{ color: member.accent }}
              >
                {member.stageName}
              </h1>
              <p className="mt-3 max-w-2xl text-[14px] leading-[1.6] text-[color:var(--ink-dim)] md:text-[16px]">
                {member.bio}
              </p>
              {isLive ? (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[color:var(--core)] bg-[color:var(--core)]/10 px-3 py-1.5">
                  <LiveDot live />
                  <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--core)]">
                    Live now · {formatCount(tw?.recent?.value ?? 0)} watching
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* Headline number */}
      {headline ? (
        <section className="border-b border-[color:var(--rule)] px-6 py-12 md:px-16">
          <div className="mx-auto max-w-[1280px]">
            <p className="kicker text-[10px] text-[color:var(--ink-faint)]">
              {headline.label}
            </p>
            <p
              className="mt-2 font-display text-[64px] font-black leading-[0.92] tracking-[-0.04em] md:text-[120px]"
              style={{ color: "var(--ink)" }}
            >
              {formatCount(headline.value)}
            </p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
              via {platformLabel(headline.platform)} · refreshed hourly
            </p>
          </div>
        </section>
      ) : null}

      {/* Platform breakdown */}
      <section className="border-b border-[color:var(--rule)] px-6 py-14 md:px-16">
        <div className="mx-auto max-w-[1280px]">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
            Platform breakdown
          </p>
          <h2 className="mt-1 font-display text-[28px] font-bold tracking-[-0.02em] md:text-[40px]">
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
      <section className="px-6 py-16 md:px-16 md:py-20">
        <div className="mx-auto max-w-[720px] text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
            Booking
          </p>
          <h2 className="mt-3 font-display text-[36px] font-black leading-[0.95] tracking-[-0.04em] md:text-[56px]">
            Work with {member.stageName}.
          </h2>
          <p className="mt-3 text-[14px] text-[color:var(--ink-dim)]">
            Brand integrations, event activations, content campaigns. Reach the
            org&apos;s booking team — every member shares one inbox.
          </p>
          <div className="mt-5 flex justify-center">
            <a
              href={`mailto:${BOOKING_EMAIL}?subject=Booking%20%E2%80%94%20${encodeURIComponent(member.stageName)}`}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-[color:var(--core)] bg-[color:var(--core)] px-4 text-[12px] uppercase tracking-[0.18em] text-black hover:opacity-90"
            >
              <Mail size={12} /> {BOOKING_EMAIL}
            </a>
          </div>
          <p className="mt-6 text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
            Numbers refreshed{" "}
            {yt?.fetchedAt
              ? new Date(yt.fetchedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
              : "—"}
          </p>
        </div>
      </section>
    </div>
  );
}

function PlatformCard({ stat, accent }: { stat: PlatformStat; accent: string }) {
  return (
    <li className="rounded-[10px] border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <SocialIcon platform={stat.platform as never} className="h-4 w-4" />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ink-faint)]">
            {platformLabel(stat.platform)}
          </span>
        </div>
        <FreshnessChip freshness={stat.freshness} />
      </div>
      <p
        className="mt-3 font-display text-[36px] font-black leading-none tracking-[-0.02em]"
        style={{ color: stat.followers != null ? accent : "var(--ink-dim)" }}
      >
        {formatCount(stat.followers ?? stat.recent?.value ?? null)}
      </p>
      <p className="mt-1 text-[11px] text-[color:var(--ink-dim)]">
        {stat.followers != null ? "followers" : stat.recent != null ? "concurrent viewers" : "no public number"}
      </p>
      <a
        href={stat.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--ink-dim)] hover:text-[color:var(--core)]"
      >
        {stat.handle} <ArrowUpRight size={11} />
      </a>
    </li>
  );
}

function FreshnessChip({ freshness }: { freshness: PlatformStat["freshness"] }) {
  const map = {
    live: { label: "live", className: "border-[color:var(--core)] text-[color:var(--core)]" },
    stale: { label: "stale", className: "border-amber-400/60 text-amber-300" },
    manual: { label: "manual", className: "border-[color:var(--rule)] text-[color:var(--ink-dim)]" },
  } as const;
  const { label, className } = map[freshness];
  return (
    <span
      className={`inline-flex h-5 items-center rounded-[4px] border bg-transparent px-1.5 font-mono text-[9px] uppercase tracking-[0.14em] ${className}`}
    >
      {label}
    </span>
  );
}
