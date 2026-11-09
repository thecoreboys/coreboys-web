export type FacePlaybackSample = { contentId: string; seconds: number; observedAt: number };

/** Identity tags require a recent provider clock, never a resume point or wall timer. */
export function facePresencePlaybackMs(sample: FacePlaybackSample | null, contentId: string | undefined, now = Date.now()): number | null {
  if (!sample || sample.contentId !== contentId || !Number.isFinite(sample.seconds) || sample.seconds < 0
    || !Number.isFinite(sample.observedAt) || now < sample.observedAt || now - sample.observedAt > 5000) return null;
  return sample.seconds * 1000;
}

export function faceTagsAtPlaybackTime<T extends { startMs: number; endMs: number | null }>(tags: T[], atMs: number | null | undefined): T[] {
  if (typeof atMs !== "number" || !Number.isFinite(atMs) || atMs < 0) return [];
  return tags.filter((tag) => tag.endMs !== null && tag.startMs <= atMs && atMs < tag.endMs);
}
