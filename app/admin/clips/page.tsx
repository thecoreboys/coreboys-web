import type { Metadata } from "next";
import { Plus } from "@untitledui/icons";
import { AuthGate } from "@/components/admin/AuthGate";
import { ReviewQueue } from "@/components/admin/ReviewQueue";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/base/buttons/button";

export const metadata: Metadata = {
  title: "Admin · Clip queue",
  robots: { index: false, follow: false },
};

export default function AdminClipsPage() {
  return (
    <AuthGate>
      <div className="relative min-h-[var(--page-min-height)] bg-secondary">
        <AdminPageHeader
          eyebrow="Admin · Clips"
          title="Clips."
          supporting="Add a clip directly, or review and publish fan submissions to the public library."
          actions={
            <Button href="/admin/clips/new" size="lg" color="primary" iconLeading={<Plus className="size-5" />}>
              Add clip
            </Button>
          }
        />

        <section className="border-t border-secondary">
          <div className="mx-auto max-w-container px-6 py-8 md:px-8 md:py-12">
            <ReviewQueue />
          </div>
        </section>
      </div>
    </AuthGate>
  );
}
