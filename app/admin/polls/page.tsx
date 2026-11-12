import { withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { AuthGate } from "@/components/admin/AuthGate";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { PollsManager } from "@/components/admin/PollsManager";

export const metadata: Metadata = withPageMetadata("/admin/polls", {
  title: "Admin · Polls",
  robots: { index: false, follow: false },
  description: "Private CORE staff tools. Staff sign-in is required to manage site content and settings.",
});

export default function AdminPollsPage() {
  return (
    <AuthGate>
      <div className="relative min-h-[var(--page-min-height)] bg-secondary">
        <AdminPageHeader
          eyebrow="Admin · Community"
          title="Polls."
          supporting="Create polls and options, open or close voting, and watch live results."
        />

        <section className="border-t border-secondary">
          <div className="mx-auto max-w-container px-6 py-8 md:px-8 md:py-12">
            <PollsManager />
          </div>
        </section>
      </div>
    </AuthGate>
  );
}
