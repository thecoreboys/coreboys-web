import type { Metadata } from "next";
import { AuthGate } from "@/components/admin/AuthGate";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { PollsManager } from "@/components/admin/PollsManager";

export const metadata: Metadata = {
  title: "Admin · Polls",
  robots: { index: false, follow: false },
};

export default function AdminPollsPage() {
  return (
    <AuthGate>
      <main className="relative min-h-screen bg-secondary pt-20 md:pt-24">
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
      </main>
    </AuthGate>
  );
}
