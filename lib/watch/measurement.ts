export type WatchMeasurementCursor = {
  item_ref: string;
  session_id: string;
  position_seconds: number;
  observed_at: string;
  received_at: string;
  remainder_seconds?: number;
};

export type WatchMeasurementInput = {
  ref: string;
  sessionId: string;
  positionSeconds: number | null;
  seconds: number;
  observedAt: string;
  receivedAt: string;
  playbackRate?: number;
};

/** Count one account's advancing playback, never seeks, retries or idle gaps. */
export function measureWatchWindow(previous: WatchMeasurementCursor | null, input: WatchMeasurementInput): { seconds: number; remainderSeconds: number } {
  const remainder = Math.max(0, Math.min(0.999999, previous?.remainder_seconds ?? 0));
  const empty = { seconds: 0, remainderSeconds: remainder };
  if (!previous || previous.item_ref !== input.ref || previous.session_id !== input.sessionId) return empty;
  const wall = (Date.parse(input.receivedAt) - Date.parse(previous.received_at)) / 1_000;
  const observed = (Date.parse(input.observedAt) - Date.parse(previous.observed_at)) / 1_000;
  const advance = (input.positionSeconds ?? NaN) - previous.position_seconds;
  const rate = input.playbackRate ?? 1;
  if (![wall, observed, advance, input.seconds].every(Number.isFinite)) return empty;
  if (!Number.isFinite(rate) || rate < 0.25 || rate > 2) return empty;
  if (wall <= 0 || observed <= 0 || wall > 45 || observed > 45 || advance <= 0 || advance > observed * rate + 2 || input.seconds <= 0) return empty;
  // Report elapsed viewing time: 2x playback is not twice as many hours watched.
  const measured = Math.max(0, Math.min(30, input.seconds, wall, observed, advance / rate)) + remainder;
  const seconds = Math.floor(measured + 1e-9);
  return { seconds, remainderSeconds: Math.max(0, measured - seconds) };
}

export function measureWatchSeconds(previous: WatchMeasurementCursor | null, input: WatchMeasurementInput): number {
  return measureWatchWindow(previous, input).seconds;
}

export function isNewWatchObservation(previous: WatchMeasurementCursor | null, observedAt: string): boolean {
  return Number.isFinite(Date.parse(observedAt)) && (!previous || Date.parse(observedAt) > Date.parse(previous.observed_at));
}

export function hasMeasuredPlaybackCompletion(position: number | null, duration: number, watchedSeconds: number, playbackRate = 1): boolean {
  return position !== null && [position, duration, watchedSeconds, playbackRate].every(Number.isFinite)
    && duration > 0 && playbackRate >= 0.25 && playbackRate <= 2
    && position >= duration * 0.9 && watchedSeconds >= duration * 0.8 / playbackRate;
}
