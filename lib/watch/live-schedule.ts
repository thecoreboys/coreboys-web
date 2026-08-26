/**
 * Live streams do not expose a dependable end time. A schedule still needs a
 * bounded, stable forecast so the next program does not move every time the
 * UI clock ticks. Reforecast only on a half-hour boundary (or when the
 * provider's reported duration is still in the future).
 */
export const LIVE_SCHEDULE_FORECAST_BUCKET_MS = 30 * 60 * 1_000;

export function projectedLiveEndMs(
  startsAtMs: number,
  reportedDurationMs: number,
  nowMs: number,
): number {
  const safeStart = Number.isFinite(startsAtMs) ? startsAtMs : nowMs;
  const safeDuration = Number.isFinite(reportedDurationMs)
    ? Math.max(0, reportedDurationMs)
    : 0;
  const reportedEnd = safeStart + safeDuration;

  // A live broadcast that is still inside a reported/programmed window can
  // retain that exact duration. Once it has overrun, carry it to the next
  // shared half-hour boundary instead of using `now + 30 minutes`, which
  // shifts the following program every second.
  if (reportedEnd > nowMs) return reportedEnd;
  return (Math.floor(nowMs / LIVE_SCHEDULE_FORECAST_BUCKET_MS) + 1)
    * LIVE_SCHEDULE_FORECAST_BUCKET_MS;
}
