import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ContributorInbox } from "@/components/admin/ContributorInbox";
export const metadata: Metadata = { title: "Admin · Community applications", robots: { index: false, follow: false } };
export default function ContributorsPage() {
  return <div className="min-h-[var(--page-min-height)] bg-secondary"><AdminPageHeader eyebrow="Admin · Community" title="People who want to help." supporting="Review skills, portfolios, and contact details in one private inbox." /><section className="border-t border-secondary"><div className="mx-auto max-w-5xl px-5 py-10 md:px-8"><ContributorInbox /></div></section></div>;
}
