"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { beginCinematicTransition } from "@/components/watch/CinematicRouteTransition";
import { RadioAudioDirector } from "@/components/watch/RadioAudioDirector";
import { preloadRadioCues, type RadioCue } from "@/lib/radio-client";
import {
  RADIO_NETWORK_SLUGS,
  isRadioNetworkSlug,
  networkTuneCandidates,
  setHydratedPublicRadioAssets,
  type RadioCueAsset,
} from "@/lib/radio/public-catalog";
import {
  RADIO_AUDIO_SETTINGS_EVENT,
  normalizeRadioAudioSettings,
  readRadioAudioSettings,
  writeRadioAudioSettings,
  type RadioAudioSettings,
} from "@/lib/radio/settings";
import { NETWORK_CHANNELS, resolveNetworkChannel } from "@/lib/watch/channels";

type PublicCatalogResponse = {
  assets?: RadioCueAsset[];
};

type SavedAccountSettings = {
  items?: Array<{ name?: string; payload?: unknown }>;
};

function asDirectorCue(asset: RadioCueAsset): RadioCue {
  return {
    id: asset.id,
    kind: asset.kind === "tune_in" ? "network_tune_in" : asset.kind,
    audioUrl: asset.audioUrl,
    transcript: asset.transcript,
    caption: asset.transcript,
    title: asset.title,
    networkSlug: asset.networkSlug,
  };
}

/**
 * Mount once beneath PlayerProvider. It warms a small approved catalog in the
 * background, but uses no generated audio and gracefully runs on the static
 * station recordings when the database is unavailable.
 */
