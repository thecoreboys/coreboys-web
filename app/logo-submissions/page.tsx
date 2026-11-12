import { withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { LogoSubmissionsClient } from "@/components/logo-submissions/LogoSubmissionsClient";
import { PageHeader } from "@/components/ui/PageHeader";
import { SiteFooter } from "@/components/chrome/SiteFooter";

export const metadata: Metadata = withPageMetadata("/logo-submissions", {
  title: "CORE Logo Archive",
  description: "Explore approved CORE logo designs from the community. Browse the fan-made logo archive and discover artwork inspired by The Core Boys.",
  alternates: { canonical: "/logo-submissions" },
});
export default function LogoSubmissionsPage() { return <><PageHeader eyebrow="CORE" title="CORE Logo Archive." supporting="A public record of logo work submitted to CORE and approved for display." /><div className="mx-auto max-w-container px-6 py-12 md:px-8 md:py-16"><LogoSubmissionsClient /></div><SiteFooter /></>; }
