"use client";

import { formatAirtime, formatWentLive, lastAiredLabel, liveForLabel } from "@/lib/watch/airtime";
import { useNow } from "@/hooks/useNow";
import { useBrowserTimeZone } from "@/hooks/useBrowserTimeZone";
import type { StreamSession } from "@/hooks/useStreamSessions";

export function LiveDuration({ startedAt, className = "" }: { startedAt?: string | null; className?: string }) {
  const now = useNow(1_000);
  const label = liveForLabel(startedAt, now);
  if (!label) return null;
  return <span className={className} suppressHydrationWarning>{label}</span>;
}

export function WentLive({ startedAt, className = "" }: { startedAt?: string | null; className?: string }) {
  const now = useNow();
  const viewerTime = useBrowserTimeZone();
  if (!startedAt) return null;
  if (!viewerTime.ready) return null;
  const label = formatWentLive(startedAt, now, viewerTime);
  if (!label) return null;
  return <span className={className}>Went live {label}</span>;
}

export function SessionStamp({
  session,
  live,
  className = "",
}: {
  session?: StreamSession | null;
  live?: { startedAt?: string };
  className?: string;
}) {
  const isActivelyLive = Boolean(live?.startedAt || (session && !session.endedAt));
  const now = useNow(isActivelyLive ? 1_000 : 30_000);
  const viewerTime = useBrowserTimeZone();
  if (live?.startedAt) {
    const dur = liveForLabel(live.startedAt, now);
    const when = viewerTime.ready ? formatWentLive(live.startedAt, now, viewerTime) : "";
    return (
      <span className={className}>
        {dur}
        {when ? ` · started ${when}` : ""}
      </span>
    );
  }
  if (session) {
    const liveOpen = !session.endedAt;
    if (liveOpen) {
      const dur = liveForLabel(session.startedAt, now);
      const when = viewerTime.ready ? formatWentLive(session.startedAt, now, viewerTime) : "";
      return (
        <span className={className}>
          {dur ?? formatAirtime(session.totalMinutes)}
          {when ? ` · started ${when}` : ""}
        </span>
      );
    }
    return (
      <span className={className}>
        {viewerTime.ready
          ? lastAiredLabel(session, now, viewerTime)
          : formatAirtime(session.totalMinutes)}
      </span>
    );
  }
  return null;
}
