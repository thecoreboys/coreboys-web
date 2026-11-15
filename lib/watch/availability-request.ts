import { contentReferencesIncludingQuotes, type ContentIdentityInput } from "@/lib/content-identity";

export const MAX_AVAILABILITY_IDENTITIES = 1_000;

/** Public identities only, including quoted sources that are not separate cards. */
export function availabilityRequestItems(items: readonly ContentIdentityInput[]): ContentIdentityInput[] {
  const output = new Map<string, ContentIdentityInput>();
  for (const item of items) {
    const group = new Map(contentReferencesIncludingQuotes(item).map((reference) => {
      const identity: ContentIdentityInput = {
        id: reference.id, platform: reference.platform, provider: reference.provider, providerId: reference.providerId,
        canonicalId: reference.canonicalId, canonicalProviderId: reference.canonicalProviderId,
        sourceUrl: reference.sourceUrl, url: reference.url, href: reference.href,
        x: reference.x?.statusId ? { statusId: reference.x.statusId } : undefined,
        twitch: reference.twitch?.vodId ? { vodId: reference.twitch.vodId } : undefined,
        dvr: reference.dvr?.twitchVodId ? { twitchVodId: reference.dvr.twitchVodId } : undefined,
      };
      return [JSON.stringify(identity), identity] as const;
    }).filter(([key]) => !output.has(key)));
    // Keep each parent and its quoted identities together at the request cap.
    if (output.size + group.size > MAX_AVAILABILITY_IDENTITIES) break;
    for (const [key, identity] of group) output.set(key, identity);
  }
  return [...output.values()];
}
