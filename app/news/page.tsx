import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrowserDateTime } from "@/components/ui/BrowserDateTime";
import { getPublishedArticles } from "@/lib/articles";

export const metadata: Metadata = {
  title: "News",
  description: "Notes from the house.",
  alternates: { canonical: "/news" },
};

export const dynamic = "force-dynamic";

export default async function BlogIndexPage() {
  const posts = await getPublishedArticles();

  return (
    <>
      <PageHeader
        eyebrow="Notes"
        title="Notes from the house."
        supporting="Recaps, announcements, and what happened this week."
      />

      {posts.length === 0 ? (
        <section className="border-t border-[color:var(--rule)]">
          <div className="mx-auto max-w-container px-6 py-20 md:px-16">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
              Nothing filed.
            </p>
          </div>
        </section>
      ) : (
        <section className="border-t border-[color:var(--rule)]">
          <div className="mx-auto max-w-container px-6 py-12 md:px-16 md:py-16">
            <ul className="flex flex-col">
              {posts.map((p) => (
                <li key={p.slug} className="border-t border-[color:var(--rule)] first:border-t-0">
                  <Link
                    href={`/news/${p.slug}` as `/news/${string}`}
                    className="group flex flex-col gap-2 py-8 md:flex-row md:items-baseline md:justify-between md:gap-10"
                  >
                    <div>
                      <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
                        {p.category}
                        {p.publishedAt ? (
                          <> · <BrowserDateTime value={p.publishedAt} options={{ month: "short", day: "numeric", year: "numeric" }} fallback="Local date" /></>
                        ) : null}
                      </p>
                      <h2 className="mt-2 font-display text-xl font-semibold tracking-tight text-[color:var(--ink)] md:text-2xl">
                        {p.title}
                      </h2>
                      {p.dek ? (
                        <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-[color:var(--ink-dim)]">
                          {p.dek}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)] group-hover:text-[color:var(--ink)]">
                      Read
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <SiteFooter />
    </>
  );
}
