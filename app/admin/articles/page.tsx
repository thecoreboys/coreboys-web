import type { Metadata } from "next";
import { Plus } from "@untitledui/icons";
import { AuthGate } from "@/components/admin/AuthGate";
import { ArticlesTable } from "@/components/admin/ArticlesTable";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/base/buttons/button";

export const metadata: Metadata = {
  title: "Admin · Articles",
  robots: { index: false, follow: false },
};

export default function AdminArticlesPage() {
  return (
    <AuthGate>
      <main className="relative min-h-screen bg-secondary pt-20 md:pt-24">
        <AdminPageHeader
          eyebrow="Admin · Articles"
          title="Articles."
          supporting="Write a new piece, or edit / preview / delete existing drafts and publishes."
          actions={
            <Button href="/admin/articles/new" size="lg" color="primary" iconLeading={<Plus className="size-5" />}>
              New article
            </Button>
          }
        />

        <section className="border-t border-secondary">
          <div className="mx-auto max-w-container px-6 py-8 md:px-8 md:py-12">
            <ArticlesTable />
          </div>
        </section>
      </main>
    </AuthGate>
  );
}
