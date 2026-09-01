import type { Metadata } from "next";
import { BarChartSquare02 } from "@untitledui/icons";
import { MEMBERS } from "@/lib/members";
import { GROUP } from "@/lib/group";
import { Button } from "@/components/base/buttons/button";
import { BadgeWithDot } from "@/components/base/badges/badges";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { PublicMetricsDashboard } from "@/components/metrics/PublicMetricsDashboard";
import { getMetricsDashboard } from "@/lib/metrics-dashboard";

export const metadata: Metadata = {
  title: "Metrics",
  description:
    "Who went live, how long they stayed, and reach across every CORE platform.",
  alternates: { canonical: "/metrics" },
};

export const dynamic = "force-dynamic";

export default async function MetricsPage() {
  const dashboard = await getMetricsDashboard();

  const members = MEMBERS.map((m) => ({
    slug: m.slug,
    name: m.stageName,
    accent: m.accent,
    portrait: m.portrait,
    twitchLogin: m.twitchLogin,
    commName: m.comm.name,
    commLogo: m.comm.logo,
  }));

  return (
    <main className="relative pt-20 md:pt-24">
      <section className="border-b border-secondary">
        <div className="mx-auto max-w-container px-6 py-12 md:px-8 md:py-16">
          <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
                House · Numbers
              </p>
              <h1 className="mt-2 font-display text-[32px] font-semibold tracking-[-0.03em] text-[color:var(--ink)] md:text-[48px]">
                The receipts.
              </h1>
              <p className="mt-3 max-w-[62ch] text-md leading-relaxed text-tertiary">
                Real publishing, livestream, audience, and chat records across CORE.
                This page reads the stored record, so opening it never spends platform credits.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button href="/guide" size="lg" color="primary" iconLeading={<BarChartSquare02 data-icon />}>
                  Open the Guide
                </Button>
                <BadgeWithDot type="pill-color" color="success" size="md">Verified records</BadgeWithDot>
                <a
                  href={GROUP.socials.youtube.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
                >
                  {GROUP.socials.youtube.handle}
                </a>
              </div>
            </div>
            <FeaturedIcon
              icon={BarChartSquare02}
              size="xl"
              theme="modern"
              color="brand"
              className="hidden shrink-0 md:flex"
            />
          </div>
        </div>
      </section>

      <section className="bg-primary">
        <div className="mx-auto max-w-container px-6 py-10 md:px-8 md:py-14">
          <PublicMetricsDashboard dashboard={dashboard} members={members} />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
