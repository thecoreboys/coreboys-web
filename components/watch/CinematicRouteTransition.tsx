"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CarFront,
  Clapperboard,
  CreditCard,
  Crosshair,
  Crown,
  Disc3,
  Gamepad2,
  Glasses,
  Heart,
  Mic2,
  Phone,
  Pickaxe,
  RadioTower,
  Sandwich,
  Shirt,
  Sparkles,
  Swords,
  Ticket,
  TrainFront,
  Trophy,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  isRadioNetworkSlug,
  selectNetworkTuneAsset,
} from "@/lib/radio/public-catalog";
import { shouldPlayRecordedNetworkTune } from "@/lib/radio/network-switch";
import { readRadioAudioSettings } from "@/lib/radio/settings";
import { NETWORK_CHANNELS, type NetworkChannelSlug } from "@/lib/watch/channels";
import { CoreWordmark } from "@/components/brand/CoreWordmark";

// Kept broad for existing imperative callers. `routeSpec` only accepts
// network destinations and `mergeSpec` always normalizes accepted overlays to
// network, so these callers can never re-enable transitions elsewhere.
type TransitionKind = "network" | "theater" | "shorts" | "multiview" | "guide" | "return";

type TransitionSpec = {
  href: string;
  kind: TransitionKind;
  title: string;
  eyebrow: string;
  accent: string;
  artwork?: string;
  backdrop?: string;
  networkSlug?: string;
  tuningDetail?: string;
  objects?: readonly TransitionObject[];
};

type TransitionObject = {
  /** Internal name for a purely decorative transition object. */
  label: string;
  icon?: LucideIcon;
  emoji?: string;
  x: string;
  y: string;
  size: string;
  rotation: string;
  delay?: number;
  tone?: "accent" | "light" | "warm";
};

type TransitionRequest = {
  href: string;
  override?: Partial<TransitionSpec>;
  /** Imperative router calls navigate themselves after staging the overlay. */
  navigate?: boolean;
};

const TRANSITION_EVENT = "core-cinematic-transition";
const NETWORK_READY_EVENT = "core-network-route-ready";
// Keep the station handoff snappy. The overlay is a brief signal cue, not a
// loading screen: release as soon as the destination is ready and never leave
// users staring at it for multiple seconds if a provider is slow to respond.
const NETWORK_TRANSITION_INTRO_MS = 180;
const NETWORK_TRANSITION_EXIT_MS = 90;
const NETWORK_READY_FALLBACK_MS = 900;
const NETWORK_NAVIGATION_TIMEOUT_MS = 12_000;

// Player surfaces arriving at a network route wait on this promise before
// starting their own advisory. It prevents DJ Cora and the age warning from
// talking over one another while keeping a normal direct player opening fast.
let activeTuningAudio: HTMLAudioElement | null = null;
let tuningAudioCompletion = Promise.resolve();

export function waitForNetworkTuningAudio() {
  return tuningAudioCompletion;
}

export function hasNetworkTuningAudio() {
  return activeTuningAudio !== null;
}

export function skipNetworkTuningAudio() {
  if (!activeTuningAudio) return;
  activeTuningAudio.pause();
  activeTuningAudio.dispatchEvent(new Event("ended"));
}

/**
 * The station recording is still started directly from the navigation click,
 * preserving the current first-tune behavior and browser sound permission.
 * When the preloaded catalog contains approved variants, the selector avoids
 * the last one heard on that network. It never fetches or synthesizes audio
 * in this click path.
 */
const recentTuneAssetByNetwork = new Map<NetworkChannelSlug, string>();

function chooseTuningAsset(networkSlug: string | undefined) {
  if (!networkSlug || !isRadioNetworkSlug(networkSlug)) return null;
  const asset = selectNetworkTuneAsset(networkSlug, {
    previousAssetId: recentTuneAssetByNetwork.get(networkSlug) ?? null,
  });
  recentTuneAssetByNetwork.set(networkSlug, asset.id);
  return asset;
}

