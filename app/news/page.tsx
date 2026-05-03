import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Calendar } from "lucide-react";
import { MEMBERS } from "@/lib/members";
import { SiteFooter } from "@/components/chrome/SiteFooter";

export const metadata: Metadata = {
  title: "News",
  description: "Editorial articles, recaps, and announcements from CORE.",
  alternates: { canonical: "/news" },
};

type Post = {
  slug: string;
  title: string;
  dek: string;
  date: string;
  category: string;
  authorSlug: string | null;
  image: string;
  /** CSS object-position for the cover photo. Defaults to "50% 32%" so
   * we don't crop faces that sit in the upper third of the frame. */
  focalPoint?: string;
};

export default function BlogIndexPage() {
  // News articles are admin-managed and persisted in the database.
  // Empty until real posts are published.
  const posts: Post[] = [];

  const [hero, ...rest] = posts;

  return (
    <main className="relative pt-20 md:pt-24">
      <Header />

      {posts.length === 0 ? (
        <section className="border-t border-[color:var(--rule)] bg-[color:var(--bg)]">
          <div className="mx-auto max-w-[1440px] px-6 py-16 md:px-8 md:py-24">
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] p-10 text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
                No articles yet
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {hero ? (
        <section className="border-t border-[color:var(--rule)] bg-[color:var(--bg)]">
          <div className="mx-auto max-w-[1440px] px-6 py-10 md:px-8 md:py-14">
            <Link
              href={`/news/${hero.slug}` as `/news/${string}`}
              className="group grid grid-cols-1 gap-0 overflow-hidden rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] transition-colors hover:border-[color:var(--rule-strong)] hover:bg-[color:var(--surface)] md:grid-cols-2"
            >
              <span className="relative block aspect-[16/10] w-full overflow-hidden bg-black media-tone md:aspect-auto">
                <Image
                  src={hero.image}
                  alt={hero.title}
                  fill
                  priority
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover grayscale-[0.25] transition duration-500 group-hover:grayscale-0 group-hover:scale-[1.02]"
                  style={{ objectPosition: hero.focalPoint ?? "50% 32%" }}
                />
                <CategoryChip category={hero.category} />
              </span>
              <div className="flex flex-col justify-center gap-4 p-6 md:p-10">
                <span className="inline-flex items-center gap-2 text-[color:var(--ink-faint)]">
                  <Calendar size={11} />
                  <time dateTime={hero.date} className="font-mono text-[10px] uppercase tracking-[0.18em]">
                    {formatDate(hero.date)}
                  </time>
                </span>
                <h2 className="text-balance text-[clamp(28px,3.4vw,42px)] font-bold leading-tight tracking-tight text-[color:var(--ink)]">
                  {hero.title}
                </h2>
                <p className="text-[15px] leading-relaxed text-[color:var(--ink-dim)]">{hero.dek}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-[color:var(--ink-dim)] group-hover:text-[color:var(--core)]">
                  Read article <ArrowUpRight size={14} />
                </span>
              </div>
            </Link>
          </div>
        </section>
      ) : null}

      <section className="border-t border-[color:var(--rule)] bg-[color:var(--bg)]">
        <div className="mx-auto max-w-[1440px] px-6 py-10 md:px-8 md:py-14">
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/news/${p.slug}` as `/news/${string}`}
                  className="group flex h-full flex-col overflow-hidden rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] transition-colors hover:border-[color:var(--rule-strong)] hover:bg-[color:var(--surface)]"
                >
                  <span className="relative block aspect-[16/10] w-full overflow-hidden bg-black media-tone">
                    <Image
                      src={p.image}
                      alt={p.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover grayscale-[0.35] transition duration-500 group-hover:grayscale-0 group-hover:scale-[1.03]"
                      style={{ objectPosition: p.focalPoint ?? "50% 32%" }}
                    />
                    <CategoryChip category={p.category} />
                  </span>
                  <div className="flex flex-1 flex-col gap-2 p-5">
                    <span className="inline-flex items-center gap-2 text-[color:var(--ink-faint)]">
                      <Calendar size={11} />
                      <time dateTime={p.date} className="font-mono text-[10px] uppercase tracking-[0.18em]">
                        {formatDate(p.date)}
                      </time>
                    </span>
                    <h3 className="text-balance text-[16px] font-semibold leading-snug tracking-tight text-[color:var(--ink)]">
                      {p.title}
                    </h3>
                    <p className="line-clamp-2 text-[13px] leading-relaxed text-[color:var(--ink-dim)]">
                      {p.dek}
                    </p>
                    {p.authorSlug ? (
                      <p className="mt-1 inline-flex items-center gap-2 text-[12px] text-[color:var(--ink-dim)]">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{
                            background: MEMBERS.find((m) => m.slug === p.authorSlug)?.accent ?? "var(--ink-faint)",
                          }}
                        />
                        By {MEMBERS.find((m) => m.slug === p.authorSlug)?.stageName}
                      </p>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function Header() {
  return (
    <section className="relative overflow-hidden bg-dot-grid">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(50% 40% at 30% 30%, rgba(239,68,68,0.08), transparent 60%)",
        }}
      />
      <div className="relative mx-auto max-w-[1440px] px-6 py-16 md:px-8 md:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Editorial · News</p>
            <h1 className="mt-2 text-display text-[clamp(40px,6vw,72px)] font-black tracking-[-0.04em] text-[color:var(--ink)]">
              Stories from the house.
            </h1>
          </div>
        </div>
      </div>
    </section>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const CATEGORY_TINT: Record<string, string> = {
  House: "#10b981",
  Recap: "#ef4444",
  Product: "#6366f1",
  Craft: "#f59e0b",
  Org: "#a1a1aa",
  Press: "#ec4899",
};

function CategoryChip({ category }: { category: string }) {
  const tint = CATEGORY_TINT[category] ?? "#a1a1aa";
  return (
    <span
      className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border bg-[rgba(8,8,10,0.78)] px-2.5 py-1 text-[10px] font-bold tracking-tight backdrop-blur"
      style={{ borderColor: `${tint}88`, color: tint }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tint }} />
      {category}
    </span>
  );
}
