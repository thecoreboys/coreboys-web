import type { Metadata } from "next";
import { AuthGate } from "@/components/admin/AuthGate";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { InstagramSourcesManager } from "@/components/media/InstagramSourcesManager";

export const metadata: Metadata = {
  title: "Admin · Instagram sources",
  robots: { index: false, follow: false },
};

export default function AdminInstagramPage() {
  return (
    <AuthGate>
      <main className="relative min-h-screen bg-secondary pt-20 md:pt-24">
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
      </main>
    </AuthGate>
  );
}
