import { absoluteSiteUrl, CORE_SHARE_IMAGE, seoDescription, serializeJsonLd, withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { BrowserDateTime } from "@/components/ui/BrowserDateTime";
import { getPublishedArticle } from "@/lib/articles";

type Params = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";
const loadArticle = cache(getPublishedArticle);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const a = await loadArticle(slug);
  if (!a) return withPageMetadata(`/news/${encodeURIComponent(slug)}`, { title: "News", robots: { index: false, follow: false } });
  return withPageMetadata(`/news/${encodeURIComponent(slug)}`, {
    title: a.title,
    description: a.dek || a.bodyHtml,
    keywords: [a.category, "The Core Boys news", "creator updates"],
    openGraph: { type: "article", publishedTime: a.publishedAt, section: a.category, tags: [a.category, "CORE", "The Core Boys"] },
  });
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  const article = await loadArticle(slug);
  if (!article) notFound();

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd({
        "@context": "https://schema.org", "@type": "Article", headline: article.title,
        description: seoDescription(article.dek || article.bodyHtml), datePublished: article.publishedAt,
        mainEntityOfPage: absoluteSiteUrl(`/news/${encodeURIComponent(slug)}`),
        image: absoluteSiteUrl(CORE_SHARE_IMAGE.url), articleSection: article.category,
        publisher: { "@type": "Organization", name: "CORE TV — independent fan site", url: absoluteSiteUrl("/") },
      }) }} />
      <article className="mx-auto max-w-[72ch] px-6 py-16 md:px-8 md:py-24">
        <Link
          href="/news"
          className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
        >
          Notes
        </Link>
        <p className="mt-8 font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
          {article.category}
          {article.publishedAt ? (
            <> · <BrowserDateTime value={article.publishedAt} options={{ month: "short", day: "numeric", year: "numeric" }} fallback="Local date" /></>
          ) : null}
        </p>
        <h1 className="mt-4 font-display text-[32px] font-semibold leading-[1.08] tracking-[-0.03em] text-[color:var(--ink)] md:text-[48px]">
          {article.title}
        </h1>
        {article.dek ? (
          <p className="mt-4 text-lg leading-relaxed text-[color:var(--ink-dim)]">{article.dek}</p>
        ) : null}
        <div
          className="post-body prose prose-invert mt-12 max-w-none text-[color:var(--ink)]"
          dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
        />
      </article>
      <SiteFooter />
    </>
  );
}
