import type { MetadataRoute } from "next";
import { MEMBERS } from "@/lib/members";
import { listPublishedPosts } from "@/lib/blog";
import { MAIL_MEMBERS } from "@/lib/fan-mail";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://thecoreboys.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  let posts: MetadataRoute.Sitemap = [];
  try {
    const { posts: list } = await listPublishedPosts({ limit: 200 });
    posts = list.map((p) => ({
      url: `${SITE}/blog/${p.slug}`,
      lastModified: new Date(p.publishedAt ?? p.createdAt),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));
  } catch {
    // api unreachable at build time — keep the sitemap shippable.
  }

  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/blog`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/links`, lastModified: now, changeFrequency: "hourly", priority: 0.85 },
    { url: `${SITE}/fan-mail`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    ...MAIL_MEMBERS.map((m) => ({
      url: `${SITE}/send-to-${m.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${SITE}/legal/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/legal/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/legal/cookies`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    ...MEMBERS.map((m) => ({
      url: `${SITE}/m/${m.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...MEMBERS.map((m) => ({
      url: `${SITE}/m/${m.slug}/numbers`,
      lastModified: now,
      changeFrequency: "hourly" as const,
      priority: 0.75,
    })),
    ...posts,
  ];
}
