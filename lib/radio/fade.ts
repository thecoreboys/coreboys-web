/** RAF's frame timestamp can precede performance.now() sampled in that frame. */
export function audioFadeProgress(now: number, startedAt: number, duration: number): number {
  if (duration <= 0) return 1;
  const progress = (now - startedAt) / duration;
  return Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
}
