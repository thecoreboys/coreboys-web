import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AuthGate } from "@/components/admin/AuthGate";
import { PostcardReviewQueue } from "@/components/admin/PostcardReviewQueue";

export const metadata: Metadata = {
  title: "Admin · Postcard review",
  robots: { index: false, follow: false },
};

export default function AdminPostcardsPage() {
  return (
    <AuthGate>
      <main className="relative min-h-screen bg-secondary pt-20 md:pt-24">
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
      </main>
    </AuthGate>
  );
}