const NETWORK_TUNING_THEMES: Record<string, Pick<TransitionSpec, "backdrop" | "eyebrow" | "tuningDetail" | "objects">> = {
  core: {
    eyebrow: "Connecting the CORE signal",
    tuningDetail: "The house feed is coming online",
    objects: [
      { label: "Broadcast tower", icon: RadioTower, x: "11%", y: "26%", size: "4.4rem", rotation: "-9deg" },
      { label: "Creator camera", icon: Video, x: "86%", y: "24%", size: "4.8rem", rotation: "10deg", tone: "light", delay: 70 },
      { label: "Highlight clapper", icon: Clapperboard, x: "15%", y: "77%", size: "3.45rem", rotation: "-14deg", delay: 150 },
      { label: "Signal sparkle", icon: Sparkles, x: "82%", y: "74%", size: "3.7rem", rotation: "12deg", tone: "warm", delay: 105 },
    ],
  },
  adapt: {
    backdrop: "/brand/network-transitions/flock-adapt-props-v1.png",
    eyebrow: "Locking Flock frequency",
    tuningDetail: "Montage relay warming",
    objects: [
      { label: "Black Ops game case", icon: Disc3, x: "12%", y: "26%", size: "4.3rem", rotation: "-11deg" },
      { label: "Trickshot crosshair", icon: Crosshair, x: "86%", y: "23%", size: "4.1rem", rotation: "11deg", tone: "light", delay: 80 },
      { label: "Xbox controller", icon: Gamepad2, x: "16%", y: "77%", size: "4.25rem", rotation: "8deg", delay: 155 },
      { label: "Phoenix basketball", emoji: "🏀", x: "82%", y: "76%", size: "3.9rem", rotation: "-13deg", tone: "warm", delay: 105 },
      { label: "No scope arrow", icon: Swords, x: "74%", y: "12%", size: "2.6rem", rotation: "-28deg", delay: 190 },
    ],
  },
  ron: {
    backdrop: "/brand/network-transitions/stable-ron-props-v1.png",
    eyebrow: "Tuning the payphone line",
    tuningDetail: "GT3 signal · game desk online",
    objects: [
      { label: "Payphone", icon: Phone, x: "12%", y: "27%", size: "5rem", rotation: "-8deg" },
      { label: "Porsche GT3", icon: CarFront, x: "86%", y: "24%", size: "5.1rem", rotation: "10deg", tone: "light", delay: 80 },
      { label: "Fortnite pickaxe", icon: Pickaxe, x: "15%", y: "77%", size: "4.3rem", rotation: "-22deg", delay: 150 },
      { label: "FNCS trophy", icon: Trophy, x: "84%", y: "76%", size: "3.9rem", rotation: "11deg", tone: "warm", delay: 110 },
      { label: "Singing microphone", icon: Mic2, x: "73%", y: "12%", size: "2.8rem", rotation: "18deg", delay: 190 },
      { label: "Burger", icon: Sandwich, x: "27%", y: "13%", size: "2.5rem", rotation: "-9deg", delay: 225 },
    ],
  },
  lacy: {
    backdrop: "/brand/network-transitions/thugs-lacy-props-v1.png",
    eyebrow: "Patching in the IRL rig",
    tuningDetail: "Thugs field camera relay",
    objects: [
      { label: "McDonald's fries", emoji: "🍟", x: "12%", y: "26%", size: "4.4rem", rotation: "-11deg" },
      { label: "IRL camera rig", icon: Camera, x: "86%", y: "24%", size: "4.9rem", rotation: "12deg", tone: "light", delay: 75 },
      { label: "Fortnite pickaxe", icon: Pickaxe, x: "15%", y: "76%", size: "4.4rem", rotation: "-22deg", delay: 145 },
      { label: "Lacy's League trophy", icon: Trophy, x: "83%", y: "76%", size: "3.8rem", rotation: "12deg", tone: "warm", delay: 105 },
      { label: "Victory Crown", icon: Crown, x: "72%", y: "12%", size: "3rem", rotation: "-9deg", delay: 185 },
      { label: "Fast food bag", icon: Sandwich, x: "27%", y: "14%", size: "2.5rem", rotation: "7deg", delay: 220 },
    ],
  },
  marlon: {
    backdrop: "/brand/network-transitions/m3-marlon-props-v1.png",
    eyebrow: "Opening M3 backstage",
    tuningDetail: "Runway and arena relay",
    objects: [
      { label: "Swedish flag", emoji: "🇸🇪", x: "12%", y: "26%", size: "4rem", rotation: "-9deg" },
      { label: "Fashion runway pass", icon: Ticket, x: "86%", y: "24%", size: "4.8rem", rotation: "11deg", tone: "light", delay: 70 },
      { label: "Designer sunglasses", icon: Glasses, x: "15%", y: "76%", size: "4.5rem", rotation: "-8deg", delay: 145 },
      { label: "Soccer ball", emoji: "⚽", x: "83%", y: "76%", size: "3.8rem", rotation: "15deg", tone: "warm", delay: 110 },
      { label: "Model camera flash", icon: Camera, x: "72%", y: "12%", size: "2.9rem", rotation: "12deg", delay: 185 },
      { label: "Tailored suit jacket", icon: Shirt, x: "29%", y: "13%", size: "2.8rem", rotation: "-10deg", delay: 220 },
    ],
  },
  jason: {
    backdrop: "/brand/network-transitions/nms-jason-props-v1.png",
    eyebrow: "Lighting NMS after dark",
    tuningDetail: "Courtside night service online",
    objects: [
      { label: "Vietnamese flag", emoji: "🇻🇳", x: "12%", y: "26%", size: "4rem", rotation: "-8deg" },
      { label: "Basketball", emoji: "🏀", x: "86%", y: "24%", size: "4.6rem", rotation: "11deg", tone: "warm", delay: 75 },
      { label: "Valorant crosshair", icon: Crosshair, x: "15%", y: "77%", size: "4.2rem", rotation: "8deg", delay: 145 },
      { label: "Hot dog", emoji: "🌭", x: "84%", y: "76%", size: "3.6rem", rotation: "-12deg", tone: "light", delay: 105 },
      { label: "K-pop lightstick", icon: Sparkles, x: "72%", y: "12%", size: "3rem", rotation: "15deg", delay: 180 },
      { label: "Phone with DMs", icon: Phone, x: "28%", y: "13%", size: "2.65rem", rotation: "10deg", delay: 220 },
    ],
  },
  silky: {
    backdrop: "/brand/network-transitions/slg-silky-props-v1.png",
    eyebrow: "Catching the SLG city line",
    tuningDetail: "NYC signal · waves on point",
    objects: [
      { label: "Silky durag", emoji: "🧢", x: "12%", y: "26%", size: "4.25rem", rotation: "-12deg" },
      { label: "Rizz chain", icon: Sparkles, x: "86%", y: "24%", size: "4.5rem", rotation: "10deg", tone: "warm", delay: 75 },
      { label: "NYC MetroCard", icon: CreditCard, x: "15%", y: "77%", size: "4.5rem", rotation: "-9deg", delay: 145 },
      { label: "E-date phone", icon: Phone, x: "83%", y: "76%", size: "3.8rem", rotation: "13deg", tone: "light", delay: 105 },
      { label: "NYC subway", icon: TrainFront, x: "72%", y: "12%", size: "3rem", rotation: "-10deg", delay: 180 },
      { label: "Charisma heart", icon: Heart, x: "28%", y: "13%", size: "2.8rem", rotation: "9deg", delay: 220 },
    ],
  },
};

