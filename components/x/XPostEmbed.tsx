"use client";

import { ExternalLink, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseXPostReference } from "@/lib/x/parsing";
import {
  X_EMBED_PREFERENCE_KEY,
  X_EMBED_PREFERENCE_EVENT,
  parseXEmbedPreference,
  shouldAutoLoadXEmbed,
  setXEmbedPreference,
  type XEmbedPreference,
} from "@/lib/x/embed-preference";
import { useTheme } from "@/components/providers/ThemeProvider";
import { XActionControls } from "./XActionControls";
import { loadXWidgets } from "@/lib/x/widgets";
import { useSeenXPost } from "./useSeenXPost";
import styles from "./XPostEmbed.module.css";

function privacySignalsRequireClick(): boolean {
  const nav = navigator as Navigator & {
    globalPrivacyControl?: boolean;
    connection?: { saveData?: boolean };
  };
  return nav.globalPrivacyControl === true || nav.connection?.saveData === true;
}

export type XPostEmbedProps = {
  postId?: string;
  postUrl: string;
  fallbackText?: string;
  featured?: boolean;
  showActions?: boolean;
  className?: string;
};

/** Lazy official X renderer with DNT enabled and a permanent link fallback. */
export function XPostEmbed({
  postId,
  postUrl,
  fallbackText,
  featured = false,
  showActions = true,
  className,
}: XPostEmbedProps) {
  const reference = useMemo(() => {
    const fromUrl = parseXPostReference(postUrl);
    if (fromUrl && (!postId || fromUrl.postId === postId)) return fromUrl;
    return postId ? parseXPostReference(postId) : null;
  }, [postId, postUrl]);
  const rootRef = useRef<HTMLElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [manual, setManual] = useState(false);
  const [preference, setPreference] = useState<XEmbedPreference>("ask");
  const [privacySignal, setPrivacySignal] = useState(true);
  const [privacyHold, setPrivacyHold] = useState(true);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const { resolvedTheme: theme } = useTheme();
  const { rootRef: seenRef, isNew } = useSeenXPost(reference?.postId);

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
      const detail = (event as CustomEvent<{ preference?: string }>).detail;
      update(detail?.preference ?? null);
    };
    window.addEventListener("storage", storageChanged);
    window.addEventListener(X_EMBED_PREFERENCE_EVENT, preferenceChanged);
    return () => {
      window.removeEventListener("storage", storageChanged);
      window.removeEventListener(X_EMBED_PREFERENCE_EVENT, preferenceChanged);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "500px 0px" });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!reference || !visible || (privacyHold && !manual)) return;
    let cancelled = false;
    const mount = mountRef.current;
    if (!mount) return;
    setState("loading");
    mount.replaceChildren();
    loadXWidgets()
      .then((widgets) => {
        if (!widgets.createTweet) throw new Error("X post embeds unavailable");
        return widgets.createTweet(reference.postId, mount, {
          align: "center",
          conversation: "none",
          dnt: true,
          theme,
          width: "100%",
        });
      })
      .then((element) => {
        if (cancelled) return;
        setState(element ? "ready" : "failed");
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });
    return () => { cancelled = true; };
  }, [manual, privacyHold, reference, theme, visible]);

  const href = reference?.url ?? "https://x.com";
  const handle = reference?.authorHandle === "i" ? undefined : reference?.authorHandle;

  return (
    <article
      ref={(element) => {
        rootRef.current = element;
        seenRef.current = element;
      }}
      className={[styles.shell, featured ? styles.featured : "", className ?? ""].filter(Boolean).join(" ")}
      data-state={state}
    >
      {isNew ? <span className={styles.newBadge}>New</span> : null}
      {featured ? <span className={styles.featuredLabel}>Featured post</span> : null}
      <div ref={mountRef} className={styles.embedMount} aria-live="polite" />

      {state !== "ready" ? (
        <div className={styles.fallback}>
          {state === "loading" ? (
            <LoaderCircle className={styles.spinner} aria-hidden="true" />
          ) : (
            <span className={styles.xMark} aria-hidden="true">𝕏</span>
          )}
          <div>
            <strong>{state === "failed" ? "This post could not be embedded" : "Post from X"}</strong>
            {fallbackText ? <p>{fallbackText}</p> : null}
          </div>
          {privacyHold && !manual ? (
            <button type="button" onClick={() => setManual(true)}>
              <ShieldCheck aria-hidden="true" />
              Load X post
            </button>
          ) : null}
          {privacyHold && !manual ? (
            <p className={styles.privacyCopy}>Loading contacts X and may let X set cookies. The embed requests DNT.</p>
          ) : null}
          {privacyHold && !manual && preference !== "always" && !privacySignal ? (
            <button
              type="button"
              className={styles.alwaysButton}
              onClick={() => {
                setXEmbedPreference("always");
                setPreference("always");
                setPrivacyHold(false);
              }}
            >
              Always load X posts
            </button>
          ) : null}
          <a href={href} target="_blank" rel="noopener noreferrer">
            View on X <ExternalLink aria-hidden="true" />
          </a>
        </div>
      ) : null}

      <footer className={styles.footer}>
        <span>Official X embed · DNT enabled</span>
        <a className={styles.permalink} href={href} target="_blank" rel="noopener noreferrer">Permalink</a>
        {showActions && reference ? (
          <XActionControls postId={reference.postId} authorHandle={handle} postUrl={href} />
        ) : (
          <a href={href} target="_blank" rel="noopener noreferrer">Open on X</a>
        )}
      </footer>
    </article>
  );
}
