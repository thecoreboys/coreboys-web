/** A provider's unpaused flag can arrive before any media actually starts. */
export function advancingTwitchPlayback(previous: number, position: number, paused: boolean | undefined) {
  return Number.isFinite(position) && previous >= 0 && position > previous + 0.05 && paused === false;
}

export function observedTwitchLivePlayback(playingEvent: boolean, paused: boolean | undefined,
  stats: { fps?: number; playbackRate?: number; bufferSize?: number } | undefined) {
  if (!playingEvent || paused !== false || !stats) return false;
  if (typeof stats.bufferSize === "number" && stats.bufferSize <= 0) return false;
  if (typeof stats.fps === "number") return Number.isFinite(stats.fps) && stats.fps > 0;
  return typeof stats.playbackRate === "number" && Number.isFinite(stats.playbackRate)
    && stats.playbackRate > 0 && typeof stats.bufferSize === "number" && stats.bufferSize > 0;
}

/** Live Twitch has no seekable timestamp. Accumulate only consecutive verified samples. */
export function createTwitchLivePlaybackClock() {
  let lastObserved: number | null = null;
  let position = 0;
  return {
    sample(now: number, verifiedAndVisible: boolean) {
      const elapsed = lastObserved === null ? 0 : (now - lastObserved) / 1_000;
      if (verifiedAndVisible && lastObserved !== null && elapsed > 0 && elapsed <= 2.5) position += elapsed;
      lastObserved = verifiedAndVisible && Number.isFinite(now) ? now : null;
      return position;
    },
  };
}

export function createTwitchAutoplayBudget(limit = 12) {
  let visible = false;
  let attempts = 0;
  let started = false;
  let manualPause = false;
  return {
    get started() { return started; },
    get visible() { return visible; },
    get exhausted() { return !started && attempts >= limit; },
    setVisible(next: boolean) {
      if (next && !visible && !started) attempts = 0;
      visible = next;
    },
    takeAttempt() {
      if (!visible || started || manualPause || attempts >= limit) return false;
      attempts += 1;
      return true;
    },
    confirmPlayback() { started = true; },
    pause() { if (started && visible) manualPause = true; },
    restart() { attempts = 0; started = false; manualPause = false; },
  };
}
