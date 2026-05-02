/**
 * Server-only fetchers for the public editorial endpoints in coreboys-api.
 * Every fetch tags into Next's data cache so the revalidate webhook can
 * surgically bust the right paths on publish/edit.
 */
import { z } from "zod";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? process.env.INTERNAL_API_URL ?? "http://localhost:3001";

// ── Wire schemas (mirror coreboys-api) ─────────────────────────────────────

const PostListItemSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  excerpt: z.string().nullable().optional(),
  coverMediaId: z.string().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type PostListItem = z.infer<typeof PostListItemSchema>;

const SocialSchema = z.object({
  platform: z.string(),
  url: z.string(),
  handle: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
});

const ResolvedPersonSchema = z.object({
  id: z.string(),
  kind: z.enum(["member", "crew", "external"]),
  name: z.string(),
  href: z.string(),
  avatarUrl: z.string().nullable().optional(),
  socials: z.array(SocialSchema),
});
export type ResolvedPerson = z.infer<typeof ResolvedPersonSchema>;

const BboxSchema = z.object({
  left: z.number(),
  top: z.number(),
  width: z.number(),
  height: z.number(),
});

const FaceTagSchema = z.object({
  id: z.string(),
  bbox: BboxSchema,
  person: ResolvedPersonSchema.nullable(),
});
export type FaceTagWithPerson = z.infer<typeof FaceTagSchema>;

const BboxKeyframeSchema = z.object({
  tMs: z.number(),
  bbox: BboxSchema,
});
export type BboxKeyframe = z.infer<typeof BboxKeyframeSchema>;

const VideoSegmentSchema = z.object({
  id: z.string(),
  tStart: z.number(),
  tEnd: z.number(),
  bbox: BboxSchema,
  bboxKeyframes: z.array(BboxKeyframeSchema).nullable(),
  confidence: z.number().nullable(),
});
export type VideoSegment = z.infer<typeof VideoSegmentSchema>;

const FaceTrackSchema = z.object({
  personId: z.string().nullable(),
  person: ResolvedPersonSchema.nullable(),
  segments: z.array(VideoSegmentSchema),
});
export type FaceTrack = z.infer<typeof FaceTrackSchema>;

const PostDetailSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  excerpt: z.string().nullable().optional(),
  bodyJson: z.unknown(),
  publishedAt: z.string().nullable().optional(),
  cover: z
    .object({
      id: z.string(),
      r2Url: z.string(),
      altText: z.string().nullable().optional(),
    })
    .nullable(),
  taggedPeople: z.array(ResolvedPersonSchema),
  mediaFaces: z.record(z.string(), z.array(FaceTagSchema)),
  mediaTracks: z.record(z.string(), z.array(FaceTrackSchema)).optional(),
});
export type PostDetail = z.infer<typeof PostDetailSchema>;

const PublicPersonSchema = z.object({
  id: z.string(),
  kind: z.enum(["member", "crew", "external"]),
  name: z.string(),
  href: z.string(),
  avatarUrl: z.string().nullable().optional(),
  socials: z.array(SocialSchema),
});
export type PublicPerson = z.infer<typeof PublicPersonSchema>;

// ── Fetchers ───────────────────────────────────────────────────────────────

const REVALIDATE_TAG_BLOG = "blog";
const REVALIDATE_TAG_POST = "post";

/**
 * Tag every fetch with `blog` so the revalidate webhook can purge the index
 * and individual posts in one call to revalidateTag().
 */
async function get<T>(path: string, schema: z.ZodType<T>, tags: string[], revalidate = 60): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    next: { tags, revalidate },
  });
  if (!res.ok) throw new Error(`api ${path}: HTTP ${res.status}`);
  const json = await res.json();
  return schema.parse(json);
}

export async function listPublishedPosts(params: {
  limit?: number;
  cursor?: string;
} = {}): Promise<{ posts: PostListItem[]; nextCursor: string | null }> {
  const q = new URLSearchParams({ status: "published" });
  if (params.limit) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);
  return get(
    `/v1/posts?${q}`,
    z.object({
      posts: z.array(PostListItemSchema),
      nextCursor: z.string().nullable(),
    }),
    [REVALIDATE_TAG_BLOG],
    60,
  );
}

export async function getPublishedPost(slug: string): Promise<PostDetail | null> {
  try {
    const r = await get(
      `/v1/posts/${encodeURIComponent(slug)}`,
      z.object({ post: PostDetailSchema }),
      [REVALIDATE_TAG_BLOG, `${REVALIDATE_TAG_POST}:${slug}`],
      300,
    );
    return r.post;
  } catch (err) {
    if (err instanceof Error && err.message.includes("HTTP 404")) return null;
    throw err;
  }
}

export async function getPublicPerson(id: string): Promise<PublicPerson | null> {
  try {
    const r = await get(
      `/v1/people/${encodeURIComponent(id)}`,
      z.object({ person: PublicPersonSchema }),
      [REVALIDATE_TAG_BLOG, `person:${id}`],
      300,
    );
    return r.person;
  } catch (err) {
    if (err instanceof Error && err.message.includes("HTTP 404")) return null;
    throw err;
  }
}

/**
 * Reading-time estimator. Walks the Tiptap doc, counts words, divides by
 * 225 wpm. Returns minutes (rounded up, min 1).
 */
export function readingTime(doc: unknown): number {
  let words = 0;
  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (typeof n.text === "string") {
      words += n.text.trim().split(/\s+/).filter(Boolean).length;
    }
    if (Array.isArray(n.content)) for (const c of n.content) walk(c);
  }
  walk(doc);
  return Math.max(1, Math.ceil(words / 225));
}

/**
 * Walk the doc, collect every heading (h2/h3) into a TOC structure.
 * `id` is a slug-ified version of the text, suitable for #anchor links.
 */
export type TocItem = { id: string; level: 2 | 3; text: string };

export function buildToc(doc: unknown): TocItem[] {
  const out: TocItem[] = [];
  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;
    const n = node as {
      type?: string;
      attrs?: { level?: number };
      content?: unknown[];
    };
    if (n.type === "heading" && (n.attrs?.level === 2 || n.attrs?.level === 3)) {
      const text = collectText(n).trim();
      if (text) {
        out.push({
          id: slugifyHeading(text),
          level: n.attrs.level as 2 | 3,
          text,
        });
      }
    }
    if (Array.isArray(n.content)) for (const c of n.content) walk(c);
  }
  walk(doc);
  return out;
}

export function collectText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { text?: string; content?: unknown[] };
  if (typeof n.text === "string") return n.text;
  if (Array.isArray(n.content)) return n.content.map(collectText).join("");
  return "";
}

export function slugifyHeading(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

export const REVALIDATE_TAGS = {
  blog: REVALIDATE_TAG_BLOG,
  post: REVALIDATE_TAG_POST,
};
