import type { PlayerChannelContext } from "@/components/providers/PlayerProvider";

export function PlayerNetworkWatermark({
  channel,
  compact = false,
}: {
  channel: PlayerChannelContext | null;
  compact?: boolean;
}) {
  if (!channel?.artwork) return null;

  return (
    <span
      role="img"
      aria-label={`${channel.title} is the active channel`}
      className={`watch-player-network-watermark pointer-events-none absolute z-[18] flex select-none items-end justify-end ${
        compact
          ? "bottom-12 right-2"
          : "bottom-2 right-2 sm:bottom-3 sm:right-3"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={channel.artwork}
        alt=""
        aria-hidden
        className={`h-auto w-auto object-contain opacity-85 drop-shadow-[0_2px_7px_rgba(0,0,0,.9)] ${
          compact
            ? "max-h-8 max-w-[5.5rem]"
            : "max-h-11 max-w-[8rem] sm:max-h-12 sm:max-w-[10rem]"
        }`}
      />
    </span>
  );
}
