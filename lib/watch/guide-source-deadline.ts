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
  return async (load: () => Promise<T>, fallback: T, timeoutMs: number, loadingFallback: T = fallback): Promise<T> => {
    if (saved && Date.now() - saved.at < freshMs) return saved.value;
    if (!pending) {
      pending = Promise.resolve().then(load).catch(() => fallback).then((value) => {
        if (value.state !== "error" && value.state !== "loading") saved = { value, at: Date.now() };
        return value;
      }).finally(() => { pending = undefined; });
    }
    // A successful older snapshot is more useful than a temporary outage.
    if (saved && Date.now() - saved.at < 30 * 60_000) { void pending.catch(() => {}); return saved.value; }
    // A response deadline is not a provider failure. Keep the shared refresh
    // alive and let clients poll for its result without showing an outage.
    return guideSourceWithDeadline(pending, loadingFallback, timeoutMs);
  };
}
