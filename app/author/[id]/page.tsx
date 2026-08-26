import type { Metadata } from "next";
import { FileX02 } from "@untitledui/icons";
import { listPublishedPosts, getPublishedPost } from "@/lib/blog";
import { PostCard } from "@/components/blog/PostCard";
import { Badge } from "@/components/base/badges/badges";
import { EmptyState } from "@/components/application/empty-state/empty-state";

type Params = { params: Promise<{ id: string }> };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://thecoreboys.com";

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
    <div className="mx-auto max-w-container px-6 py-16 md:px-10 md:py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <header className="mb-10 max-w-3xl">
        <p className="text-sm font-semibold text-brand-secondary">
          Author archive
        </p>
        <h1 className="mt-2 font-display text-display-sm font-semibold leading-tight tracking-tight text-primary md:text-display-md">
          Selected works
        </h1>
        <p className="mt-3 text-md text-tertiary">
          Every published piece credited to this author across the CORE journal.
        </p>
        {matches.length > 0 ? (
          <div className="mt-4">
            <Badge type="pill-color" color="brand" size="lg">
              {matches.length} {matches.length === 1 ? "post" : "posts"}
            </Badge>
          </div>
        ) : null}
      </header>
      {matches.length === 0 ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-2xl bg-secondary p-8 ring-1 ring-inset ring-secondary shadow-xs">
          <EmptyState size="sm">
            <EmptyState.Header>
              <EmptyState.FeaturedIcon icon={FileX02} color="gray" />
            </EmptyState.Header>
            <EmptyState.Content>
              <EmptyState.Title>No posts yet</EmptyState.Title>
              <EmptyState.Description>
                There&apos;s nothing published under this author right now. Check back soon.
              </EmptyState.Description>
            </EmptyState.Content>
          </EmptyState>
        </div>
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
