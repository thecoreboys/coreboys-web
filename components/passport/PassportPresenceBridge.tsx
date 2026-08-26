"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Radio, Sparkles, X } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePlayerOptional } from "@/components/providers/PlayerProvider";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { usePassport } from "@/hooks/usePassport";
import type { PassportActionResponse, PassportActiveEvent } from "@/lib/passport/types";
import { matchPassportEventForPlayback, passportHeartbeatMarker } from "./passport-utils";
import styles from "./PassportPresenceBridge.module.css";

type EligibleClaim = {
  event: PassportActiveEvent;
  editionId?: string;
  watchSeconds?: number;
};

function stableSessionId(eventId: string) {
  const key = `core-passport-presence:${eventId}`;
  try {
    const known = sessionStorage.getItem(key);
    if (known && /^[A-Za-z0-9_-]{12,120}$/.test(known)) return known;
    const created = crypto.randomUUID();
    sessionStorage.setItem(key, created);
    return created;
  } catch {
    return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

function eligibleFromResult(result: unknown): { eligible: boolean; editionId?: string; watchSeconds?: number } {
  if (!result || typeof result !== "object") return { eligible: false };
  const value = result as Record<string, unknown>;
  const claim = value.claim && typeof value.claim === "object" ? value.claim as Record<string, unknown> : value;
  return {
    eligible: claim.eligible === true || claim.claimable === true || claim.canClaim === true,
    editionId: typeof claim.editionId === "string" ? claim.editionId : undefined,
    watchSeconds: typeof claim.watchSeconds === "number" ? claim.watchSeconds : undefined,
  };
}

/**
 * Mount once inside AuthProvider + PlayerProvider. It never invents presence:
 * playback progress must have advanced recently, the tab must be visible, and
 * the active media must exactly match a control-room event reference.
 */
export function PassportPresenceBridge() {
  const { user } = useAuth();
  const player = usePlayerOptional();
  const { map } = useWatchProgress();
  const passport = usePassport(Boolean(user));
  const [visible, setVisible] = useState(true);
  const [eligible, setEligible] = useState<EligibleClaim | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimOutcome, setClaimOutcome] = useState<"card" | "attendance" | null>(null);
  const sentMarkers = useRef(new Set<string>());

  useEffect(() => {
    setClaimOutcome(null);
  }, [eligible?.event.id]);

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const current = player?.current ?? null;
  const match = useMemo(
    () => matchPassportEventForPlayback(passport.passport?.activeEvents ?? [], current),
    [current, passport.passport?.activeEvents],
  );
  const event = match?.event ?? null;
  const mark = current ? map[current.key] : undefined;
  const marker = event && current && mark?.positionUpdatedAt
    ? passportHeartbeatMarker(event.id, current.key, mark.seconds, event.heartbeatIntervalSeconds)
    : null;
  const dashboardClaimEvent = useMemo(() => {
    const events = passport.passport?.activeEvents ?? [];
    return events.find((candidate) => candidate.claimState === "ready")
      ?? events.find((candidate) => candidate.claimState === "pending_certification")
      ?? null;
  }, [passport.passport?.activeEvents]);

  useEffect(() => {
    if (!dashboardClaimEvent) return;
    setEligible((currentClaim) => currentClaim?.event === dashboardClaimEvent
      ? currentClaim
      : { event: dashboardClaimEvent, watchSeconds: dashboardClaimEvent.watchSeconds });
  }, [dashboardClaimEvent]);

  useEffect(() => {
    if (eligible?.event.claimState !== "pending_certification") return;
    const timer = window.setInterval(() => { void passport.refresh(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [eligible?.event.claimState, passport.refresh]);

  useEffect(() => {
    if (!user || !current || !event || !match || !visible || !mark?.positionUpdatedAt || !marker) return;
    const updatedAt = Date.parse(mark.positionUpdatedAt);
    const freshnessWindow = Math.max(25, event.heartbeatIntervalSeconds * 2 + 5) * 1_000;
    const progressedRecently = Number.isFinite(updatedAt) && Date.now() - updatedAt <= freshnessWindow;
    if (!progressedRecently || sentMarkers.current.has(marker)) return;
    sentMarkers.current.add(marker);
    if (sentMarkers.current.size > 120) sentMarkers.current = new Set(Array.from(sentMarkers.current).slice(-60));
    void fetch("/api/account/passport/action", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "presence.heartbeat",
        payload: {
          eventId: event.id,
          sessionId: stableSessionId(event.id),
          playbackRef: match.playbackRef,
          positionSeconds: Math.max(0, Math.trunc(mark.positionSeconds)),
          playing: true,
          visible: true,
        },
      }),
    })
      .then((response) => response.ok ? response.json() as Promise<PassportActionResponse> : null)
      .then((response) => {
        const status = eligibleFromResult(response?.result);
        if (status.eligible) {
          setEligible({
            event: {
              ...event,
              presenceState: "eligible",
              watchSeconds: status.watchSeconds ?? event.watchSeconds,
              claimState: event.state === "certified" ? "ready" : "pending_certification",
              canClaim: event.state === "certified",
            },
            editionId: status.editionId,
            watchSeconds: status.watchSeconds,
          });
          void passport.refresh();
        }
      })
      .catch(() => {});
  }, [current, event, mark?.positionSeconds, mark?.positionUpdatedAt, marker, match, passport.refresh, user, visible]);

  const claim = useCallback(async () => {
    if (!eligible?.event.canClaim || claiming) return;
    setClaiming(true);
    try {
      const body = await passport.claimPresence(eligible.event.id, eligible.editionId) as PassportActionResponse;
      const result = body.result && typeof body.result === "object"
        ? body.result as Record<string, unknown>
        : null;
      const awardedCards = Array.isArray(result?.awardedCards) ? result.awardedCards : [];
      setClaimOutcome(awardedCards.length ? "card" : "attendance");
      await passport.refresh();
      window.setTimeout(() => setEligible(null), 3500);
    } catch {
      // Keep the card available so a transient connection failure can be retried.
    } finally {
      setClaiming(false);
    }
  }, [claiming, eligible, passport]);

  if (!eligible) return null;
  const claimed = claimOutcome !== null;
  const pendingCertification = !claimed && eligible.event.claimState === "pending_certification";
  return (
    <aside className={styles.toast} aria-live="polite" aria-label="Passport reward available">
      <span className={styles.icon}>{claimed ? <Check aria-hidden="true" /> : <Sparkles aria-hidden="true" />}</span>
      <div className={styles.copy}><span>{claimOutcome === "card" ? "Memory added" : claimOutcome === "attendance" ? "Attendance verified" : pendingCertification ? "Attendance recorded" : "Moment Card ready"}</span><strong>{eligible.event.title}</strong><small>{claimOutcome === "card" ? "It is now in your Memory Book." : claimOutcome === "attendance" ? "No card edition is attached yet; your verified attendance is saved." : pendingCertification ? "An independent operator must certify the event before permanent rewards can be claimed." : "Your verified live presence is ready to add to your Passport."}</small></div>
      {!claimed && eligible.event.canClaim ? <button type="button" className={styles.claim} onClick={() => void claim()} disabled={claiming}><Radio aria-hidden="true" /> {claiming ? "Claiming…" : "Claim card"}</button> : null}
      <button type="button" className={styles.close} onClick={() => setEligible(null)} aria-label="Dismiss Passport reward"><X aria-hidden="true" /></button>
    </aside>
  );
}
