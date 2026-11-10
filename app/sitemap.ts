import type { MetadataRoute } from "next";
import { MEMBERS } from "@/lib/members";
import { getPublishedArticles } from "@/lib/articles";
import { MAIL_MEMBERS } from "@/lib/fan-mail";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://thecoreboys.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let posts: MetadataRoute.Sitemap = [];
  try {
    const list = await getPublishedArticles();
    posts = list.map((p) => ({
      url: `${SITE}/news/${p.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));
  } catch {
    // api unreachable at build time — keep the sitemap shippable.
  }

  return [
    { url: `${SITE}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/guide`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}/multiview`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}/videos`, changeFrequency: "daily", priority: 0.85 },
    { url: `${SITE}/clips`, changeFrequency: "daily", priority: 0.85 },
    { url: `${SITE}/media`, changeFrequency: "daily", priority: 0.75 },
    { url: `${SITE}/chat`, changeFrequency: "hourly", priority: 0.85 },
    { url: `${SITE}/fanzone`, changeFrequency: "daily", priority: 0.85 },
    { url: `${SITE}/news`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/links`, changeFrequency: "hourly", priority: 0.85 },
    { url: `${SITE}/fan-mail`, changeFrequency: "monthly", priority: 0.8 },
    ...MAIL_MEMBERS.map((m) => ({
      url: `${SITE}/send-to-${m.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${SITE}/legal/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/legal/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/legal/cookies`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/legal/data-deletion`, changeFrequency: "yearly", priority: 0.3 },
    ...MEMBERS.map((m) => ({
      url: `${SITE}/watch/network/${m.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...MEMBERS.map((m) => ({
      url: `${SITE}/channels/${m.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...MEMBERS.map((m) => ({
      url: `${SITE}/about/${m.slug}/numbers`,
      changeFrequency: "hourly" as const,
      priority: 0.75,
    })),
    ...posts,
  ];
}
