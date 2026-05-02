import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AuthGate } from "@/components/admin/AuthGate";
import { ArticlesTable } from "@/components/admin/ArticlesTable";

export const metadata: Metadata = {
  title: "Admin · Articles",
  robots: { index: false, follow: false },
};

export default function AdminArticlesPage() {
  return (
    <AuthGate>
      <main className="relative pt-20 md:pt-24">
        <section className="relative mx-auto max-w-[1440px] px-6 py-10 md:px-8 md:py-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Link
                href="/admin"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
              >
                ← Admin
              </Link>
              <p className="mt-2 eyebrow">Admin · Articles</p>
              <h1 className="mt-2 text-display text-[clamp(28px,3.6vw,44px)] font-black tracking-[-0.04em] text-[color:var(--ink)]">
                Manage articles.
              </h1>
              <p className="mt-2 max-w-[60ch] text-[14px] text-[color:var(--ink-dim)]">
                Drafts saved from the Tiptap editor. Phase 4 swaps for{" "}
                <code className="font-mono">GET /v1/posts</code>.
              </p>
            </div>
            <Link href="/admin/articles/new" className="btn btn-primary">
              <Plus size={14} /> Write article
            </Link>
          </div>
        </section>

        <section className="border-t border-[color:var(--rule)]">
          <div className="mx-auto max-w-[1440px] px-6 py-8 md:px-8 md:py-12">
            <ArticlesTable />
          </div>
        </section>
      </main>
    </AuthGate>
  );
}