type NetworkRouteReadyDetail = { path: string };

function currentRoutePath() {
  return `${window.location.pathname}${window.location.search}`;
}

/**
 * Stages a transition for a network/channel route. Calls for every other
 * route intentionally remain no-ops so Guide, Watch, Theater, Shorts, and
 * Multiview navigation stays direct.
 */
export function beginCinematicTransition(href: string, override?: Partial<TransitionSpec>) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<TransitionRequest>(TRANSITION_EVENT, {
    detail: { href, override, navigate: false },
  }));
}

/**
 * A network page emits this after its server-backed content has committed and
 * painted. The transition therefore never releases on an arbitrary route
 * timer while the destination is still waiting on its catalog data.
 */
export function markNetworkRouteReady(path = typeof window === "undefined" ? "" : currentRoutePath()) {
  if (typeof window === "undefined" || !path) return;
  window.dispatchEvent(new CustomEvent<NetworkRouteReadyDetail>(NETWORK_READY_EVENT, {
    detail: { path },
  }));
}

function routeSpec(href: string): TransitionSpec | null {
  let url: URL;
  try {
    url = new URL(href, window.location.origin);
  } catch {
    return null;
  }
  const path = url.pathname;
  const networkMatch = /^\/channels\/([^/]+)$/.exec(path);
  if (networkMatch) {
    const network = NETWORK_CHANNELS.find((entry) => entry.slug === decodeURIComponent(networkMatch[1] ?? ""));
    if (!network) return null;
    const tuningTheme = NETWORK_TUNING_THEMES[network.slug];
    const mode = url.searchParams.get("mode");
    const isShorts = mode === "shorts";
    return {
      href,
      kind: "network",
      title: isShorts ? `${network.name} Shorts` : network.slug === "core" ? "CORE Network" : `${network.name} 24/7`,
      eyebrow: isShorts ? "Opening short-form channel" : tuningTheme?.eyebrow ?? "Tuning network",
      accent: network.accent,
      artwork: network.artwork,
      backdrop: tuningTheme?.backdrop ?? network.backdrop,
      networkSlug: network.slug,
      tuningDetail: tuningTheme?.tuningDetail,
      objects: tuningTheme?.objects,
    };
  }
  return null;
}

