type HeroAudioPlayer = { setMuted?: (muted: boolean) => void; setVolume?: (volume: number) => void; play?: () => void };

/** Called from the viewer's sound gesture; muting alone must not start playback. */
export function setTwitchHeroSound(player: HeroAudioPlayer | null, muted: boolean) {
  if (!player) return;
  if (!muted) player.setVolume?.(1);
  player.setMuted?.(muted);
  if (!muted) player.play?.();
}
