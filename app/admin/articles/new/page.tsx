import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "@untitledui/icons";
import { AuthGate } from "@/components/admin/AuthGate";
import { ArticleEditor } from "@/components/admin/ArticleEditor";

export const metadata: Metadata = {
  title: "Write article — Admin",
  robots: { index: false, follow: false },
};

export default function NewArticlePage() {
  return (
    <AuthGate>
      <main className="relative min-h-screen bg-secondary pt-20 md:pt-24">
        <section className="relative mx-auto max-w-[920px] px-6 py-12 md:px-8 md:py-16">
          <Link
            href="/admin/articles"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-tertiary transition-colors hover:text-primary"
          >
            <ArrowLeft className="size-4" /> Articles
          </Link>
          <p className="mt-3 text-sm font-semibold text-brand-secondary">Admin · Articles</p>
          <h1 className="mt-1 text-display-sm font-semibold tracking-tight text-primary md:text-display-md">
            Write an article.
          </h1>
          <p className="mt-3 max-w-[60ch] text-md leading-relaxed text-tertiary">
            Tiptap rich-text editor — H1/H2/H3, lists, quotes, images, video embeds, links. Drafts
            persist to <code className="font-mono">localStorage</code> in this Phase-1 stub; Phase
            4 wires <code className="font-mono">POST /v1/posts</code>.
          </p>

          <div className="mt-8">
            <ArticleEditor />
          </div>
        </section>
      </main>
    </AuthGate>
  );
}
