"use client";

import { useEffect } from "react";

/** Best-effort on-site presence ping. No-ops if signed out. */
export function SitePresence({
  kind,
  subject,
  reference,
}: {
  kind: "chat_open" | "video_play" | "live_embed";
  subject?: string;
  reference?: string;
}) {
  useEffect(() => {
    void fetch("/api/account/presence", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, subject: subject ?? null, ref: reference ?? null }),
    });
  }, [kind, subject, reference]);
  return null;
}
