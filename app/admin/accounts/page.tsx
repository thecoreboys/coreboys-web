import { withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { AuthGate } from "@/components/admin/AuthGate";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { StaffAccountsManager } from "@/components/admin/StaffAccountsManager";
import { MEMBERS } from "@/lib/members";

export const metadata: Metadata = withPageMetadata("/admin/accounts", {
  title: "Admin · Staff accounts",
  robots: { index: false, follow: false },
  description: "Private CORE staff tools. Staff sign-in is required to manage site content and settings.",
});

export default function StaffAccountsPage() {
  return (
    <AuthGate>
      <div className="relative min-h-[var(--page-min-height)] bg-secondary">
        <AdminPageHeader
          eyebrow="Admin · Access"
          title="Staff accounts."
          supporting="Create admins or assign a member manager to exactly one community. Deactivation takes effect on their next request."
        />
        <section className="border-t border-secondary">
          <div className="mx-auto max-w-container px-6 py-8 md:px-8 md:py-12">
            <StaffAccountsManager members={MEMBERS.map((member) => ({ slug: member.slug, name: member.stageName }))} />
          </div>
        </section>
      </div>
    </AuthGate>
  );
}