export function RadioAudioSystem() {
  const player = usePlayer();
  const pathname = usePathname();
  const router = useRouter();
  const [settings, setSettings] = useState<RadioAudioSettings>(() => readRadioAudioSettings());
  const [catalog, setCatalog] = useState<RadioCue[]>([]);

  useEffect(() => {
    const onSettings = (event: Event) => {
      setSettings(normalizeRadioAudioSettings((event as CustomEvent<RadioAudioSettings>).detail));
    };
    window.addEventListener(RADIO_AUDIO_SETTINGS_EVENT, onSettings);
    return () => window.removeEventListener(RADIO_AUDIO_SETTINGS_EVENT, onSettings);
  }, []);

  useEffect(() => {
    // Audio description is an accessibility track, so it always takes
    // priority over the optional station voice. The data attribute is read by
    // the click-synchronous transition code without introducing a second
    // provider or a delayed browser-gesture path.
    document.documentElement.dataset.radioAudioSuppressed = player.audioDescription ? "true" : "false";
    return () => { delete document.documentElement.dataset.radioAudioSuppressed; };
  }, [player.audioDescription]);

  useEffect(() => {
    if (!settings.enabled || settings.dataSaver || player.dataSaver) return;
    // The seven immutable station IDs are ready before the optional catalog
    // request completes. They are static recordings held in the browser cache
    // only; prewarming them neither plays sound nor calls a voice provider.
    preloadRadioCues(RADIO_NETWORK_SLUGS.flatMap((network) => networkTuneCandidates(network)));
    if (!catalog.length) return;
    // Warm one likely recorded alternative per pool only. This is static
    // browser caching, not playback and never a generation/provider request.
    const preferred = new Map<string, RadioCue>();
    for (const cue of catalog) {
      const key = `${cue.kind}:${cue.networkSlug ?? "global"}`;
      if (!preferred.has(key)) preferred.set(key, cue);
    }
    preloadRadioCues([...preferred.values()].slice(0, 8));
  }, [catalog, player.dataSaver, settings.dataSaver, settings.enabled]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/radio/catalog", {
      credentials: "same-origin",
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => response.ok ? response.json() as Promise<PublicCatalogResponse> : null)
      .then((payload) => {
        if (controller.signal.aborted || !payload?.assets) return;
        setHydratedPublicRadioAssets(payload.assets);
        setCatalog(payload.assets.map(asDirectorCue));
      })
      .catch(() => {
        // The local station recordings remain the instant tune-in fallback.
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    // Signed-in users get the same preference on another device. Anonymous
    // visitors retain the local default without a failed auth flow changing it.
    const controller = new AbortController();
    void fetch("/api/account/workspaces?kind=account-settings", {
      credentials: "same-origin",
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => response.ok ? response.json() as Promise<SavedAccountSettings> : null)
      .then((payload) => {
        const saved = payload?.items?.find((entry) => entry.name === "radio")?.payload;
        if (controller.signal.aborted || !saved) return;
        const next = normalizeRadioAudioSettings(saved);
        writeRadioAudioSettings(next);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const activeCatalog = useMemo(() => catalog.filter((cue) => {
    const network = cue.networkSlug;
    return network === null || network === undefined || isRadioNetworkSlug(network);
  }), [catalog]);

  const tunedNetwork = useMemo(() => {
    const activeId = player.channel?.id?.split(":")[0] ?? "";
    const fromPlayer = activeId ? resolveNetworkChannel(activeId) : null;
    if (fromPlayer) return fromPlayer.name;
    const match = /^\/channels\/([^/?#]+)/.exec(pathname);
    const fromRoute = match ? resolveNetworkChannel(match[1] ?? "") : null;
    if (fromRoute) return fromRoute.name;
    return pathname.startsWith("/watch") || pathname.startsWith("/guide") || pathname.startsWith("/theater") || pathname.startsWith("/shorts")
      ? "CORE Network"
      : null;
  }, [pathname, player.channel?.id]);
  const immersivePlayerPage = pathname.startsWith("/theater") || pathname.startsWith("/multiview");

  return (
    <RadioAudioDirector
      enabled={settings.enabled && !player.audioDescription}
      volume={settings.volume}
      captions={settings.captions}
      cueCatalog={activeCatalog}
      tunedNetwork={tunedNetwork}
      tunerNetworks={NETWORK_CHANNELS.map(({ slug, name, artwork }) => ({ slug, name, artwork }))}
      autoCollapse={immersivePlayerPage}
      onTuneNetwork={(slug) => {
        const target = resolveNetworkChannel(slug);
        if (!target) return;
        const current = /^\/channels\/([^/?#]+)/.exec(pathname)?.[1] ?? null;
        if (current === target.slug) return;
        const href = `/channels/${target.slug}?mode=continuous`;
        // Tuning from Theater/Shorts must leave the immersive player mode;
        // otherwise the persistent player immediately reopens over the new
        // channel route after navigation commits.
        player.minimize();
        // Tuner navigation is programmatic rather than an anchor click, so
        // explicitly stage the same saved recording used by every channel
        // link before changing the route.
        beginCinematicTransition(href);
        router.push(href as never);
      }}
      resolveLiveTakeoverCue={(event, cues) => {
        const raw = event as unknown as {
          network?: { slug?: string };
          live?: { sourceId?: string; creatorName?: string; creatorSlug?: string };
          viewer?: { wasWatchingLive?: boolean; activePlayback?: { isLive?: boolean } };
        };
        const networkSlug = event.networkSlug ?? raw.network?.slug;
        if (!networkSlug || !isRadioNetworkSlug(networkSlug)) return null;
        const sourceContentId = event.sourceContentId ?? raw.live?.sourceId;
        const viewerIsWatchingLive = event.viewerIsWatchingLive
          ?? raw.viewer?.wasWatchingLive
          ?? raw.viewer?.activePlayback?.isLive
          ?? false;
        if (!sourceContentId || viewerIsWatchingLive) return null;
        const candidate = cues.find((cue) => cue.kind === "live_takeover" && cue.networkSlug === networkSlug)
          ?? cues.find((cue) => cue.kind === "live_takeover" && !cue.networkSlug);
        if (!candidate) return null;
        return {
          cue: candidate,
          kind: "live_takeover",
          audioUrl: candidate.audioUrl,
          networkSlug,
          sourceContentId,
          creatorName: event.creatorName ?? raw.live?.creatorName ?? null,
          creatorSlug: event.creatorSlug ?? raw.live?.creatorSlug ?? null,
          viewerIsWatchingLive,
          allowWhenLive: !viewerIsWatchingLive,
          priority: 50,
          queueIfBusy: false,
        };
      }}
    />
  );
}

/** Re-exported for small settings surfaces that need the canonical network list. */
export const RADIO_AUDIO_NETWORKS = RADIO_NETWORK_SLUGS;
