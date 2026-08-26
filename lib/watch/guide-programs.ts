const ACTIVE_TWITCH_ARCHIVE_START_TOLERANCE_MS = 2 * 60_000;

type GuideProgramIdentity = {
  slug: string;
  login: string | null;
  startsAt: string;
  endsAt: string | null;
  status: string;
  platform: string;
};

function normalizedChannelIdentity(program: GuideProgramIdentity): string {
  return (program.login || program.slug).trim().toLowerCase();
}

/**
 * Twitch exposes the recording for an active stream through its archive feed.
 * Keep that growing VOD out of the Guide until the broadcast has actually
 * ended, while preserving older broadcasts from the same channel.
 */
export function isActiveTwitchArchiveDuplicate(
  replay: GuideProgramIdentity,
  live: GuideProgramIdentity,
): boolean {
  if (replay.status !== "replay" || live.status !== "live") return false;
  if (replay.platform !== "twitch" || live.platform !== "twitch") return false;
  if (normalizedChannelIdentity(replay) !== normalizedChannelIdentity(live)) return false;

  const replayStart = Date.parse(replay.startsAt);
  const liveStart = Date.parse(live.startsAt);
  if (!Number.isFinite(replayStart) || !Number.isFinite(liveStart)) return false;
  if (Math.abs(replayStart - liveStart) > ACTIVE_TWITCH_ARCHIVE_START_TOLERANCE_MS) return false;

  // Preserve a genuinely completed short stream followed by a quick restart.
  const replayEnd = Date.parse(replay.endsAt ?? "");
  return !Number.isFinite(replayEnd) || replayEnd >= liveStart;
}

export function removeActiveTwitchArchiveDuplicates<T extends GuideProgramIdentity>(
  programs: T[],
  livePrograms: readonly GuideProgramIdentity[] = programs,
): T[] {
  const activeTwitchStreams = livePrograms.filter(
    (program) => program.status === "live" && program.platform === "twitch",
  );
  if (!activeTwitchStreams.length) return programs;

  return programs.filter(
    (program) => !activeTwitchStreams.some((live) => isActiveTwitchArchiveDuplicate(program, live)),
  );
}
