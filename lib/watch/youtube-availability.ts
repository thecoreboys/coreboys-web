export type YouTubeAccessStatus = {
  privacyStatus?: "public" | "unlisted" | "private";
  embeddable?: boolean;
};

/** A private or disabled-embed YouTube video cannot be played in CORE. */
export function isYouTubeVideoAvailable(status?: YouTubeAccessStatus): boolean {
  return status?.privacyStatus !== "private" && status?.embeddable !== false;
}

/** Successful YouTube videos.list calls omit deleted/private IDs. */
export function missingYouTubeVideoIds(
  requestedIds: readonly string[],
  returnedIds: ReadonlySet<string>,
): string[] {
  return requestedIds.filter((id) => !returnedIds.has(id));
}
