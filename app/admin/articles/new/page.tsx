import type { Metadata } from "next";
import { AuthGate } from "@/components/admin/AuthGate";
import { ArticleEditor } from "@/components/admin/ArticleEditor";

export const metadata: Metadata = {
  title: "Write article — Admin",
  robots: { index: false, follow: false },
};

export default function NewArticlePage() {
  return (
    <AuthGate>
      <main className="relative pt-20 md:pt-24">
        <section className="relative mx-auto max-w-[920px] px-6 py-12 md:px-8 md:py-16">
          <p className="eyebrow">Admin · Articles</p>
          <h1 className="mt-2 text-display text-[clamp(28px,3.6vw,44px)] font-black tracking-[-0.04em] text-[color:var(--ink)]">
            Write an article.
          </h1>
          <p className="mt-3 max-w-[60ch] text-[14px] leading-relaxed text-[color:var(--ink-dim)]">
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
