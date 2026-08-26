import type { Metadata } from "next";
import { AuthGate } from "@/components/admin/AuthGate";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { StaffAccountsManager } from "@/components/admin/StaffAccountsManager";
import { MEMBERS } from "@/lib/members";

export const metadata: Metadata = {
  title: "Admin · Staff accounts",
  robots: { index: false, follow: false },
};

export default function StaffAccountsPage() {
  return (
    <AuthGate>
      <main className="relative min-h-screen bg-secondary pt-20 md:pt-24">
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
      </main>
    </AuthGate>
  );
}
