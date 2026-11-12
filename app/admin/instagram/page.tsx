import { withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { AuthGate } from "@/components/admin/AuthGate";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { InstagramSourcesManager } from "@/components/media/InstagramSourcesManager";

export const metadata: Metadata = withPageMetadata("/admin/instagram", {
  title: "Admin · Instagram sources",
  robots: { index: false, follow: false },
  description: "Private CORE staff tools. Staff sign-in is required to manage site content and settings.",
});

export default function AdminInstagramPage() {
  return (
    <AuthGate>
      <div className="relative min-h-[var(--page-min-height)] bg-secondary">
        <AdminPageHeader
          eyebrow="Admin · Instagram"
          title="Instagram sources."
          supporting="Pick which member and group Instagram handles feed the 'From our Instagram' row on the public Photos page. Live photo pulls require the server INSTAGRAM_TOKEN."
        />

        <section className="border-t border-secondary">
          <div className="mx-auto max-w-container px-6 py-10 md:px-8 md:py-14">
            <InstagramSourcesManager />
          </div>
        </section>
      </div>
    </AuthGate>
  );
}
