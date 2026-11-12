import type { Metadata } from "next";

export const SITE_URL = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://thecoreboys.com").origin;
export const SITE_NAME = "The Core Boys";
export const SITE_DESCRIPTION = "Watch live streams, videos, clips, and shows from StableRonaldo, JasonTheWeen, Lacy, Marlon, Silky, and Adapt on the independent CORE fan site.";
export const SITE_KEYWORDS = ["The Core Boys", "CORE", "StableRonaldo", "JasonTheWeen", "Lacy", "Marlon", "Silky", "Adapt", "live streams", "Twitch", "YouTube"];
export const INDEXABLE_SITE_PATHS = ["/", "/guide", "/multiview", "/videos", "/clips", "/shorts", "/media", "/chat", "/fanzone", "/news", "/links", "/timeline", "/tonight", "/theater", "/fan-mail", "/clips/submit", "/logo-submissions", "/special-message", "/legal/terms", "/legal/privacy", "/legal/cookies", "/legal/data-deletion"];
export const CORE_SHARE_IMAGE = {
  url: "/social/core-boys-share-2026.png",
  width: 1200,
  height: 630,
  alt: "The Core Boys: Adapt, StableRonaldo, Lacy, Marlon, JasonTheWeen, and Silky gathered around the camera.",
  type: "image/png",
};

export function creatorShareImage(slug: string, name: string) {
  return { ...CORE_SHARE_IMAGE, url: `/social/${encodeURIComponent(slug)}-share-2026.png`, alt: `${name} from The Core Boys — streams, videos, and community.` };
}

export function absoluteSiteUrl(path: string | URL): string {
  return new URL(path, SITE_URL).href;
}

export function seoDescription(value: string | null | undefined): string {
  const text = (value || SITE_DESCRIPTION).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= 170) return text;
  const excerpt = text.slice(0, 167);
  return `${excerpt.slice(0, Math.max(excerpt.lastIndexOf(" "), 130)).trimEnd()}…`;
}

/** Next replaces nested social metadata, so every page gets a complete card. */
export function withPageMetadata(path: string, input: Metadata, shareImage = CORE_SHARE_IMAGE): Metadata {
  const canonical = input.alternates?.canonical || path;
  const canonicalPath = typeof canonical === "string" || canonical instanceof URL ? canonical : path;
  const title = typeof input.title === "string" ? input.title
    : input.title && "absolute" in input.title ? input.title.absolute
    : input.title && "default" in input.title ? input.title.default : SITE_NAME;
  const shareTitle = /\bCORE\b|The Core Boys/i.test(title) ? title : `${title} | ${SITE_NAME}`;
  const description = seoDescription(input.description);
  const images = input.openGraph?.images || [shareImage];
  const keywords = input.keywords ? typeof input.keywords === "string" ? [input.keywords] : input.keywords : [];
  return {
    ...input,
    description,
    keywords: [...new Set([...SITE_KEYWORDS, ...keywords])],
    alternates: { ...input.alternates, canonical: absoluteSiteUrl(canonicalPath) },
    openGraph: {
      type: "website", siteName: SITE_NAME, locale: "en_US",
      ...input.openGraph,
      title: input.openGraph?.title || shareTitle,
      description: seoDescription(input.openGraph?.description || description),
      url: absoluteSiteUrl(input.openGraph?.url || canonicalPath),
      images,
    },
    twitter: {
      card: "summary_large_image",
      ...input.twitter,
      title: input.twitter?.title || input.openGraph?.title || shareTitle,
      description: seoDescription(input.twitter?.description || input.openGraph?.description || description),
      images: input.twitter?.images || images,
    },
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
