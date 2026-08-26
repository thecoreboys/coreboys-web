import type { Metadata } from "next";
import { AuthGate } from "@/components/admin/AuthGate";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ConnectedFansDashboard } from "@/components/admin/ConnectedFansDashboard";

export const metadata: Metadata = {
  title: "Admin · Connected fans",
  robots: { index: false, follow: false },
};

export default function AdminFansPage() {
  return (
    <AuthGate>
      <main className="relative min-h-screen bg-secondary pt-20 md:pt-24">
        <AdminPageHeader
          eyebrow="Admin · Connected fans"
          title="Loyalty graph, not a leaderboard."
          supporting="Org-level funnel only. Per-member breakdowns stay in here — they never go on the public /metrics page."
        />
        <section className="border-t border-secondary">
          <div className="mx-auto max-w-container px-6 py-10 md:px-8 md:py-14">
            <ConnectedFansDashboard />
          </div>
        </section>
      </main>
    </AuthGate>
  );
}
