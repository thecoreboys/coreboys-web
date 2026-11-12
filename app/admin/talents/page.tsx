import { withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { AuthGate } from "@/components/admin/AuthGate";
import { TalentManager } from "@/components/admin/TalentManager";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export const metadata: Metadata = withPageMetadata("/admin/talents", {
  title: "Admin · Talents",
  robots: { index: false, follow: false },
  description: "Private CORE staff tools. Staff sign-in is required to manage site content and settings.",
});

export default function AdminTalentsPage() {
  return (
    <AuthGate>
      <div className="relative min-h-[var(--page-min-height)] bg-secondary">
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
      </div>
    </AuthGate>
  );
}
