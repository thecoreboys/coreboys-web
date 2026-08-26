"use client";

import { ExternalLink, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PlatformLogo } from "@/components/clips/PlatformLogo";
import { useTheme } from "@/components/providers/ThemeProvider";
import {
  X_EMBED_PREFERENCE_EVENT,
  X_EMBED_PREFERENCE_KEY,
  parseXEmbedPreference,
  setXEmbedPreference,
  shouldAutoLoadXEmbed,
  type XEmbedPreference,
} from "@/lib/x/embed-preference";
import { loadXWidgets } from "@/lib/x/widgets";
import styles from "./XProfileTimeline.module.css";

type TimelineState = "idle" | "loading" | "ready" | "failed";

function privacySignalsRequireClick(): boolean {
  const nav = navigator as Navigator & {
    globalPrivacyControl?: boolean;
    connection?: { saveData?: boolean };
  };
  return nav.globalPrivacyControl === true || nav.connection?.saveData === true;
}

export function XProfileTimeline({
  profileUrl,
  handle,
}: {
  profileUrl: string;
  handle: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [manual, setManual] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [preference, setPreference] = useState<XEmbedPreference>("ask");
  const [privacySignal, setPrivacySignal] = useState(true);
  const [privacyHold, setPrivacyHold] = useState(true);
  const [state, setState] = useState<TimelineState>("idle");
  const { resolvedTheme: theme } = useTheme();

  useEffect(() => {
    const update = (stored?: string | null) => {
      const nextPreference = parseXEmbedPreference(stored ?? localStorage.getItem(X_EMBED_PREFERENCE_KEY));
      const signal = privacySignalsRequireClick();
      setPreference(nextPreference);
      setPrivacySignal(signal);
      setPrivacyHold(!shouldAutoLoadXEmbed(nextPreference, signal));
    };
    update();
    const storageChanged = (event: StorageEvent) => {
      if (event.key === X_EMBED_PREFERENCE_KEY) update(event.newValue);
    };
    const preferenceChanged = (event: Event) => {
      update((event as CustomEvent<{ preference?: string }>).detail?.preference ?? null);
    };
    window.addEventListener("storage", storageChanged);
    window.addEventListener(X_EMBED_PREFERENCE_EVENT, preferenceChanged);
    return () => {
      window.removeEventListener("storage", storageChanged);
      window.removeEventListener(X_EMBED_PREFERENCE_EVENT, preferenceChanged);
    };
  }, []);

  useEffect(() => {
    if (privacyHold && !manual) return;
    const mount = mountRef.current;
    if (!mount) return;
    let cancelled = false;
    let ready = false;
    setState("loading");
    mount.replaceChildren();

    const link = document.createElement("a");
    link.className = "twitter-timeline";
    link.href = profileUrl;
    link.textContent = `Posts by ${handle}`;
    link.dataset.dnt = "true";
    link.dataset.theme = theme;
    link.dataset.chrome = "noheader nofooter noborders transparent";
    link.dataset.tweetLimit = "6";
    link.dataset.ariaPolite = "polite";
    mount.appendChild(link);

    const markReady = () => {
      if (cancelled || ready || !mount.querySelector("iframe")) return;
      ready = true;
      setState("ready");
    };
    const observer = new MutationObserver(markReady);
    observer.observe(mount, { childList: true, subtree: true });
    const timeout = window.setTimeout(() => {
      if (!cancelled && !ready) setState("failed");
    }, 12_000);

    loadXWidgets()
      .then((widgets) => {
        if (!widgets.load) throw new Error("X timeline embeds unavailable");
        return widgets.load(mount);
      })
      .then(markReady)
      .catch(() => {
        if (!cancelled) setState("failed");
      });

    return () => {
      cancelled = true;
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, [attempt, handle, manual, privacyHold, profileUrl, theme]);

  const awaitingConsent = privacyHold && !manual;

  return (
    <article className={styles.shell} data-state={state} aria-label={`CORE timeline on X, ${handle}`}>
      <div ref={mountRef} className={styles.mount} aria-live="polite" />
      {state !== "ready" ? (
        <div className={styles.fallback}>
          <span className={styles.mark} aria-hidden="true">
            {state === "loading" ? <LoaderCircle className={styles.spinner} /> : <PlatformLogo platform="x" size={21} />}
          </span>
          <div className={styles.copy}>
            <strong>{state === "loading" ? "Opening the CORE timeline" : "Follow CORE on X"}</strong>
            <p>Catch the latest clips, updates, and conversations from the house.</p>
          </div>
          <div className={styles.actions}>
            {awaitingConsent ? (
              <button type="button" onClick={() => setManual(true)}>
                <ShieldCheck aria-hidden="true" /> Show latest posts
              </button>
            ) : state === "failed" ? (
              <button type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
            ) : null}
            <a href={profileUrl} target="_blank" rel="noopener noreferrer">
              Open {handle} on X <ExternalLink aria-hidden="true" />
            </a>
          </div>
          {awaitingConsent ? (
            <p className={styles.privacy}>Posts are provided by X and load only when you choose. Privacy-enhanced mode is on.</p>
          ) : null}
          {awaitingConsent && preference !== "always" && !privacySignal ? (
            <button
              type="button"
              className={styles.always}
              onClick={() => {
                setXEmbedPreference("always");
                setPreference("always");
                setPrivacyHold(false);
              }}
            >
              Always show X posts
            </button>
          ) : null}
        </div>
      ) : (
        <footer className={styles.footer}>
          <span>Official X timeline · Privacy-enhanced</span>
          <a href={profileUrl} target="_blank" rel="noopener noreferrer">Open {handle} <ExternalLink aria-hidden="true" /></a>
        </footer>
      )}
    </article>
  );
}
