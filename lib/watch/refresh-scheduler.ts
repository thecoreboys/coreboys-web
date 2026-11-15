type RefreshReason = "catalog" | "live";
type Timer = ReturnType<typeof setTimeout>;

type RefreshSchedulerOptions = {
  refresh: () => void;
  isActive: () => boolean;
  now?: () => number;
  schedule?: (run: () => void, delayMs: number) => Timer;
  cancel?: (timer: Timer) => void;
};

/** Coalesce focus, visibility, polling, and provider events into one route refresh. */
export function createWatchRefreshScheduler({
  refresh,
  isActive,
  now = Date.now,
  schedule = setTimeout,
  cancel = clearTimeout,
}: RefreshSchedulerOptions) {
  let lastCatalogRefreshAt = now();
  let lastRefreshAt = -Infinity;
  let pending: RefreshReason | null = null;
  let timer: Timer | null = null;
  let scheduledAt = Infinity;

  function request(reason: RefreshReason) {
    // An observed live transition always takes precedence over routine work.
    if (pending !== "live") pending = reason;
    if (!isActive()) return;
    const time = now();
    const deadline = Math.max(
      time + 500,
      pending === "live" ? lastRefreshAt + 2_000 : lastCatalogRefreshAt + 60_000,
    );
    if (timer !== null && scheduledAt <= deadline) return;
    if (timer !== null) cancel(timer);
    scheduledAt = deadline;
    timer = schedule(() => {
      timer = null;
      scheduledAt = Infinity;
      // Preserve an urgent event while hidden/offline. Focus, visibility, or
      // reconnect will resume it instead of losing a live-state transition.
      if (!isActive()) return;
      pending = null;
      lastRefreshAt = now();
      lastCatalogRefreshAt = lastRefreshAt;
      refresh();
    }, deadline - time);
  }

  function cancelPending() {
    if (timer !== null) cancel(timer);
    timer = null;
    pending = null;
    scheduledAt = Infinity;
  }

  return { request, cancel: cancelPending };
}
