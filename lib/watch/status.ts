export type WatchState = "live" | "watched" | "watching" | "new" | "unwatched";

const NEW_WINDOW_MS = 14 * 86_400_000;

export function resolveWatchState(opts: {
  kind: string;
  publishedAt?: string;
  progress?: number;
  completed?: boolean;
  signedIn: boolean;
}): WatchState | null {
  if (opts.kind === "live") return "live";
  if (!opts.signedIn) return null;
  if (opts.completed) return "watched";
  if ((opts.progress ?? 0) > 0.04) return "watching";
  if (opts.publishedAt) {
    const age = Date.now() - new Date(opts.publishedAt).getTime();
    if (Number.isFinite(age) && age >= 0 && age < NEW_WINDOW_MS) return "new";
  }
  return "unwatched";
}

export function watchStateLabel(state: WatchState): string {
  switch (state) {
    case "live":
      return "Live";
    case "watched":
      return "Watched";
    case "watching":
      return "Watching";
    case "new":
      return "New";
    case "unwatched":
      return "Unwatched";
  }
}
