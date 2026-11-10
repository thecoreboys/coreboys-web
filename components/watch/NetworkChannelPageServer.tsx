import "server-only";
import type { ComponentProps } from "react";
import { createChannelPageSnapshot } from "@/lib/watch/channel-page-snapshot";
import type { NetworkChannelPage as ChannelPage } from "./NetworkChannelPage";
import { NetworkChannelPagePayload } from "./NetworkChannelPagePayload";

export type { ChannelCrewMember } from "./NetworkChannelPage";

export function NetworkChannelPage({ items, continuousItems, hub, ...props }: Omit<ComponentProps<typeof ChannelPage>, "scheduleSnapshot" | "railTotals" | "onCompletedLiveInterruptions">) {
  const initialSnapshot = createChannelPageSnapshot({
    items, continuousItems, hub, channel: props.channel, mode: props.mode, now: Date.parse(props.serverNow),
  });
  return <NetworkChannelPagePayload key={`${props.channel.slug}:${props.mode}`} {...props} initialSnapshot={initialSnapshot} />;
}
