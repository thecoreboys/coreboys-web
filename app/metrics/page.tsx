import type { Metadata } from "next";
import { BarChartSquare02 } from "@untitledui/icons";
import { MEMBERS } from "@/lib/members";
import { GROUP } from "@/lib/group";
import { Button } from "@/components/base/buttons/button";
import { BadgeWithDot } from "@/components/base/badges/badges";
import { PageHeader } from "@/components/ui/PageHeader";
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
    <div className="metrics-page relative">
      <PageHeader
        eyebrow="House · Numbers"
        title="The receipts."
        supporting="Real publishing, livestream, audience, and chat records across CORE."
        actions={
          <Button href="/guide" size="lg" color="primary" iconLeading={<BarChartSquare02 data-icon />}>
            Open the Guide
          </Button>
        }
        meta={
          <div className="metrics-page__meta flex flex-wrap items-center gap-3">
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
        }
      />

      <section className="metrics-page__content bg-primary">
        <div className="mx-auto max-w-container px-6 py-10 md:px-8 md:py-14">
          <PublicMetricsDashboard dashboard={dashboard} members={members} />
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
