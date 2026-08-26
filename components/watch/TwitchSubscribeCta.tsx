"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { SocialIcon } from "@/components/ui/SocialIcon";
import {
  DEFAULT_TWITCH_TIER_ONE_PRICE_LABEL,
  twitchSubscribeHref,
  TWITCH_TIER_ONE_PRICE_NOTE,
} from "@/lib/twitch-subscription";

type SubscriptionState =
  | { status: "loading" }
  | { status: "subscribed" }
  | {
      status: "not_subscribed" | "unknown";
      subscribeHref?: string | null;
      tierOnePrice?: string;
      priceNote?: string;
    };

export function TwitchSubscribeCta({ login }: { login: string }) {
  const cacheKey = login.trim().toLowerCase();
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<SubscriptionState>({ status: "loading" });

  useEffect(() => {
    if (authLoading) return;
    const controller = new AbortController();
    setState({ status: "loading" });
    void fetch(`/api/twitch/subscription-status?login=${encodeURIComponent(cacheKey)}`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (result) => {
        if (!result.ok) throw new Error(`subscription status ${result.status}`);
        return result.json() as Promise<Exclude<SubscriptionState, { status: "loading" }>>;
      })
      .then((next) => {
        const safe = next.status === "subscribed"
          ? { status: "subscribed" as const }
          : {
              status: next.status === "not_subscribed" ? "not_subscribed" as const : "unknown" as const,
              subscribeHref: next.subscribeHref,
              tierOnePrice: next.tierOnePrice,
              priceNote: next.priceNote,
            };
        setState(safe);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ status: "unknown" });
      });
    return () => controller.abort();
  }, [authLoading, cacheKey, user?.id]);

  // Avoid a CTA flash for confirmed subscribers while Twitch is being checked.
  if (state.status === "loading" || state.status === "subscribed") return null;

  const href = state.subscribeHref ?? twitchSubscribeHref(cacheKey);
  if (!href) return null;
  const price = state.tierOnePrice ?? DEFAULT_TWITCH_TIER_ONE_PRICE_LABEL;
  const priceNote = state.priceNote ?? TWITCH_TIER_ONE_PRICE_NOTE;

  return (
    <a
      className="watch-twitch-subscribe"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Subscribe to ${cacheKey} on Twitch. Tier 1 is ${price} on the U.S. web; local pricing may vary.`}
      title={priceNote}
    >
      <span className="watch-twitch-subscribe-icon" aria-hidden="true">
        <SocialIcon platform="twitch" size={14} />
      </span>
      <span className="watch-twitch-subscribe-copy">
        <strong>Subscribe</strong>
        <small>Tier 1 · {price}</small>
      </span>
    </a>
  );
}
