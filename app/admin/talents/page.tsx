import type { Metadata } from "next";
import { AuthGate } from "@/components/admin/AuthGate";
import { TalentManager } from "@/components/admin/TalentManager";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export const metadata: Metadata = {
  title: "Admin · Talents",
  robots: { index: false, follow: false },
};

export default function AdminTalentsPage() {
  return (
    <AuthGate>
      <main className="relative min-h-screen bg-secondary pt-20 md:pt-24">
        <AdminPageHeader
          eyebrow="Admin · Talents"
          title="Talent directory."
          supporting="Talents are non-CORE, non-crew people who appear in photos or clips. Add by Twitch handle, or create manually with an uploaded image. AI-discovered socials surface for approve / deny per platform."
        />

        <section className="border-t border-secondary">
          <div className="mx-auto max-w-container px-6 py-8 md:px-8 md:py-12">
            <TalentManager />
          </div>
        </section>
      </main>
    </AuthGate>
  );
}
