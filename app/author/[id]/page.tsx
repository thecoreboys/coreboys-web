import type { Metadata } from "next";
import { listPublishedPosts, getPublishedPost } from "@/lib/blog";
import { PostCard } from "@/components/blog/PostCard";

type Params = { params: Promise<{ id: string }> };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://corecrew.org";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Author archive`,
    description: `Posts by author ${id}.`,
    alternates: { canonical: `/author/${id}` },
  };
}

/**
 * /author/[id] — every post by the given author. The api currently exposes
 * authorId on the admin list endpoint; for the public archive we filter
 * by walking the public posts list. (Phase B can move this server-side.)
 */
export default async function AuthorArchive({ params }: Params) {
  const { id } = await params;
  const { posts } = await listPublishedPosts({ limit: 50 });
  const detailed = await Promise.all(
    posts.map(async (p) => {
      const d = await getPublishedPost(p.slug);
      return d ? { post: p, detail: d } : null;
    }),
  );
  const matches = detailed
    .filter((x): x is NonNullable<typeof x> => !!x)
    // The public detail endpoint doesn't yet ship `authorId`. As a stopgap,
    // we surface every post — Phase B will filter once the api emits
    // author info on the public schema.
    .map(({ post, detail }) => ({ post, cover: detail.cover?.r2Url ?? null }));

  const ld = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name: id,
      url: `${SITE_URL}/author/${id}`,
    },
  };

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-16 md:px-10 md:py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <header className="mb-10">
        <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
          Author
        </p>
        <h1 className="mt-2 font-display text-[40px] font-bold leading-[0.95] tracking-[-0.04em] text-[color:var(--ink)] md:text-[72px]">
          Selected works
        </h1>
      </header>
      {matches.length === 0 ? (
        <p className="text-[14px] text-[color:var(--ink-dim)]">No posts yet.</p>
      ) : (
        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map(({ post, cover }) => (
            <PostCard key={post.id} post={post} coverUrl={cover} variant="grid" />
          ))}
        </section>
      )}
    </div>
  );
}
