"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "coreboys:x-posts-seen:v1";
const SEEN_EVENT = "coreboys:x-post-seen";
const RETENTION_MS = 210 * 24 * 60 * 60 * 1000;
const MAX_RECORDS = 1_500;

type SeenPosts = Record<string, number>;

function readSeenPosts(): SeenPosts {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const cutoff = Date.now() - RETENTION_MS;
    return Object.fromEntries(
      Object.entries(parsed).filter(([id, value]) =>
        /^\d{5,25}$/.test(id) && typeof value === "number" && Number.isFinite(value) && value >= cutoff,
      ),
    );
  } catch {
    return {};
  }
}

function saveSeenPost(postId: string): void {
  const records = readSeenPosts();
  records[postId] = Date.now();
  const trimmed = Object.entries(records)
    .sort(([, a], [, b]) => b - a)
    .slice(0, MAX_RECORDS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(trimmed)));
  } catch {
    // Private browsing or a full storage quota should never block the post.
  }
  window.dispatchEvent(new CustomEvent(SEEN_EVENT, { detail: { postId } }));
}

/**
 * Gives every first-party X card and official embed the same local, per-browser
 * "new until viewed" state. No viewing data is sent to CORE or X.
 */
export function useSeenXPost(postId: string | undefined) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [seen, setSeen] = useState(true);

  useEffect(() => {
    if (!postId) return;
    const update = () => setSeen(Boolean(readSeenPosts()[postId]));
    update();
    setHydrated(true);
    const onSeen = (event: Event) => {
      const detail = (event as CustomEvent<{ postId?: string }>).detail;
      if (detail?.postId === postId) setSeen(true);
    };
    window.addEventListener(SEEN_EVENT, onSeen);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(SEEN_EVENT, onSeen);
      window.removeEventListener("storage", update);
    };
  }, [postId]);

  const markSeen = useCallback(() => {
    if (!postId || seen) return;
    setSeen(true);
    saveSeenPost(postId);
  }, [postId, seen]);

  useEffect(() => {
    const root = rootRef.current;
    if (!postId || !root || seen || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && entry.intersectionRatio >= 0.45) {
        markSeen();
        observer.disconnect();
      }
    }, { threshold: [0.45] });
    observer.observe(root);
    return () => observer.disconnect();
  }, [markSeen, postId, seen]);

  return {
    rootRef,
    isNew: hydrated && !seen,
  };
}
