"use client";

import { useEffect, useMemo } from "react";
import type { CuratedChannelRail } from "@/lib/watch/creator-platform-rails";
import {
  instagramPublicEmbeds,
  TIKTOK_EMBED_SCRIPT_SRC,
  tiktokCreatorEmbed,
} from "@/lib/watch/public-social-embeds";
import styles from "./CreatorPlatformRails.module.css";

// TikTok still uses its public embed as a fallback. Instagram content is
// linked directly because its iframe often renders a provider error page for
// removed, restricted, or otherwise unavailable posts.

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
      <p className={styles.embedNotice}>
        Instagram sometimes removes or restricts public posts. Open a post directly to check whether it is still available.
      </p>
      <div className={styles.instagramLinkGrid}>
        {embeds.map((embed) => (
          <a
            className={styles.instagramLinkCard}
            data-instagram-embed-kind={embed.kind}
            href={embed.permalink}
            key={embed.key}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className={styles.instagramProfileMark} aria-hidden="true">◎</span>
            <span><strong>{embed.label}</strong><small>Open original on Instagram ↗</small></span>
          </a>
        ))}
      </div>
      <p className={styles.embedNote}>Only publicly available posts can be opened. The CORE library keeps showing cached artwork when Instagram restricts an embed.</p>
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
