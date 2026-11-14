"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChatSessionProvider, useChatSession } from "@/components/live/ChatSession";
import type { ChatToken } from "@/lib/twitch-chat-client";
import { MULTIVIEW_REMOTE_API, type RemoteChatMessage } from "@/lib/watch/multiview-remote";
import { ChannelLogo, type ChannelLogoProps } from "@/components/live/ChannelLogo";

const MESSAGE_LIMIT = 100;
type Message = RemoteChatMessage & { platform: "twitch" | "youtube"; tokens?: ChatToken[] };

function CombinedFeed({ youtube, youtubeReady, login, name, logoUrl, logoName, avatarUrl }: {
  youtube: RemoteChatMessage[];
  youtubeReady: boolean;
  login: string;
} & ChannelLogoProps) {
  const { mergedMessages, statusByChannel } = useChatSession();
  const scroller = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const messages = useMemo(() => {
    const twitch: Message[] = mergedMessages.map((message) => ({
      id: message.id, platform: "twitch", author: message.displayName,
      text: message.raw, time: message.receivedAt, tokens: message.tokens,
    }));
    return [...twitch, ...youtube.map((message): Message => ({ ...message, platform: "youtube" }))]
      .sort((a, b) => a.time - b.time).slice(-MESSAGE_LIMIT);
  }, [mergedMessages, youtube]);
  useEffect(() => {
    if (follow.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)]" data-lenis-prevent>
      <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--rule)] px-4 py-3 text-xs text-[color:var(--ink-dim)]">
        <ChannelLogo name={name} logoUrl={logoUrl} logoName={logoName} avatarUrl={avatarUrl} />
        <span className="mr-auto font-semibold text-[color:var(--ink)]">{name}</span>
        <span className="rounded-full bg-violet-500/15 px-2.5 py-1 font-semibold text-[color:var(--ink)]">Twitch{statusByChannel[login] === "open" ? "" : " · Connecting"}</span>
        <span className="rounded-full bg-red-500/15 px-2.5 py-1 font-semibold text-[color:var(--ink)]">YouTube{youtubeReady ? "" : " · Connecting"}</span>
      </div>
      <div
        ref={scroller}
        tabIndex={0}
        aria-label="Combined Twitch and YouTube messages"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
        onScroll={(event) => {
          const element = event.currentTarget;
          follow.current = element.scrollHeight - element.clientHeight - element.scrollTop < 48;
        }}
      >
        {messages.length ? (
          <ul className="space-y-1.5 text-sm leading-relaxed [overflow-wrap:anywhere]">
            {messages.map((message) => (
              <li key={`${message.platform}:${message.id}`} className="rounded-lg px-2 py-1">
                <span className={`mr-2 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${message.platform === "twitch" ? "bg-violet-500/15" : "bg-red-500/15"}`}>
                  {message.platform === "twitch" ? "Twitch" : "YouTube"}
                </span>
                <span className="mr-1.5 font-semibold">{message.author}</span>
                {message.tokens ? message.tokens.map((token, index) => token.kind === "text" ? token.text : (
                  // eslint-disable-next-line @next/next/no-img-element -- Twitch and third-party emotes are runtime URLs.
                  <img key={index} src={token.url} alt={token.code} loading="lazy" className="mx-0.5 inline-block max-h-5 max-w-12 align-middle" />
                )) : message.text}
              </li>
            ))}
          </ul>
        ) : <p className="p-2 text-sm text-[color:var(--ink-dim)]">Waiting for live messages…</p>}
      </div>
    </div>
  );
}

export function CombinedRemoteChat({ sessionId, videoId, login, twitchUserId, name, logoUrl, logoName, avatarUrl, fallback }: {
  sessionId: string;
  videoId: string;
  login: string;
  twitchUserId?: string;
  name: string;
  fallback: ReactNode;
} & Pick<ChannelLogoProps, "logoUrl" | "logoName" | "avatarUrl">) {
  const [youtube, setYoutube] = useState<RemoteChatMessage[]>([]);
  const [status, setStatus] = useState<"connecting" | "ready" | "unavailable">("connecting");
  const channels = useMemo(() => [{ login, userId: twitchUserId, displayName: name }], [login, name, twitchUserId]);

  useEffect(() => {
    const search = new URLSearchParams({ session: sessionId, video: videoId });
    const events = new EventSource(`${MULTIVIEW_REMOTE_API}/chat?${search}`);
    const unavailable = () => {
      window.clearTimeout(timeout);
      setStatus("unavailable");
      events.close();
    };
    const timeout = window.setTimeout(unavailable, 18000);
    events.onerror = unavailable;
    events.onmessage = (message) => {
      const event = JSON.parse(message.data) as { type: string; messages?: RemoteChatMessage[] };
      if (event.type === "unavailable") {
        unavailable();
      } else if (event.type === "ready" || event.messages?.length) {
        window.clearTimeout(timeout);
        setStatus("ready");
        const next = event.messages;
        if (next) setYoutube((previous) => [...new Map([...previous, ...next].map((entry) => [entry.id, entry])).values()].slice(-MESSAGE_LIMIT));
      }
    };
    return () => {
      window.clearTimeout(timeout);
      events.close();
    };
  }, [sessionId, videoId]);

  return status === "unavailable" ? fallback : (
    <ChatSessionProvider channels={channels} perChannelLimit={MESSAGE_LIMIT} mergedLimit={MESSAGE_LIMIT}>
      <CombinedFeed youtube={youtube} youtubeReady={status === "ready"} login={login} name={name} logoUrl={logoUrl} logoName={logoName} avatarUrl={avatarUrl} />
    </ChatSessionProvider>
  );
}
