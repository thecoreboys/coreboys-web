import { withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AuthGate } from "@/components/admin/AuthGate";
import { PostcardReviewQueue } from "@/components/admin/PostcardReviewQueue";

export const metadata: Metadata = withPageMetadata("/admin/postcards", {
  title: "Admin · Postcard review",
  robots: { index: false, follow: false },
  description: "Private CORE staff tools. Staff sign-in is required to manage site content and settings.",
});

export default function AdminPostcardsPage() {
  return (
    <AuthGate>
      <div className="relative min-h-[var(--page-min-height)] bg-secondary">
        <AdminPageHeader
          eyebrow="Admin · Postcard review"
          title="Custom artwork holds."
          supporting="Review the exact frozen print proof, every submitted photo, and any private signature. Approvals go to the mail provider; declines refund the original payment."
        />

        <section className="border-t border-secondary">
          <div className="mx-auto max-w-container px-6 py-10 md:px-8 md:py-14">
            <PostcardReviewQueue />
          </div>
        </section>
      </div>
    </AuthGate>
  );
}
