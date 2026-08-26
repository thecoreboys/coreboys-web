"use client";

import { useEffect, useState } from "react";
import { X_EMBED_PREFERENCE_EVENT, X_EMBED_PREFERENCE_KEY, parseXEmbedPreference, setXEmbedPreference, type XEmbedPreference } from "@/lib/x/embed-preference";

export function XEmbedSettings() {
  const [preference, setPreference] = useState<XEmbedPreference>("ask");
  useEffect(() => {
    const read = () => setPreference(parseXEmbedPreference(localStorage.getItem(X_EMBED_PREFERENCE_KEY)));
    read();
    window.addEventListener(X_EMBED_PREFERENCE_EVENT, read);
    return () => window.removeEventListener(X_EMBED_PREFERENCE_EVENT, read);
  }, []);
  function update(next: XEmbedPreference) {
    setXEmbedPreference(next);
    setPreference(next);
  }
  return (
    <div className="my-5 rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-4">
      <p className="m-0 text-sm font-semibold text-[color:var(--ink)]">X embed preference</p>
      <p className="mt-1 text-sm text-[color:var(--ink-dim)]">Current choice: {preference === "always" ? "Always load" : "Ask on each post"}.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => update("ask")} className="rounded-lg border border-[color:var(--rule-strong)] px-3 py-2 text-xs font-semibold text-[color:var(--ink)]">Ask on each post</button>
        <button type="button" onClick={() => update("always")} className="rounded-lg bg-[color:var(--ink)] px-3 py-2 text-xs font-semibold text-[color:var(--bg)]">Always load X posts</button>
      </div>
    </div>
  );
}
