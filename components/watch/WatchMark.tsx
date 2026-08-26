import { watchStateLabel, type WatchState } from "@/lib/watch/status";

export function WatchMark({
  state,
  className = "",
  inline = false,
}: {
  state: WatchState | null;
  className?: string;
  inline?: boolean;
}) {
  if (!state) return null;
  return (
    <span className={`watch-chip watch-chip-${state} ${inline ? "watch-chip-inline" : ""} ${className}`.trim()}>
      {watchStateLabel(state)}
    </span>
  );
}
