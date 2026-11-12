import { withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ContributorInbox } from "@/components/admin/ContributorInbox";
export const metadata: Metadata = withPageMetadata("/admin/contributors", {
  title: "Admin · Community applications",
  robots: { index: false, follow: false },
  description: "Private CORE staff tools. Staff sign-in is required to manage site content and settings.",
});
export default function ContributorsPage() {
  return <div className="min-h-[var(--page-min-height)] bg-secondary"><AdminPageHeader eyebrow="Admin · Community" title="People who want to help." supporting="Review skills, portfolios, and contact details in one private inbox." /><section className="border-t border-secondary"><div className="mx-auto max-w-5xl px-5 py-10 md:px-8"><ContributorInbox /></div></section></div>;
}
