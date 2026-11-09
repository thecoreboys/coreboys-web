import type { CrewMember } from "@coreboys/shared";
import { CREW } from "@/lib/members";
import { normalizeXFeedAccounts, type XFeedAccount } from "@/lib/x-feed-request";

/** Crew identities never share the channel-owner namespace. */
export function crewXAuthorSlug(slug: string): `crew:${string}` {
  return `crew:${slug}`;
}

export function getXCrewOwner(authorSlug: string | null): CrewMember | null {
  if (!authorSlug?.startsWith("crew:")) return null;
  return CREW.find((crew) => crew.slug === authorSlug.slice(5)) ?? null;
}

export function configuredXCrewFeedAccounts(): XFeedAccount[] {
  return normalizeXFeedAccounts(CREW.flatMap((crew) =>
    crew.socials.flatMap((social) => social.platform === "x" && social.handle
      ? [{
          handle: social.handle,
          authorSlug: crewXAuthorSlug(crew.slug),
          authorLabel: `${crew.name} · ${social.handle}`,
        }]
      : []),
  ));
}
