"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare, X } from "lucide-react";
import { ChatDock } from "@/components/live/chat";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { MEMBERS } from "@/lib/members";
import { Tooltip } from "@/components/base/tooltip/tooltip";

export function PlayerChatCompanion() {
  const player = usePlayer();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const routeHidden =
    pathname.startsWith("/multiview") ||
    pathname.startsWith("/theater") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/chat") ||
    player.mode === "theater";
  const liveTwitchPlayback = Boolean(
    player.current?.kind === "live" &&
      player.current.platform === "twitch" &&
      player.current.twitchLogin,
  );
  const currentMember = useMemo(() => {
    if (!liveTwitchPlayback || !player.current) return null;
    return MEMBERS.find((member) =>
      member.slug === player.current?.memberSlug
      || member.twitchLogin.toLowerCase() === player.current?.twitchLogin?.toLowerCase(),
    ) ?? null;
  }, [liveTwitchPlayback, player.current]);

  if (routeHidden || !player.current || !currentMember || !liveTwitchPlayback) return null;

  const channel = {
    login: currentMember.twitchLogin,
    displayName: currentMember.stageName,
    avatarUrl: currentMember.portrait,
    accent: currentMember.accent,
    isCore: true,
    passportChannelSlug: currentMember.slug,
  };

  return (
    <aside
      data-player-chat-companion
      data-player-chat-login={channel.login}
      className="fixed right-3 z-[86] flex flex-col items-end"
      style={{ bottom: "calc(var(--now-playing-h, 0px) + .75rem)" }}
      aria-label={`${channel.displayName} player chat`}
    >
      {open ? (
        <div className="mb-2 h-[min(66dvh,42rem)] w-[min(25rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-white/15 bg-[#101014] shadow-[0_28px_90px_rgba(0,0,0,.68)]">
          <div className="h-full">
            <ChatDock
              channels={[channel]}
              mode="focused"
              focusedLogin={channel.login}
              maxConnected={1}
              dataSaver={player.dataSaver}
              showToolbar={false}
              focusedHeaderActions={(
                <Tooltip
                  title="Close chat"
                  description="Hide the chat attached to the current live stream."
                  placement="bottom"
                >
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="grid size-9 place-items-center rounded-lg text-quaternary transition-colors hover:bg-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    aria-label="Close attached chat"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </Tooltip>
              )}
              className="h-full min-h-0"
            />
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-[#151519]/95 px-4 text-xs font-semibold text-white shadow-2xl backdrop-blur-xl transition hover:-translate-y-px hover:bg-[#202025]"
      >
        <MessageSquare className="size-4" aria-hidden />
        {open ? "Hide chat" : `${channel.displayName} chat`}
      </button>
    </aside>
  );
}
