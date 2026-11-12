import { withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { AuthGate } from "@/components/admin/AuthGate";
import { FanzoneReviewer } from "@/components/admin/FanzoneReviewer";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export const metadata: Metadata = withPageMetadata("/admin/fanzone", {
  title: "Admin · Fanzone review",
  robots: { index: false, follow: false },
  description: "Private CORE staff tools. Staff sign-in is required to manage site content and settings.",
});

export default function AdminFanzonePage() {
  return (
    <AuthGate>
      <div className="relative min-h-[var(--page-min-height)] bg-secondary">
        <AdminPageHeader
          eyebrow="Admin · Fanzone review"
          title="Fan-wall submissions."
          supporting="Approve fan-submitted photos for the public Fan Wall, or deny with a reason. Items here come from the /fanzone submit form."
        />

        <section className="border-t border-secondary">
          <div className="mx-auto max-w-container px-6 py-10 md:px-8 md:py-14">
            <FanzoneReviewer />
          </div>
        </section>
      </div>
    </AuthGate>
  );
}
