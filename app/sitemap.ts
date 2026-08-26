import type { MetadataRoute } from "next";
import { MEMBERS } from "@/lib/members";
import { getPublishedArticles } from "@/lib/articles";
import { MAIL_MEMBERS } from "@/lib/fan-mail";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://thecoreboys.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  let posts: MetadataRoute.Sitemap = [];
  try {
    const list = await getPublishedArticles();
    posts = list.map((p) => ({
      url: `${SITE}/news/${p.slug}`,
      lastModified: new Date(p.publishedAt),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));
  } catch {
    // api unreachable at build time — keep the sitemap shippable.
  }

  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/guide`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}/multiview`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}/videos`, lastModified: now, changeFrequency: "daily", priority: 0.85 },
    { url: `${SITE}/clips`, lastModified: now, changeFrequency: "daily", priority: 0.85 },
    { url: `${SITE}/media`, lastModified: now, changeFrequency: "daily", priority: 0.75 },
    { url: `${SITE}/chat`, lastModified: now, changeFrequency: "hourly", priority: 0.85 },
    { url: `${SITE}/fanzone`, lastModified: now, changeFrequency: "daily", priority: 0.85 },
    { url: `${SITE}/news`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
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
    { url: `${SITE}/legal/data-deletion`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    ...MEMBERS.map((m) => ({
      url: `${SITE}/watch/network/${m.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...MEMBERS.map((m) => ({
      url: `${SITE}/about/${m.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...MEMBERS.map((m) => ({
      url: `${SITE}/about/${m.slug}/numbers`,
      lastModified: now,
      changeFrequency: "hourly" as const,
      priority: 0.75,
    })),
    ...posts,
  ];
}
