"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveXFeedResponse } from "@/lib/watch/live-x-feed";
import type { WatchHomeXPost } from "@/lib/watch/x-posts";
import { advanceXPostWatermark, countNewXPosts } from "@/lib/watch/x-feed-updates";

const POLL_MS = 15_000;

export function useLiveXFeeds(initialMembers: WatchHomeXPost[], initialCrew: WatchHomeXPost[]) {
  const [feed, setFeed] = useState<LiveXFeedResponse | null>(null);
  const [connection, setConnection] = useState<"connecting" | "connected" | "retrying" | "offline">("connecting");
  const [newPosts, setNewPosts] = useState({ members: 0, crew: 0 });
  const loadRef = useRef<() => void>(() => {});

  useEffect(() => {
    let stopped = false;
    let pending = false;
    let initialized = false;
    let baselineAt = Date.now();
    let watermark = { members: null as string | null, crew: null as string | null };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const active = () => document.visibilityState !== "hidden" && navigator.onLine;
    const schedule = () => {
      clearTimeout(timer);
      if (!stopped && active()) timer = setTimeout(() => void load(), POLL_MS);
    };
    async function load() {
      if (stopped || pending || !active()) return;
      clearTimeout(timer);
      pending = true;
      controller = new AbortController();
      const deadline = setTimeout(() => controller?.abort(), 10_000);
      try {
        const response = await fetch("/api/watch/x-posts", {
          cache: "no-store", signal: controller.signal, credentials: "same-origin",
        });
        if (!response.ok) throw new Error("feed_unavailable");
        const data: LiveXFeedResponse = await response.json();
        if (!Array.isArray(data.members) || !Array.isArray(data.crew)) throw new Error("invalid_feed");
        if (stopped) return;
        if (data.status === "unavailable") throw new Error("feed_unavailable");
        if (initialized) {
          const members = countNewXPosts(data.members, watermark.members, baselineAt);
          const crew = countNewXPosts(data.crew, watermark.crew, baselineAt);
          if (members || crew) setNewPosts((current) => ({
            members: current.members + members, crew: current.crew + crew,
          }));
        }
        watermark = {
          members: advanceXPostWatermark(watermark.members, data.members),
          crew: advanceXPostWatermark(watermark.crew, data.crew),
        };
        if (!initialized) baselineAt = Date.now();
        initialized = true;
        setFeed(data);
        setConnection("connected");
      } catch {
        if (!stopped) setConnection("retrying");
      } finally {
        clearTimeout(deadline);
        pending = false;
        schedule();
      }
    }
    function resume() {
      if (!active()) {
        clearTimeout(timer);
        if (!navigator.onLine) setConnection("offline");
        return;
      }
      void load();
    }
    loadRef.current = () => void load();
    resume();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      loadRef.current = () => {};
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
    };
  }, []);

  const refresh = useCallback(() => loadRef.current(), []);
  const dismiss = useCallback((audience: "members" | "crew") => {
    setNewPosts((current) => ({ ...current, [audience]: 0 }));
  }, []);
  return {
    members: feed?.members ?? initialMembers,
    crew: feed?.crew ?? initialCrew,
    feed, connection, newPosts, refresh, dismiss,
  };
}
