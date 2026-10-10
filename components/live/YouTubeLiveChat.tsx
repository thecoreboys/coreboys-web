"use client";

import { useEffect, useState } from "react";

const YOUTUBE_ID = /^[0-9A-Za-z_-]{6,}$/;

/** Build YouTube's official live-chat iframe URL for the current host. */
export function youtubeLiveChatUrl(videoId: string, embedDomain: string): string | null {
  const id = videoId.trim();
  const domain = embedDomain.trim();
  if (!YOUTUBE_ID.test(id) || !domain) return null;
  const params = new URLSearchParams({
    v: id,
    embed_domain: domain,
    dark_theme: "1",
  });
  return `https://www.youtube.com/live_chat?${params.toString()}`;
}

export function YouTubeLiveChat({ videoId, title }: { videoId: string; title: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    setSrc(youtubeLiveChatUrl(videoId, window.location.hostname || "localhost"));
  }, [videoId]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-[#111116] ring-1 ring-white/10" aria-label="YouTube live chat">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-white/85">
          <span className="size-1.5 rounded-full bg-red-500" aria-hidden />
          Live chat
        </span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-white/40">YouTube</span>
      </header>
      {src ? (
        <iframe
          title={`${title} live chat`}
          src={src}
          allow="autoplay"
          referrerPolicy="origin"
          className="min-h-0 flex-1 border-0 bg-[#111116]"
        />
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center p-5 text-center text-xs text-white/45">
          Loading live chat…
        </div>
      )}
    </section>
  );
}
