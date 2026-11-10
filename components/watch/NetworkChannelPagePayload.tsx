"use client";

import { useCallback, useMemo, useState, type ComponentProps } from "react";
import useSWR from "swr";
import { unpackChannelPageSnapshot, type ChannelPageSnapshot } from "@/lib/watch/channel-page-snapshot";
import type { CompletedLiveInterruption } from "@/lib/watch/continuous-schedule";
import { NetworkChannelPage } from "./NetworkChannelPage";

export type NetworkChannelPayloadProps = Omit<ComponentProps<typeof NetworkChannelPage>, "items" | "continuousItems" | "hub" | "scheduleSnapshot" | "railTotals" | "onCompletedLiveInterruptions"> & {
  initialSnapshot: ChannelPageSnapshot;
};

export function NetworkChannelPagePayload({ initialSnapshot, ...props }: NetworkChannelPayloadProps) {
  const [interruptions, setInterruptions] = useState("[]");
  const onCompletedLiveInterruptions = useCallback((entries: readonly CompletedLiveInterruption[]) => {
    const serialized = JSON.stringify(entries.map((entry) => ({
      id: entry.item.id, platform: entry.item.platform, startsAtMs: entry.startsAtMs, endsAtMs: entry.endsAtMs,
    })));
    setInterruptions((previous) => previous === serialized ? previous : serialized);
  }, []);
  const { data, error, mutate } = useSWR<ChannelPageSnapshot>([
    `/api/watch/channels/${props.channel.slug}/snapshot?mode=${props.mode}`, interruptions,
  ], async ([url, completed]: [string, string]) => {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: completed });
    if (!response.ok) throw new Error("Channel update unavailable");
    return response.json();
  }, {
    fallbackData: initialSnapshot, keepPreviousData: true,
    revalidateOnMount: interruptions !== "[]", revalidateOnFocus: true,
    refreshInterval: 60_000, refreshWhenHidden: false, errorRetryCount: 2,
  });
  const content = useMemo(() => unpackChannelPageSnapshot(data ?? initialSnapshot), [data, initialSnapshot]);
  return <NetworkChannelPage {...props} {...content} onCompletedLiveInterruptions={onCompletedLiveInterruptions}
    scheduleUpdateFailed={Boolean(error)} onRefreshSchedule={() => { void mutate(); }} />;
}
