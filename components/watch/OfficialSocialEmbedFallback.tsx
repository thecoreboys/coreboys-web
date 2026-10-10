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

// Official profile embed is the live public fallback; the monitor indexes individual posts and Reels.
// This public profile view updates from the platform when its embed script is available.

type InstagramEmbedWindow = Window & {
  instgrm?: {
    Embeds?: {
      process?: () => void;
    };
  };
};

function processInstagramEmbeds() {
  const process = () => (window as InstagramEmbedWindow).instgrm?.Embeds?.process?.();
  // Instagram's script can finish before React commits the blockquotes (and
  // React route changes do not reload it). Give the DOM a couple of chances
  // to settle, including when the script was already cached by another rail.
  window.requestAnimationFrame(() => {
    process();
    window.setTimeout(process, 350);
  });
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
      <div className={styles.tiktokEmbedFrame}>
        <p className={styles.embedNote}>
          Showing TikTok&apos;s official public Creator Profile Embed. If it does not load, open the profile directly.
          <a href={creator.profileUrl} target="_blank" rel="noopener noreferrer"> Open TikTok <span aria-hidden="true">↗</span></a>
        </p>
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
    </div>
  );
}

function InstagramPublicFallback({ rail }: { rail: CuratedChannelRail }) {
  const embeds = useMemo(
    () => instagramPublicEmbeds([
      ...(rail.publicEmbedUrls ?? []),
    ]).filter((embed) => embed.kind !== "profile"),
    [rail.publicEmbedUrls],
  );
  const signature = embeds.map((embed) => embed.permalink).join("|");
  const processEmbeds = useCallback(() => processInstagramEmbeds(), []);

  useEffect(() => {
    processEmbeds();
  }, [processEmbeds, signature]);

  if (!embeds.length) {
    const profileUrl = instagramPublicEmbeds([rail.sourceHref, rail.handle]).find((embed) => embed.kind === "profile")?.permalink;
    return (
      <div className={styles.instagramProfileCard} data-ingest-state={rail.ingestState ?? "unknown"}>
        <span className={styles.instagramProfileMark} aria-hidden="true">◎</span>
        <div>
          <strong>Instagram videos</strong>
          <p>Instagram only allows individual public Reels and posts to embed here. Connect the public feed or add a Reel link to show videos in this rail.</p>
        </div>
        {profileUrl ? (
          <a href={profileUrl} target="_blank" rel="noopener noreferrer">
            Open profile <span aria-hidden="true">↗</span>
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.embedFallback} data-ingest-state={rail.ingestState ?? "unknown"}>
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
      <p className={styles.embedNote}>Showing Instagram&apos;s official public embed. Official embeds show up to 10 recent public videos; Creator alerts use CORE&apos;s public-feed monitor when available.</p>
      <Script
        id="instagram-public-embed-script"
        src={INSTAGRAM_EMBED_SCRIPT_SRC}
        strategy="afterInteractive"
        onLoad={processEmbeds}
        onReady={processEmbeds}
      />
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
