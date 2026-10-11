/** Upgrade Twitch's live preview to the larger snapshot and rotate its cache key. */
export function twitchLiveSnapshotUrl(raw: string | null | undefined, now = Date.now()): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    url.pathname = url.pathname.replace(/-\d+x\d+(?=\.[a-z\d]+$)/i, "-1280x720");
    url.searchParams.set("t", String(Math.floor(now / 60_000)));
    return url.toString();
  } catch {
    return null;
  }
}
