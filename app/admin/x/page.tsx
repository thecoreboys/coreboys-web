import { withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AuthGate } from "@/components/admin/AuthGate";
import { XNominationsReviewer } from "@/components/admin/XNominationsReviewer";

export const metadata: Metadata = withPageMetadata("/admin/x", {
  title: "Admin · X",
  robots: { index: false, follow: false },
  description: "Private CORE staff tools. Staff sign-in is required to manage site content and settings.",
});

export default function AdminXPage() {
  return (
    <AuthGate>
      <div className="relative min-h-[var(--page-min-height)] bg-secondary">
        <AdminPageHeader
          eyebrow="Admin · X"
          title="X posts and API usage"
          supporting="Review nominated posts, choose featured embeds, inspect the shared cache, and keep API reads under the monthly limit. This tool never publishes to X."
        />
        <section className="border-t border-secondary"><div className="mx-auto max-w-container px-6 py-10 md:px-8 md:py-14"><XNominationsReviewer /></div></section>
      </div>
    </AuthGate>
  );
}