function mergeSpec(href: string, override?: Partial<TransitionSpec>) {
  const base = routeSpec(href);
  return base ? { ...base, ...override, href, kind: "network" as const } : null;
}

export function CinematicRouteTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const [transition, setTransition] = useState<TransitionSpec | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [loaderProgress, setLoaderProgress] = useState(0);
  const [tuningAudioPlaying, setTuningAudioPlaying] = useState(false);
  const transitionStartedAt = useRef(0);
  const navigationTimer = useRef<number | null>(null);
  const releaseTimer = useRef<number | null>(null);
  const released = useRef(false);
  const tuningAudio = useRef<HTMLAudioElement | null>(null);

  const playTuningAudio = useCallback((networkSlug: string | undefined) => {
    const settings = readRadioAudioSettings();
    if (!settings.enabled || document.documentElement.dataset.radioAudioSuppressed === "true") return;
    const asset = chooseTuningAsset(networkSlug);
    if (!asset) return;
    if (tuningAudio.current) {
      tuningAudio.current.pause();
      tuningAudio.current.dispatchEvent(new Event("ended"));
    }
    // This is a saved, approved DJ Cora recording. There is deliberately no
    // Web Audio/TTS layer here, so each listener only reuses a cached static
    // asset and never creates an audio-generation request.
    const audio = new Audio(asset.audioUrl);
    audio.preload = "auto";
    audio.volume = settings.volume;
    tuningAudio.current = audio;
    activeTuningAudio = audio;
    tuningAudioCompletion = new Promise<void>((resolve) => {
      const complete = () => {
        audio.removeEventListener("ended", complete);
        audio.removeEventListener("error", complete);
        if (activeTuningAudio === audio) activeTuningAudio = null;
        if (tuningAudio.current === audio) tuningAudio.current = null;
        setTuningAudioPlaying(false);
        resolve();
      };
      audio.addEventListener("ended", complete, { once: true });
      audio.addEventListener("error", complete, { once: true });
      // A navigation click is a user gesture; if the browser still declines
      // sound, release the next announcement immediately rather than leave a
      // player behind an impossible audio gate.
      void audio.play().then(() => setTuningAudioPlaying(true)).catch(complete);
    });
  }, []);

  const skipTuningAudio = useCallback(() => {
    skipNetworkTuningAudio();
  }, []);

  const clearTimers = useCallback(() => {
    if (navigationTimer.current !== null) window.clearTimeout(navigationTimer.current);
    if (releaseTimer.current !== null) window.clearTimeout(releaseTimer.current);
    navigationTimer.current = null;
    releaseTimer.current = null;
  }, []);

  const clearTransition = useCallback(() => {
    clearTimers();
    setLeaving(false);
    setLoaderProgress(0);
    setTransition(null);
    setActivePath(null);
  }, [clearTimers]);

  const releaseWhenReady = useCallback(() => {
    if (released.current) return;
    released.current = true;
    setLoaderProgress(100);
    const elapsed = Math.max(0, performance.now() - transitionStartedAt.current);
    const minimum = reducedMotion ? 0 : NETWORK_TRANSITION_INTRO_MS;
    const wait = Math.max(0, minimum - elapsed);
    releaseTimer.current = window.setTimeout(() => {
      setLeaving(true);
      releaseTimer.current = window.setTimeout(clearTransition, reducedMotion ? 0 : NETWORK_TRANSITION_EXIT_MS);
    }, wait);
  }, [clearTransition, reducedMotion]);

  const stage = useCallback((spec: TransitionSpec, destinationPath: string) => {
    clearTimers();
    // A switch between a channel's tabs is still allowed its visual handoff,
    // but DJ Cora speaks only when the listener truly changes networks. This
    // also makes an initial render of the current channel silent.
    if (shouldPlayRecordedNetworkTune(currentRoutePath(), destinationPath)) {
      playTuningAudio(spec.networkSlug);
    }
    released.current = false;
    transitionStartedAt.current = performance.now();
    setLeaving(false);
    setLoaderProgress(reducedMotion ? 100 : 8);
    setTransition(spec);
    setActivePath(destinationPath);
  }, [clearTimers, playTuningAudio, reducedMotion]);

  const begin = useCallback((href: string, override?: Partial<TransitionSpec>) => {
    const spec = mergeSpec(href, override);
    if (!spec) return false;
    const destination = new URL(href, window.location.origin);
    const destinationPath = `${destination.pathname}${destination.search}`;
    if (destinationPath === currentRoutePath()) return false;
    window.scrollTo(0, 0);
    stage(spec, destinationPath);
    navigationTimer.current = window.setTimeout(() => {
      navigationTimer.current = null;
      router.push(href as Route);
    }, reducedMotion ? 0 : 180);
    return true;
  }, [reducedMotion, router, stage]);

  useEffect(() => () => {
    clearTimers();
    skipNetworkTuningAudio();
  }, [clearTimers]);

  useEffect(() => {
    if (!transition || leaving || reducedMotion) return;
    const interval = window.setInterval(() => {
      setLoaderProgress((current) => {
        if (current >= 92) return current;
        const step = current < 44 ? 8 : current < 76 ? 4 : 1;
        return Math.min(92, current + step);
      });
    }, 135);
    return () => window.clearInterval(interval);
  }, [leaving, reducedMotion, transition]);

  useEffect(() => {
    const onRequest = (event: Event) => {
      const request = (event as CustomEvent<TransitionRequest>).detail;
      if (!request?.href) return;
      if (request.navigate === false) {
        const spec = mergeSpec(request.href, request.override);
        if (!spec) return;
        const destination = new URL(request.href, window.location.origin);
        stage(spec, `${destination.pathname}${destination.search}`);
        return;
      }
      begin(request.href, request.override);
    };
    window.addEventListener(TRANSITION_EVENT, onRequest);
    return () => window.removeEventListener(TRANSITION_EVENT, onRequest);
  }, [begin, stage]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as Element | null;
      const link = target?.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download") || link.dataset.noCinematicTransition !== undefined) return;
      const href = link.href;
      if (!href || new URL(href).origin !== window.location.origin) return;
      if (begin(href)) event.preventDefault();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [begin]);

  useEffect(() => {
    if (!transition || !activePath) return;
    const onReady = (event: Event) => {
      const ready = (event as CustomEvent<NetworkRouteReadyDetail>).detail;
      if (ready?.path !== activePath || currentRoutePath() !== activePath) return;
      releaseWhenReady();
    };
    window.addEventListener(NETWORK_READY_EVENT, onReady);
    return () => window.removeEventListener(NETWORK_READY_EVENT, onReady);
  }, [activePath, releaseWhenReady, transition]);

  useEffect(() => {
    if (!transition || !activePath || currentRoutePath() !== activePath) return;
    // Route commit means the server payload is present. This only covers an
    // exceptional missed client-ready signal (for example after an extension
    // interrupts hydration); the normal page signal releases immediately.
    const fallback = window.setTimeout(releaseWhenReady, NETWORK_READY_FALLBACK_MS);
    return () => window.clearTimeout(fallback);
  }, [activePath, pathname, releaseWhenReady, transition]);

  useEffect(() => {
    if (!transition || !activePath || currentRoutePath() === activePath) return;
    // If a server request never resolves, return control to the page that is
    // still on screen instead of trapping it behind an overlay. A normal
    // network navigation cancels this as soon as the destination commits.
    const timeout = window.setTimeout(clearTransition, NETWORK_NAVIGATION_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [activePath, clearTransition, pathname, transition]);

  if (!transition) return null;
  const loaderStatus = leaving || loaderProgress >= 100
    ? "Channel ready"
    : loaderProgress < 42
      ? "Acquiring signal"
      : loaderProgress < 76
        ? "Syncing channel guide"
        : "Warming live feed";
  return (
    <div
      className={`cinematic-route-transition cinematic-route-transition--network${transition.networkSlug ? ` cinematic-route-transition--network-${transition.networkSlug}` : ""}${leaving ? " is-leaving" : ""}`}
      style={{
        "--cinematic-accent": transition.accent,
        ...(transition.backdrop ? { "--cinematic-backdrop": `url(${transition.backdrop})` } : {}),
      } as React.CSSProperties}
      aria-live="polite"
      aria-label={`${transition.eyebrow}: ${transition.title}`}
    >
      <span className="cinematic-route-transition__grain" aria-hidden />
      <span className="cinematic-route-transition__beam cinematic-route-transition__beam--one" aria-hidden />
      <span className="cinematic-route-transition__beam cinematic-route-transition__beam--two" aria-hidden />
      {transition.objects?.length ? (
        <div className="cinematic-route-transition__objects" aria-hidden>
          {transition.objects.map((object, index) => {
            const Icon = object.icon;
            return (
              <span
                key={object.label}
                className={`cinematic-route-transition__object${object.emoji ? " is-emoji" : ""}${object.tone ? ` is-${object.tone}` : ""}`}
                style={{
                  "--object-x": object.x,
                  "--object-y": object.y,
                  "--object-size": object.size,
                  "--object-rotation": object.rotation,
                  "--object-delay": `${object.delay ?? index * 58}ms`,
                } as React.CSSProperties}
              >
                {Icon ? <Icon aria-hidden="true" /> : <span className="cinematic-route-transition__object-emoji">{object.emoji}</span>}
              </span>
            );
          })}
        </div>
      ) : null}
      <div className="cinematic-route-transition__content">
        <CoreWordmark className="cinematic-route-transition__wordmark" />
        <span className="cinematic-route-transition__eyebrow">{transition.eyebrow}</span>
        <strong>{transition.title}</strong>
        <span className="cinematic-route-transition__signal"><i /><i /><i /></span>
        <div className="cinematic-route-transition__loader" aria-hidden>
          <span className="cinematic-route-transition__loader-label"><i /> {loaderStatus}</span>
          <span className="cinematic-route-transition__loader-value">{loaderProgress}%</span>
        </div>
        <span className="cinematic-route-transition__progress" aria-hidden><i style={{ transform: `scaleX(${loaderProgress / 100})` }} /></span>
        <span className="cinematic-route-transition__status">{transition.tuningDetail ?? "Tuning your viewing room"}</span>
        {tuningAudioPlaying ? (
          <button type="button" className="cinematic-route-transition__skip" onClick={skipTuningAudio}>
            Skip DJ Cora
          </button>
        ) : null}
      </div>
    </div>
  );
}
