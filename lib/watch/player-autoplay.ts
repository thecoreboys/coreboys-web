export type FullPlayerMode = "theater" | "mini";

export function shouldStartFullPlayerMuted(
  _mode: FullPlayerMode,
  _playerPage: boolean,
  _guideLivePlayback: boolean,
): boolean {
  // Browsers only permit automatic media starts reliably when they are muted.
  // This must apply to the compact player too: a channel page normally tunes
  // into that surface first, before it can be expanded into Theater.
  //
  // Sound is still an intentional viewer action through the player controls;
  // it is never treated as part of an automatic start.
  return true;
}

export function shouldUpgradeTwitchLiveAutoplay({
  isTwitchLive,
  mode,
  playerPage,
  guideLivePlayback,
  playing,
  mutedIntent,
}: {
  isTwitchLive: boolean;
  mode: FullPlayerMode;
  playerPage: boolean;
  guideLivePlayback: boolean;
  playing: boolean;
  mutedIntent: boolean;
}): boolean {
  return isTwitchLive
    && !playing
    && !mutedIntent
    && shouldStartFullPlayerMuted(mode, playerPage, guideLivePlayback);
}

export function withTwitchAutoplayPermissions(current: string | null): string {
  const permissions = (current ?? "")
    .split(";")
    .map((permission) => permission.trim())
    .filter(Boolean);

  for (const required of ["autoplay", "encrypted-media", "picture-in-picture", "fullscreen"]) {
    const present = permissions.some((permission) => permission.split(/\s+/, 1)[0] === required);
    if (!present) permissions.push(required);
  }

  return permissions.join("; ");
}
