"use client";

import Script from "next/script";
import { useCallback, useEffect, useMemo } from "react";
import type { CuratedChannelRail } from "@/lib/watch/creator-platform-rails";
import {
  INSTAGRAM_EMBED_SCRIPT_SRC,
  instagramPublicEmbeds,
  TIKTOK_EMBED_SCRIPT_SRC,
  tiktokCreatorEmbed,
} from "@/lib/watch/public-social-embeds";
import styles from "./CreatorPlatformRails.module.css";

type InstagramEmbedWindow = Window & {
  instgrm?: {
    Embeds?: {
      process?: () => void;
    };
  };
};

function processInstagramEmbeds() {
  (window as InstagramEmbedWindow).instgrm?.Embeds?.process?.();
}

function NotificationLimitation() {
  return (
    <p className={styles.embedLimitation}>
      This public profile view updates from the platform. Creator alerts use CORE&apos;s public-feed monitor when available.
    </p>
  );
}

/**
 * TikTok exposes no documented manual process function. Re-run its documented
 * embed.js once after every set of creator blockquotes mounts so one CORE page
 * can initialize several configured profiles, including after client routing.
 */
export function TikTokEmbedScriptLoader({ signature }: { signature: string }) {
  useEffect(() => {
    if (!signature) return;
    const scriptId = "core-tiktok-creator-embed-script";
    document.getElementById(scriptId)?.remove();
    const script = document.createElement("script");
    script.id = scriptId;
    script.async = true;
    script.src = TIKTOK_EMBED_SCRIPT_SRC;
    script.dataset.coreTikTokCreatorEmbeds = signature;
    document.body.appendChild(script);
    return () => {
      if (script.parentNode) script.remove();
    };
  }, [signature]);
  return null;
}

function TikTokCreatorFallback({ rail }: { rail: CuratedChannelRail }) {
  const creator = tiktokCreatorEmbed(rail.handle) ?? tiktokCreatorEmbed(rail.sourceHref);
  if (!creator) {
    return (
      <div className={styles.empty} data-ingest-state={rail.ingestState ?? "unknown"} role="status">
        TikTok&apos;s official Creator Profile Embed needs a valid public @handle.
      </div>
    );
  }

  return (
    <div className={styles.embedFallback} data-ingest-state={rail.ingestState ?? "unknown"}>
      <p className={styles.embedNotice} role="status">
        Showing TikTok&apos;s official public Creator Profile Embed, which can display up to 10 recent public videos.
      </p>
      <div className={styles.tiktokEmbedFrame}>
        <blockquote
          className="tiktok-embed"
          cite={creator.profileUrl}
          data-unique-id={creator.handle}
          data-embed-type="creator"
          data-embed-from="oembed"
          style={{ maxWidth: "720px", minWidth: "288px" }}
        >
          <section>
            <a href={creator.referUrl} target="_blank" rel="noopener noreferrer">
              @{creator.handle}
            </a>
          </section>
        </blockquote>
      </div>
      <NotificationLimitation />
    </div>
  );
}

function InstagramPublicFallback({ rail }: { rail: CuratedChannelRail }) {
  const embeds = useMemo(
    () => instagramPublicEmbeds([
      rail.sourceHref,
      rail.handle,
      ...(rail.publicEmbedUrls ?? []),
    ]),
    [rail.handle, rail.publicEmbedUrls, rail.sourceHref],
  );
  const signature = embeds.map((embed) => embed.permalink).join("|");
  const processEmbeds = useCallback(() => processInstagramEmbeds(), []);

  useEffect(() => {
    processEmbeds();
  }, [processEmbeds, signature]);

  if (!embeds.length) {
    return (
      <div className={styles.empty} data-ingest-state={rail.ingestState ?? "unknown"} role="status">
        Instagram&apos;s official embed needs a valid public profile or a known public post/Reel URL.
      </div>
    );
  }

  const postCount = embeds.filter((embed) => embed.kind !== "profile").length;
  return (
    <div className={styles.embedFallback} data-ingest-state={rail.ingestState ?? "unknown"}>
      <p className={styles.embedNotice} role="status">
        Showing Instagram&apos;s official public embed
        {postCount ? ` plus ${postCount} configured public post${postCount === 1 ? "" : "s"}/Reel${postCount === 1 ? "" : "s"}.` : "."}
        {" "}Instagram&apos;s profile embed is the live public fallback while CORE&apos;s monitor indexes individual posts and Reels.
      </p>
      <div className={styles.instagramEmbedGrid}>
        {embeds.map((embed) => (
          <div className={styles.instagramEmbedFrame} key={embed.key} data-instagram-embed-kind={embed.kind}>
            <blockquote
              className="instagram-media"
              data-instgrm-permalink={embed.permalink}
              data-instgrm-version="14"
            >
              <a href={embed.permalink} target="_blank" rel="noopener noreferrer">
                {embed.label}
              </a>
            </blockquote>
          </div>
        ))}
      </div>
      <Script
        id="instagram-public-embed-script"
        src={INSTAGRAM_EMBED_SCRIPT_SRC}
        strategy="afterInteractive"
        onLoad={processEmbeds}
        onReady={processEmbeds}
      />
      <NotificationLimitation />
    </div>
  );
}

export function OfficialSocialEmbedFallback({
  rail,
}: {
  rail: CuratedChannelRail;
}) {
  if (rail.platform === "tiktok") {
    return <TikTokCreatorFallback rail={rail} />;
  }
  if (rail.platform === "instagram") {
    return <InstagramPublicFallback rail={rail} />;
  }
  return (
    <div className={styles.empty} data-ingest-state={rail.ingestState ?? "unknown"} role="status">
      No recent public posts are available.
    </div>
  );
}
