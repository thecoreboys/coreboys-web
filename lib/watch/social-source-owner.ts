import "server-only";

import { GROUP } from "@/lib/group";
import { MEMBERS } from "@/lib/members";
import {
  normalizeCreatorSocialHandle,
  type CreatorSocialProvider,
} from "@/lib/watch/social-account-ref";

export type CreatorSocialOwner = {
  handle: string;
  memberSlug: string | null;
  accountLabel: string;
};

/** Resolve an OAuth/webhook account back to the fixed public CORE roster. */
export function creatorSocialOwner(
  provider: CreatorSocialProvider,
  rawHandle: string | null | undefined,
): CreatorSocialOwner | null {
  const handle = normalizeCreatorSocialHandle(provider, rawHandle);
  if (!handle) return null;

  const groupHandle = normalizeCreatorSocialHandle(provider, GROUP.socials[provider]?.handle);
  if (groupHandle === handle) return { handle, memberSlug: null, accountLabel: GROUP.name };

  for (const member of MEMBERS) {
    const connected = member.socials.some(
      (social) => social.platform === provider
        && normalizeCreatorSocialHandle(provider, social.handle || social.url) === handle,
    );
    if (connected) return { handle, memberSlug: member.slug, accountLabel: member.stageName };
  }
  return null;
}
