"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import useSWR from "swr";
import {
  MULTIVIEW_REMOTE_API, MULTIVIEW_REMOTE_MOBILE, remoteControlSatisfied,
  type RemoteControl, type RemoteDevice, type RemoteHostState, type RemoteSession, type RemoteSource,
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
      const response = await fetch(url, { cache: "no-store", signal: requestTimeout() });
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
  accountId, sources, main, state, switchSource, applyControl,
}: {
  accountId: string | null;
  sources: RemoteSource[];
  main: string | null;
  /** Reported to the phone so it mirrors sound and maximize state. */
  state: RemoteHostState;
  switchSource: (source: string) => boolean;
  applyControl: (control: RemoteControl) => boolean;
}) {
  const [connection, setConnection] = useState<"signed-out" | "connecting" | "connected" | "reconnecting" | "secure-context-required">("signed-out");
  const snapshot = useRef({ sources, main, state, switchSource, applyControl });
  useEffect(() => {
    snapshot.current = { sources, main, state, switchSource, applyControl };
  }, [sources, main, state, switchSource, applyControl]);

  useEffect(() => {
    if (!accountId) { setConnection("signed-out"); return; }
    if (!window.crypto?.randomUUID) { setConnection("secure-context-required"); return; }
    setConnection("connecting");
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
      const serialized = JSON.stringify([state.main, state.sources, state.state]);
      try {
        const heartbeat = !registered || serialized !== lastSnapshot || Date.now() - lastHeartbeat >= 12000;
        const response = heartbeat
          ? await postMultiviewRemote({ action: "heartbeat", id, secret, device, sources: state.sources, main: state.main, state: state.state })
          : await fetch(`${MULTIVIEW_REMOTE_API}?host=${id}`, { cache: "no-store", signal: requestTimeout() });
        if (!response.ok) {
          if (!stopped) setConnection(response.status === 401 ? "signed-out" : "reconnecting");
          return;
        }
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
          setConnection("reconnecting");
          return;
        }
        setConnection("connected");
        const command = active.command;
        if (command?.status !== "pending") {
          applied = undefined;
          return;
        }
        if (applied?.revision !== command.revision) {
          const accepted = command.control
            ? snapshot.current.applyControl(command.control)
            : command.source ? snapshot.current.switchSource(command.source) : false;
          applied = { revision: command.revision, accepted };
          // Read the committed player state on the next pass before acknowledging;
          // that pass also heartbeats the new state so the phone sees it with the ack.
          if (accepted) return;
        }
        const current = snapshot.current;
        const done = command.control
          ? remoteControlSatisfied(command.control, current.state)
          : current.main === command.source;
        await postMultiviewRemote({
          action: "ack", id, secret, revision: command.revision,
          status: applied.accepted && done ? "applied" : "unavailable",
        });
      } catch {
        if (!stopped) setConnection("reconnecting");
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
  return { connection };
}
