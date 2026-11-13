/** A slow optional provider must not hold the entire guide open indefinitely. */
export async function guideSourceWithDeadline<T>(work: Promise<T>, fallback: T, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work.catch(() => fallback),
      new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Retain successful optional provider data while a slow refresh runs. */
export function createGuideSourceCache<T extends { state: string }>(freshMs: number) {
  let saved: { value: T; at: number } | undefined;
  let pending: Promise<T> | undefined;
  let lastLoadFailed = false;
  return async (load: () => Promise<T>, fallback: T, timeoutMs: number, loadingFallback: T = fallback): Promise<T> => {
    if (saved && Date.now() - saved.at < freshMs) return saved.value;
    if (!pending) {
      pending = Promise.resolve().then(load).catch(() => fallback).then((value) => {
        lastLoadFailed = value.state === "error" || value.state === "loading";
        if (!lastLoadFailed) saved = { value, at: Date.now() };
        return value;
      }).finally(() => { pending = undefined; });
    }
    // A successful older snapshot is more useful than a temporary outage.
    if (saved && Date.now() - saved.at < 30 * 60_000) { void pending.catch(() => {}); return saved.value; }
    // A response deadline is not a provider failure. Keep the shared refresh
    // alive and let clients poll for its result without showing an outage.
    // "Loading" only describes a source that has never answered. Once a load
    // has failed, a slow retry must report that failure: otherwise a provider
    // that keeps failing slower than the deadline reads as "loading" forever,
    // and every Guide keeps fast-polling an uncacheable response.
    return guideSourceWithDeadline(pending, lastLoadFailed ? fallback : loadingFallback, timeoutMs);
  };
}
