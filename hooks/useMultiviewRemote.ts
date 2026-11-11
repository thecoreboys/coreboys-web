"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import useSWR from "swr";
import {
  MULTIVIEW_REMOTE_API, MULTIVIEW_REMOTE_MOBILE,
  type RemoteDevice, type RemoteSession, type RemoteSource,
} from "@/lib/watch/multiview-remote";

function subscribeToScreenChange(callback: () => void) {
  const media = window.matchMedia(MULTIVIEW_REMOTE_MOBILE);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

const mobileSnapshot = () => window.matchMedia(MULTIVIEW_REMOTE_MOBILE).matches;
const serverSnapshot = () => null;

export function useRemoteMobileScreen() {
  return useSyncExternalStore<boolean | null>(subscribeToScreenChange, mobileSnapshot, serverSnapshot);
}

export function useRemoteSessions(userId: string | null, interval = 8000) {
  return useSWR(
    userId ? [MULTIVIEW_REMOTE_API, userId] : null,
    async ([url]) => {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("Couldn’t check for Multiview sessions.");
      return ((await response.json()) as { sessions: RemoteSession[] }).sessions;
    },
    { refreshInterval: interval },
  );
}

const requestTimeout = () => typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(8000) : undefined;

export function postMultiviewRemote(body: object, keepalive = false) {
  return fetch(MULTIVIEW_REMOTE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive,
    signal: requestTimeout(),
  });
}

function hostDevice(): RemoteDevice {
  if (/Mac/i.test(navigator.platform)) return "mac";
  if (/Win/i.test(navigator.platform)) return "windows";
  return "computer";
}

export function useMultiviewRemoteHost({
  accountId, sources, main, switchSource,
}: {
  accountId: string | null;
  sources: RemoteSource[];
  main: string | null;
  switchSource: (source: string) => boolean;
}) {
  const snapshot = useRef({ sources, main, switchSource });
  useEffect(() => {
    snapshot.current = { sources, main, switchSource };
  }, [sources, main, switchSource]);

  useEffect(() => {
    if (!accountId || window.matchMedia("(pointer: coarse) and (hover: none)").matches) return;
    const id = window.crypto.randomUUID();
    const secret = window.crypto.randomUUID();
    const device = hostDevice();
    let timer: number | undefined;
    let stopped = false;
    let ended = false;
    let registered = false;
    let lastHeartbeat = 0;
    let lastSnapshot = "";
    let applied: { revision: number; accepted: boolean } | undefined;

    const end = () => {
      if (!registered || ended) return;
      ended = true;
      void postMultiviewRemote({ action: "end", id, secret }, true).catch(() => {});
    };

    async function poll() {
      const state = snapshot.current;
      const serialized = JSON.stringify([state.main, state.sources]);
      try {
        const heartbeat = !registered || serialized !== lastSnapshot || Date.now() - lastHeartbeat >= 12000;
        const response = heartbeat
          ? await postMultiviewRemote({ action: "heartbeat", id, secret, device, sources: state.sources, main: state.main })
          : await fetch(`${MULTIVIEW_REMOTE_API}?host=${id}`, { cache: "no-store", signal: requestTimeout() });
        if (!response.ok) return;
        if (heartbeat) {
          registered = true;
          lastHeartbeat = Date.now();
          lastSnapshot = serialized;
        }
        if (stopped) {
          end();
          return;
        }
        const payload = await response.json() as { session?: RemoteSession; sessions?: RemoteSession[] };
        if (stopped) return;
        const active = payload.session ?? payload.sessions?.[0];
        if (!active) {
          registered = false;
          applied = undefined;
          return;
        }
        const command = active.command;
        if (command?.status !== "pending") {
          applied = undefined;
          return;
        }
        if (applied?.revision !== command.revision) {
          const accepted = snapshot.current.switchSource(command.source);
          applied = { revision: command.revision, accepted };
          // Read the committed player state on the next pass before acknowledging.
          if (accepted) return;
        }
        await postMultiviewRemote({
          action: "ack", id, secret, revision: command.revision,
          status: applied.accepted && snapshot.current.main === command.source ? "applied" : "unavailable",
        });
      } catch {
        // A connection drop leaves the player running and the lease expires on its own.
      } finally {
        if (!stopped) timer = window.setTimeout(poll, registered ? 1500 : 5000);
      }
    }

    const stop = () => {
      stopped = true;
      window.clearTimeout(timer);
      end();
    };
    const onPageHide = (event: PageTransitionEvent) => {
      if (!event.persisted) stop();
    };
    window.addEventListener("pagehide", onPageHide);
    void poll();
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      stop();
    };
  }, [accountId]);
}
