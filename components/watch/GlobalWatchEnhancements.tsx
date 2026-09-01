"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// These are useful, stateful watch surfaces, but none of them contributes to
// the first paint of an editorial, account, or legal page. Keeping the
// imports behind this client boundary prevents the player, command palette,
// radio, and room runtime from becoming part of every route's initial JS.
const PersistentPlayer = dynamic(
  () => import("@/components/watch/PersistentPlayer").then((module) => module.PersistentPlayer),
  { ssr: false },
);
const RadioAudioSystem = dynamic(
  () => import("@/components/watch/RadioAudioSystem").then((module) => module.RadioAudioSystem),
  { ssr: false },
);
const WatchTogetherBridge = dynamic(
  () => import("@/components/watch/WatchTogetherBridge").then((module) => module.WatchTogetherBridge),
  { ssr: false },
);
const CinematicRouteTransition = dynamic(
  () => import("@/components/watch/CinematicRouteTransition").then((module) => module.CinematicRouteTransition),
  { ssr: false },
);
const WatchPalette = dynamic(
  () => import("@/components/watch/WatchPalette").then((module) => module.WatchPalette),
  { ssr: false },
);
const PassportPresenceBridge = dynamic(
  () => import("@/components/passport/PassportPresenceBridge").then((module) => module.PassportPresenceBridge),
  { ssr: false },
);
const PlayerChatCompanion = dynamic(
  () => import("@/components/watch/PlayerChatCompanion").then((module) => module.PlayerChatCompanion),
  { ssr: false },
);
const WatchAlertsBridge = dynamic(
  () => import("@/components/watch/WatchAlertsBridge").then((module) => module.WatchAlertsBridge),
  { ssr: false },
);

type IdleCallbackWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function isWatchSurface(pathname: string) {
  return pathname === "/"
    || pathname.startsWith("/watch")
    || pathname.startsWith("/guide")
    || pathname.startsWith("/theater")
    || pathname.startsWith("/multiview")
    || pathname.startsWith("/shorts")
    || pathname.startsWith("/dvr")
    || pathname.startsWith("/channels/");
}

function isRoomSurface(pathname: string) {
  return pathname.startsWith("/theater") || pathname.startsWith("/multiview");
}

/**
 * Defer background watch capabilities until an idle slot on non-watch pages.
 * A first interaction promotes the work immediately, so navigation and an
 * intentional command-key press never wait for the timeout.
 */
function useWatchEnhancementReadiness(pathname: string) {
  const [ready, setReady] = useState(() => isWatchSurface(pathname));

  useEffect(() => {
    if (ready || isWatchSurface(pathname)) {
      if (!ready) setReady(true);
      return;
    }

    const browserWindow = window as IdleCallbackWindow;
    let timeout: number | null = null;
    let idleHandle: number | null = null;
    const activate = () => setReady(true);

    window.addEventListener("pointerdown", activate, { once: true, passive: true });
    window.addEventListener("keydown", activate, { once: true });

    if (browserWindow.requestIdleCallback) {
      idleHandle = browserWindow.requestIdleCallback(activate, { timeout: 1_800 });
    } else {
      timeout = window.setTimeout(activate, 900);
    }

    return () => {
      window.removeEventListener("pointerdown", activate);
      window.removeEventListener("keydown", activate);
      if (idleHandle !== null) browserWindow.cancelIdleCallback?.(idleHandle);
      if (timeout !== null) window.clearTimeout(timeout);
    };
  }, [pathname, ready]);

  return ready;
}

/**
 * One small layout-level boundary for the optional watch runtime. It keeps
 * every capability available, while allowing non-watch routes to render and
 * become interactive before the large media controls are requested.
 */
export function GlobalWatchEnhancements() {
  const pathname = usePathname();
  const ready = useWatchEnhancementReadiness(pathname);

  if (!ready) return null;

  return (
    <>
      <PersistentPlayer />
      <RadioAudioSystem />
      {isRoomSurface(pathname) ? <WatchTogetherBridge /> : null}
      <CinematicRouteTransition />
      <WatchPalette />
      <PassportPresenceBridge />
      <PlayerChatCompanion />
      <WatchAlertsBridge />
    </>
  );
}
