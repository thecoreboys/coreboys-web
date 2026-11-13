"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { useAuth } from "@/components/providers/AuthProvider";
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
import { radioPreloadNetwork, canPreloadRadioAudio } from "@/lib/radio/preload";

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
  const suppressRadioAudio = Boolean(player.audioDescription || player.current);
  const { user } = useAuth();
  const accountId = user?.id;
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
    document.documentElement.dataset.radioAudioSuppressed = suppressRadioAudio ? "true" : "false";
    return () => { delete document.documentElement.dataset.radioAudioSuppressed; };
  }, [suppressRadioAudio]);

  useEffect(() => {
    if (!settings.enabled || settings.dataSaver || player.dataSaver) return;
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (!canPreloadRadioAudio(connection)) return;

    const warm = (network: ReturnType<typeof radioPreloadNetwork>) => {
      if (!network || document.visibilityState === "hidden") return;
      // A station's fallback plus one approved alternative is enough. Loading
      // all seven stations here used nearly 2 MB before the first interaction.
      const candidates = networkTuneCandidates(network);
      const fallback = candidates.find((cue) => cue.fallback);
      const alternative = candidates.find((cue) => !cue.fallback);
      preloadRadioCues([...(fallback ? [fallback] : []), ...(alternative ? [alternative] : [])]);
    };
    const warmIntent = (event: Event) => {
      const panel = document.getElementById("dj-cora-panel");
      if (!panel || panel.dataset.voice !== "on") return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link) return;
      const url = new URL(link.href, window.location.origin);
      if (url.origin === window.location.origin) warm(radioPreloadNetwork(url.pathname));
    };
    document.addEventListener("pointerdown", warmIntent, { passive: true });
    document.addEventListener("focusin", warmIntent);
    // A route load alone is not an intention to listen. Fetch audio only
    // when a viewer chooses or focuses a station link.
    return () => {
      document.removeEventListener("pointerdown", warmIntent);
      document.removeEventListener("focusin", warmIntent);
    };
  }, [catalog, pathname, player.dataSaver, settings.dataSaver, settings.enabled]);

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
    if (!accountId) return;
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
  }, [accountId]);

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
  return (
    <RadioAudioDirector
      // The widget is shown on every page; on phones it is only the small DJ
      // on/off button. A player taking over lets a station ID that already
      // started finish (the player waits for it) but declines new lines.
      defaultExpanded
      enabled={settings.enabled && !player.audioDescription}
      allowNewCues={!player.current}
      volume={settings.volume}
      captions={settings.captions}
      cueCatalog={activeCatalog}
      tunedNetwork={tunedNetwork}
      tunerNetworks={NETWORK_CHANNELS.map(({ slug, name, artwork }) => ({ slug, name, artwork }))}
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
