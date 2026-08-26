import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AuthGate } from "@/components/admin/AuthGate";
import { XNominationsReviewer } from "@/components/admin/XNominationsReviewer";

export const metadata: Metadata = { title: "Admin · X", robots: { index: false, follow: false } };

export default function AdminXPage() {
  return (
    <AuthGate>
      <main className="relative min-h-screen bg-secondary pt-20 md:pt-24">
        <AdminPageHeader
          eyebrow="Admin · X"
          title="X posts and API usage"
          supporting="Review nominated posts, choose featured embeds, inspect the shared cache, and keep API reads under the monthly limit. This tool never publishes to X."
        />
        <section className="border-t border-secondary"><div className="mx-auto max-w-container px-6 py-10 md:px-8 md:py-14"><XNominationsReviewer /></div></section>
      </main>
    </AuthGate>
  );
}
