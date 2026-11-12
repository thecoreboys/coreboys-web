import type { MetadataRoute } from "next";
import { CREW, MEMBERS } from "@/lib/members";
import { getPublishedArticles } from "@/lib/articles";
import { MAIL_MEMBERS } from "@/lib/fan-mail";
import { getCoreOriginalSnapshot } from "@/lib/core-originals";
import { NETWORK_CHANNELS } from "@/lib/watch/channels";
import { absoluteSiteUrl, INDEXABLE_SITE_PATHS } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, originals] = await Promise.all([
    getPublishedArticles().catch(() => []),
    getCoreOriginalSnapshot().then(snapshot => snapshot.originals).catch(() => []),
  ]);
  const pages: MetadataRoute.Sitemap = [
    ...INDEXABLE_SITE_PATHS.map(path => ({ url: absoluteSiteUrl(path), changeFrequency: "daily" as const, priority: path === "/" ? 1 : .8 })),
    ...NETWORK_CHANNELS.map(channel => ({ url: absoluteSiteUrl("/channels/" + channel.slug), changeFrequency: "daily" as const, priority: .9 })),
    ...MEMBERS.map(member => ({ url: absoluteSiteUrl("/about/" + member.slug + "/numbers"), changeFrequency: "daily" as const, priority: .6 })),
    ...CREW.map(member => ({ url: absoluteSiteUrl("/crew/" + member.slug), changeFrequency: "weekly" as const, priority: .6 })),
    ...MAIL_MEMBERS.map(member => ({ url: absoluteSiteUrl("/send-to-" + member.slug), changeFrequency: "monthly" as const, priority: .6 })),
    ...articles.map(article => ({ url: absoluteSiteUrl("/news/" + encodeURIComponent(article.slug)), changeFrequency: "monthly" as const, priority: .7 })),
    ...originals.map(original => ({ url: absoluteSiteUrl("/originals/" + encodeURIComponent(original.slug)), changeFrequency: "weekly" as const, priority: .8 })),
  ];
  return [...new Map(pages.map(page => [page.url, page])).values()];
}
