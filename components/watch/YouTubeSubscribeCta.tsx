"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { SocialIcon } from "@/components/ui/SocialIcon";

type SubscriptionState =
  | { status: "loading" }
  | { status: "subscribed" }
  | {
      status: "not_subscribed" | "unknown";
      subscribeHref?: string | null;
      channelName?: string;
    };

export function YouTubeSubscribeCta({ memberSlug }: { memberSlug: string }) {
  const cacheKey = memberSlug.trim().toLowerCase();
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<SubscriptionState>({ status: "loading" });

  useEffect(() => {
    if (authLoading) return;
    const controller = new AbortController();
    setState({ status: "loading" });
    void fetch(`/api/youtube/subscription-status?member=${encodeURIComponent(cacheKey)}`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (result) => {
        if (!result.ok) throw new Error(`subscription status ${result.status}`);
        return result.json() as Promise<Exclude<SubscriptionState, { status: "loading" }>>;
      })
      .then((next) => {
        setState(next.status === "subscribed"
          ? { status: "subscribed" }
          : {
              status: next.status === "not_subscribed" ? "not_subscribed" : "unknown",
              subscribeHref: next.subscribeHref,
              channelName: next.channelName,
            });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ status: "unknown" });
      });
    return () => controller.abort();
  }, [authLoading, cacheKey, user?.id]);

  // Do not flash a subscribe prompt for viewers already confirmed subscribed.
  if (state.status === "loading" || state.status === "subscribed" || !state.subscribeHref) return null;

  const channelName = state.channelName ?? cacheKey;
  return (
    <a
      className="watch-twitch-subscribe watch-youtube-subscribe"
      href={state.subscribeHref}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Subscribe to ${channelName} on YouTube`}
    >
      <span className="watch-twitch-subscribe-icon" aria-hidden="true">
        <SocialIcon platform="youtube" size={14} />
      </span>
      <span className="watch-twitch-subscribe-copy">
        <strong>Subscribe</strong>
        <small>Free on YouTube</small>
      </span>
    </a>
  );
}
