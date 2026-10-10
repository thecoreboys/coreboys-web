type LiveSource = {
  key: string;
  kind: string;
  platform: string;
  memberSlug: string | null;
  memberLabel: string;
};

export type LiveSourceGroup<T extends LiveSource = LiveSource> = {
  key: string;
  memberSlug: string | null;
  memberLabel: string;
  sources: T[];
};

/** Keep simulcast Twitch/YouTube streams together without conflating creators. */
export function groupCrossPlatformLiveSources<T extends LiveSource>(items: readonly T[]): LiveSourceGroup<T>[] {
  const byCreator = new Map<string, T[]>();
  for (const item of items) {
    if (item.kind !== "live") continue;
    const key = item.memberSlug ? `member:${item.memberSlug}` : `source:${item.key}`;
    byCreator.set(key, [...(byCreator.get(key) ?? []), item]);
  }

  const groups: LiveSourceGroup<T>[] = [];
  for (const [key, sources] of byCreator) {
    const platforms = new Set(sources.map((source) => source.platform));
    const isCrossPlatformPair = platforms.has("youtube") && platforms.has("twitch");
    if (isCrossPlatformPair) {
      groups.push({
        key,
        memberSlug: sources[0]?.memberSlug ?? null,
        memberLabel: sources[0]?.memberLabel ?? "Live creator",
        sources,
      });
      continue;
    }

    for (const source of sources) {
      groups.push({
        key: source.key,
        memberSlug: source.memberSlug,
        memberLabel: source.memberLabel,
        sources: [source],
      });
    }
  }
  return groups;
}

/** Reserve one multiview tile for a creator simulcasting on Twitch and YouTube. */
export function uniqueCrossPlatformLiveSources<T extends LiveSource>(items: readonly T[]): T[] {
  return groupCrossPlatformLiveSources(items).flatMap((group) => [group.sources[0]!]);
}
