import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Calendar, Clock } from "lucide-react";
import { notFound } from "next/navigation";
import { MEMBERS } from "@/lib/members";
import { fetchUsersByLogin } from "@/lib/twitch";
import { getGroupPhotos } from "@/lib/asset-index";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { ArticleSidebar, type Heading } from "@/components/news/ArticleSidebar";

type Params = { params: Promise<{ slug: string }> };

/** Demo content — Phase 4 reads from /v1/posts/:slug. */
type Article = {
  slug: string;
  title: string;
  dek: string;
  category: string;
  authorSlug: string | null;
  publishedAt: string;
  readingMinutes: number;
  bannerImage: string;
  bannerFocal?: string;
  /** Body rendered as a sequence of typed blocks so we can extract a TOC. */
  blocks: Array<
    | { kind: "h2"; text: string }
    | { kind: "h3"; text: string }
    | { kind: "p"; text: string }
    | { kind: "image"; src: string; caption?: string }
    | { kind: "quote"; text: string; cite?: string }
  >;
};

function getDemoArticle(_slug: string, _group: string[]): Article | null {
  // Articles are admin-managed and persisted in the database.
  // Phase 4 reads from /v1/posts/:slug. Until then, no articles resolve.
  return null;
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const a = getDemoArticle(slug, getGroupPhotos());
  if (!a) return { title: "News — CORE" };
  return {
    title: `${a.title} — CORE`,
    description: a.dek,
  };
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  const article = getDemoArticle(slug, getGroupPhotos());
  if (!article) notFound();

  const author = article.authorSlug
    ? MEMBERS.find((m) => m.slug === article.authorSlug)
    : null;

  let authorAvatar: string | null = null;
  if (author) {
    try {
      const users = await fetchUsersByLogin([author.twitchLogin]);
      authorAvatar = users[author.twitchLogin.toLowerCase()]?.profile_image_url ?? author.portrait;
    } catch {
      authorAvatar = author.portrait;
    }
  }

  // Build TOC + render blocks with stable IDs.
  const headings: Heading[] = article.blocks
    .filter((b) => b.kind === "h2" || b.kind === "h3")
    .map((b) => {
      const text = (b as { text: string }).text;
      return { id: slugifyHeading(text), text, level: b.kind === "h2" ? 2 : 3 };
    });

  return (
    <main className="relative pt-20 md:pt-24">
      {/* Banner */}
      <section className="relative">
        <div className="relative h-[44vh] min-h-[320px] w-full overflow-hidden bg-black md:h-[56vh]">
          <Image
            src={article.bannerImage}
            alt={article.title}
            fill
            priority
            sizes="100vw"
            className="object-cover image-grain"
            style={{ objectPosition: article.bannerFocal ?? "50% 35%" }}
          />
          {/* Bottom gradient + dot grid bloom */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(8,8,10,0.0) 30%, rgba(8,8,10,0.55) 60%, rgba(8,8,10,1) 100%)",
            }}
          />
          <div
            aria-hidden
            className="lens-flare h-[420px] w-[420px]"
            style={{
              left: "10%",
              top: "20%",
              ["--flare" as string]: "rgba(239,68,68,0.55)",
            }}
          />
        </div>

        <div className="relative mx-auto -mt-32 max-w-[1200px] px-6 md:-mt-48 md:px-8">
          <Link
            href="/news"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-on-image-dim hover:text-[color:var(--ink)]"
          >
            <ArrowLeft size={12} /> News
          </Link>
          <p className="mt-4">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border bg-[rgba(8,8,10,0.78)] px-2.5 py-1 text-[11px] font-bold tracking-tight backdrop-blur"
              style={{ borderColor: "rgba(239,68,68,0.5)", color: "#ef4444" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--core)]" />
              {article.category}
            </span>
          </p>
          <h1 className="mt-4 max-w-[20ch] text-display text-[clamp(36px,5vw,64px)] font-black leading-[1.02] tracking-[-0.04em] text-on-image">
            {article.title}
          </h1>
          <p className="mt-4 max-w-[60ch] text-[16px] leading-relaxed text-on-image-dim">
            {article.dek}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4 text-[12px] text-on-image-dim">
            {author ? (
              <Link
                href={`/m/${author.slug}` as `/m/${string}`}
                className="group inline-flex items-center gap-2"
              >
                <span
                  className="relative h-8 w-8 overflow-hidden rounded-full ring-1 ring-inset"
                  style={{ ["--tw-ring-color" as string]: `${author.accent}77` }}
                >
                  {authorAvatar ? (
                    <Image src={authorAvatar} alt="" fill sizes="32px" className="object-cover" />
                  ) : null}
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="text-[12px] font-semibold text-on-image group-hover:text-[color:var(--core)]">
                    {author.stageName}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-on-image-dim">
                    {author.realName}
                  </span>
                </span>
              </Link>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <Calendar size={11} />
              <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock size={11} />
              {article.readingMinutes} min read
            </span>
          </div>
        </div>
      </section>

      {/* Body + sidebar */}
      <section className="bg-[color:var(--bg)]">
        <div className="mx-auto max-w-[1200px] px-6 py-12 md:px-8 md:py-16">
          <div className="grid grid-cols-12 gap-8 lg:gap-12">
            <div className="col-span-12 lg:col-span-8">
              <article className="post-body flex flex-col gap-5 text-[16px] leading-relaxed text-[color:var(--ink)]">
                {article.blocks.map((b, i) => {
                  // eslint-disable-next-line react/no-array-index-key
                  const key = i;
                  if (b.kind === "h2") {
                    const id = slugifyHeading(b.text);
                    return (
                      <h2
                        key={key}
                        id={id}
                        className="mt-6 scroll-mt-24 text-[26px] font-bold tracking-tight text-[color:var(--ink)] md:text-[30px]"
                      >
                        {b.text}
                      </h2>
                    );
                  }
                  if (b.kind === "h3") {
                    const id = slugifyHeading(b.text);
                    return (
                      <h3
                        key={key}
                        id={id}
                        className="mt-3 scroll-mt-24 text-[19px] font-semibold tracking-tight text-[color:var(--ink)]"
                      >
                        {b.text}
                      </h3>
                    );
                  }
                  if (b.kind === "p") {
                    return (
                      <p key={key} className="text-[16px] leading-relaxed text-[color:var(--ink-dim)]">
                        {b.text}
                      </p>
                    );
                  }
                  if (b.kind === "image") {
                    return (
                      <figure key={key} className="my-4">
                        <span className="relative block aspect-[16/10] w-full overflow-hidden rounded-lg border border-[color:var(--rule)] bg-black image-grain">
                          <Image
                            src={b.src}
                            alt={b.caption ?? ""}
                            fill
                            sizes="(max-width: 1024px) 100vw, 800px"
                            className="object-cover"
                          />
                        </span>
                        {b.caption ? (
                          <figcaption className="mt-2 text-[12px] text-[color:var(--ink-faint)]">
                            {b.caption}
                          </figcaption>
                        ) : null}
                      </figure>
                    );
                  }
                  if (b.kind === "quote") {
                    return (
                      <blockquote
                        key={key}
                        className="my-4 border-l-2 border-[color:var(--core)] pl-5 text-[18px] italic leading-relaxed text-[color:var(--ink)]"
                      >
                        &ldquo;{b.text}&rdquo;
                        {b.cite ? (
                          <cite className="mt-2 block text-[12px] not-italic text-[color:var(--ink-dim)]">
                            — {b.cite}
                          </cite>
                        ) : null}
                      </blockquote>
                    );
                  }
                  return null;
                })}
              </article>

              {/* Author chip — link to the writer's profile, no bio body. */}
              {author ? (
                <Link
                  href={`/m/${author.slug}` as `/m/${string}`}
                  className="author-chip mt-10 inline-flex items-center gap-3 rounded-full border border-[color:var(--rule)] bg-[color:var(--bg-elev)] py-1.5 pl-1.5 pr-4 transition-all hover:-translate-y-px"
                  style={{ ["--accent" as string]: author.accent }}
                >
                  <span
                    className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full ring-2 ring-inset"
                    style={{ ["--tw-ring-color" as string]: author.accent }}
                  >
                    {authorAvatar ? (
                      <Image src={authorAvatar} alt="" fill sizes="36px" className="object-cover" />
                    ) : null}
                  </span>
                  <span className="flex flex-col leading-tight">
                    <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
                      Written by
                    </span>
                    <span className="text-[13px] font-semibold text-[color:var(--ink)]">
                      {author.stageName}
                    </span>
                  </span>
                </Link>
              ) : null}
            </div>

            {/* Sidebar */}
            <div className="col-span-12 lg:col-span-4">
              <ArticleSidebar headings={headings} />
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
