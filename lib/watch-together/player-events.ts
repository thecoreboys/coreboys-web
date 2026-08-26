export const WATCH_PLAYBACK_STATE_EVENT = "core:watch-playback-state";
export const WATCH_PLAYBACK_CONTROL_EVENT = "core:watch-playback-control";

export type WatchPlaybackStateDetail = {
  itemKey: string | null;
  playing: boolean;
  positionSeconds: number;
  durationSeconds: number;
  observedAt: string;
};

export type WatchPlaybackControlDetail = {
  itemKey: string | null;
  action: "play" | "pause" | "seek";
  positionSeconds?: number;
};
