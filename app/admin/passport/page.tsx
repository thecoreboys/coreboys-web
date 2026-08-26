import type { Metadata } from "next";
import { AuthGate } from "@/components/admin/AuthGate";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { PassportControlRoom } from "@/components/admin/passport/PassportControlRoom";
import { NETWORK_CHANNELS } from "@/lib/watch/channels";

export const metadata: Metadata = {
  title: "Admin · CORE Passport",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function PassportAdminPage() {
  return (
    <AuthGate>
      <main className="relative min-h-screen bg-secondary pt-20 md:pt-24">
        <AdminPageHeader
          eyebrow="Admin · CORE Passport"
          title="Live control room."
          supporting="Run a channel safely: staff shifts, polls, verified scores, official moments, reward approvals, freezes, appeals, and a complete action history."
        />
        <section className="border-t border-secondary">
          <div className="mx-auto max-w-container px-4 py-6 sm:px-6 md:px-8 md:py-10">
            <PassportControlRoom
              channels={NETWORK_CHANNELS.map((channel) => ({
                slug: channel.slug,
                name: channel.name,
                community: channel.community,
                host: channel.host,
                accent: channel.accent,
                artwork: channel.artwork,
              }))}
            />
          </div>
        </section>
      </main>
    </AuthGate>
  );
}
