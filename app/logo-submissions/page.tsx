import type { Metadata } from "next";
import { LogoSubmissionsClient } from "@/components/logo-submissions/LogoSubmissionsClient";
import { PageHeader } from "@/components/ui/PageHeader";
import { SiteFooter } from "@/components/chrome/SiteFooter";

export const metadata: Metadata = { title: "CORE Logo Archive", description: "A public archive of approved CORE logo submissions.", alternates: { canonical: "/logo-submissions" } };
export default function LogoSubmissionsPage() { return <><PageHeader eyebrow="CORE" title="CORE Logo Archive." supporting="A public record of logo work submitted to CORE and approved for display." /><main className="mx-auto max-w-container px-6 py-12 md:px-8 md:py-16"><LogoSubmissionsClient /></main><SiteFooter /></>; }
