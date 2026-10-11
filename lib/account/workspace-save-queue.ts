/** Coalesce rapid preference changes and serialize writes so older snapshots
 * cannot finish after, and overwrite, a newer choice.
 */
export function createDebouncedWorkspaceSave<T>(
  save: (value: T) => Promise<void>,
  delayMs = 350,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latestValue: T;
  let hasLatestValue = false;
  let inFlight = Promise.resolve();

  const flush = (): Promise<void> => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (!hasLatestValue) return inFlight;

    const value = latestValue;
    hasLatestValue = false;
    inFlight = inFlight.catch(() => undefined).then(() => save(value));
    return inFlight;
  };

  return {
    schedule(value: T) {
      latestValue = value;
      hasLatestValue = true;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void flush().catch(() => undefined);
      }, Math.max(0, delayMs));
    },
    flush,
  };
}
