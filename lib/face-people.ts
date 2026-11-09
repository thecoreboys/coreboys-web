import { z } from "zod";
import { CreatorInput, verifiedCreatorAvatar } from "./creator-tags/model";

export const FaceCanonicalKindSchema = z.enum(["member", "crew", "guest"]);
export type FaceCanonicalKind = z.infer<typeof FaceCanonicalKindSchema>;
export const FacePersonSlugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
export const FaceCanonicalKeySchema = z.string().regex(/^(member|crew|guest):[a-z0-9][a-z0-9-]{0,79}$/);

const TwitchLogin = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{1,25}$/);
const YouTubeProfile = z.string().trim().max(300).url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && ["youtube.com", "www.youtube.com"].includes(url.hostname)
      && !url.search && !url.hash
      && /^\/(?:@[A-Za-z0-9._-]{3,30}|channel\/UC[A-Za-z0-9_-]{22}|(?:c|user)\/[A-Za-z0-9._-]{1,100})\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}, "Use a YouTube channel or @handle URL, without query parameters.");

export const FaceGuestProfileSchema = z.object({
  slug: FacePersonSlugSchema,
  displayName: z.string().trim().min(1).max(120),
  twitchLogin: TwitchLogin.nullable().default(null),
  youtubeUrl: YouTubeProfile.nullable().default(null),
  socialLinks: z.array(CreatorInput.shape.socials.element).max(14).default([]),
  avatarUrl: CreatorInput.shape.avatarUrl,
  avatarSourceProfile: CreatorInput.shape.avatarSourceProfile,
  avatarCheckedAt: CreatorInput.shape.avatarCheckedAt,
}).strict();
export type FaceGuestProfile = z.infer<typeof FaceGuestProfileSchema>;

/** Recheck persisted image destinations at the rendering boundary as well. */
export function safeFacePortraitUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  if (/^\/(?:members|crew|comms|group|avatars|brand)\/[A-Za-z0-9_./-]+$/.test(value) && !value.includes("..")) {
    return "/" + value.slice(1).split("/").map(encodeURIComponent).join("/");
  }
  if (!value.startsWith("https://") || !verifiedCreatorAvatar(value)) return null;
  const url = new URL(value);
  // Construct an explicit HTTPS destination rather than returning stored text.
  return "https://" + url.hostname + url.pathname + url.search;
}

export const FaceProfileResearchSchema = z.object({
  checkedAt: z.string().datetime({ offset: true }),
  sources: z.array(z.object({
    label: z.string().trim().min(1).max(120),
    url: z.string().max(2000).url().refine((value) => {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && !url.port;
    }),
  }).strict()).min(1).max(20),
  note: z.string().trim().max(2000),
}).strict();
export const FaceProfileReviewSchema = z.object({
  status: z.enum(["pending", "approved", "needs_changes"]),
  version: z.string().min(1).max(80),
  reviewedAt: z.string().nullable(),
  note: z.string().nullable(),
  research: FaceProfileResearchSchema.nullable(),
});
export type FaceGuestRecord = FaceGuestProfile & { review?: z.infer<typeof FaceProfileReviewSchema> };
export const FaceProfileReviewInput = z.object({
  decision: z.enum(["approved", "needs_changes"]),
  version: z.string().min(1).max(80),
  note: z.string().trim().min(3).max(1000),
}).strict();

export const FaceCanonicalPersonSchema = z.object({
  key: FaceCanonicalKeySchema,
  kind: FaceCanonicalKindSchema,
  slug: FacePersonSlugSchema,
  displayName: z.string().min(1).max(120),
  secondaryLabel: z.string(),
  portraitUrl: z.string().max(2000).refine((value) => safeFacePortraitUrl(value) !== null).nullable(),
  portraitSourceProfile: CreatorInput.shape.avatarSourceProfile,
  portraitCheckedAt: CreatorInput.shape.avatarCheckedAt,
  profileReview: FaceProfileReviewSchema.optional(),
  profileHref: z.string().regex(/^\/(m|crew|people)\/[a-z0-9][a-z0-9-]{0,79}$/),
  socials: z.array(z.object({
    platform: z.string(),
    url: z.string().url().refine((value) => value.startsWith("https://")),
    handle: z.string().optional(),
    label: z.string().optional(),
  })),
});
export type FaceCanonicalPerson = z.infer<typeof FaceCanonicalPersonSchema>;

export function faceGuestPerson(profile: FaceGuestRecord): FaceCanonicalPerson {
  return {
    key: `guest:${profile.slug}`,
    kind: "guest",
    slug: profile.slug,
    displayName: profile.displayName,
    secondaryLabel: "Friend / guest streamer",
    portraitUrl: profile.avatarUrl ?? null,
    portraitSourceProfile: profile.avatarSourceProfile,
    portraitCheckedAt: profile.avatarCheckedAt,
    profileReview: profile.review,
    profileHref: `/people/${profile.slug}`,
    socials: [
      ...(profile.twitchLogin ? [{ platform: "twitch", handle: profile.twitchLogin, url: `https://www.twitch.tv/${profile.twitchLogin}` }] : []),
      ...(profile.youtubeUrl ? [{ platform: "youtube", label: "YouTube", url: profile.youtubeUrl }] : []),
      ...profile.socialLinks.filter((link) => link.platform !== "twitch" && link.platform !== "youtube"),
    ],
  };
}
