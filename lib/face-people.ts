import { z } from "zod";
import { CreatorInput } from "./creator-tags/model";

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
}).strict();
export type FaceGuestProfile = z.infer<typeof FaceGuestProfileSchema>;

export const FaceCanonicalPersonSchema = z.object({
  key: FaceCanonicalKeySchema,
  kind: FaceCanonicalKindSchema,
  slug: FacePersonSlugSchema,
  displayName: z.string().min(1).max(120),
  secondaryLabel: z.string(),
  portraitUrl: z.string().regex(/^\/(members|crew|comms)\/[A-Za-z0-9_./-]+$/).nullable(),
  profileHref: z.string().regex(/^\/(m|crew|people)\/[a-z0-9][a-z0-9-]{0,79}$/),
  socials: z.array(z.object({
    platform: z.string(),
    url: z.string().url().refine((value) => value.startsWith("https://")),
    handle: z.string().optional(),
    label: z.string().optional(),
  })),
});
export type FaceCanonicalPerson = z.infer<typeof FaceCanonicalPersonSchema>;

export function faceGuestPerson(profile: FaceGuestProfile): FaceCanonicalPerson {
  return {
    key: `guest:${profile.slug}`,
    kind: "guest",
    slug: profile.slug,
    displayName: profile.displayName,
    secondaryLabel: "Friend / guest streamer",
    portraitUrl: null,
    profileHref: `/people/${profile.slug}`,
    socials: [
      ...(profile.twitchLogin ? [{ platform: "twitch", handle: profile.twitchLogin, url: `https://www.twitch.tv/${profile.twitchLogin}` }] : []),
      ...(profile.youtubeUrl ? [{ platform: "youtube", label: "YouTube", url: profile.youtubeUrl }] : []),
      ...profile.socialLinks.filter((link) => link.platform !== "twitch" && link.platform !== "youtube"),
    ],
  };
}
