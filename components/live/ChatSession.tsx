"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  loadEmoteMap,
  startMultiChannelChatClient,
  type ChatConnectionStatus,
  type ChatMessage,
  type ChatModerationEvent,
  type ChatRoomState,
  type EmoteMap,
  type RaidEvent,
} from "@/lib/twitch-chat-client";

export type ChatSessionChannel = {
  login: string;
  userId?: string;
  displayName: string;
  avatarUrl?: string;
  channelLogoUrl?: string;
  channelLogoName?: string;
  accent?: string;
  isCore?: boolean;
  /** CORE Passport channel scope used for the viewer's chat loadout. */
  passportChannelSlug?: string;
};

type ChatNotice = {
  id: string;
  channelLogin: string;
  message: string;
  receivedAt: number;
};

export type ChatSessionValue = {
  channels: ChatSessionChannel[];
  messagesByChannel: Record<string, ChatMessage[]>;
  mergedMessages: ChatMessage[];
  statusByChannel: Record<string, ChatConnectionStatus>;
  roomStateByChannel: Record<string, ChatRoomState>;
  notices: ChatNotice[];
  lastRaid: RaidEvent | null;
  activityByChannel: Record<string, number>;
  dismissRaid: () => void;
};

const ChatSessionContext = createContext<ChatSessionValue | null>(null);

const normalizeLogin = (login: string) => login.trim().toLowerCase();
const DEFAULT_CHAT_HISTORY_LIMIT = 1000;

/**
 * Keeps the merged room feed ordered without sorting every channel's full
 * history whenever one IRC message arrives. Twitch messages normally arrive
 * in order, but a binary insert also keeps the occasional cross-channel
 * out-of-order event in the right place.
 */
export function appendMergedChatMessage(
  previous: ChatMessage[],
  message: ChatMessage,
  limit: number,
): ChatMessage[] {
  const messageKey = `${normalizeLogin(message.channelLogin)}:${message.id}`;
  if (previous.some((candidate) => `${normalizeLogin(candidate.channelLogin)}:${candidate.id}` === messageKey)) {
    return previous;
  }

  if (previous.length === 0 || previous[previous.length - 1]!.receivedAt <= message.receivedAt) {
    return [...previous, message].slice(-limit);
  }

  let lower = 0;
  let upper = previous.length;
  while (lower < upper) {
    const midpoint = Math.floor((lower + upper) / 2);
    if (previous[midpoint]!.receivedAt <= message.receivedAt) lower = midpoint + 1;
    else upper = midpoint;
  }

  const next = [...previous.slice(0, lower), message, ...previous.slice(lower)];
  return next.slice(-limit);
}

export function removeMergedChatMessages(
  previous: ChatMessage[],
  predicate: (message: ChatMessage) => boolean,
): ChatMessage[] {
  const next = previous.filter((message) => !predicate(message));
  return next.length === previous.length ? previous : next;
}

export function ChatSessionProvider({
  channels,
  children,
  enabled = true,
  perChannelLimit = DEFAULT_CHAT_HISTORY_LIMIT,
  mergedLimit = DEFAULT_CHAT_HISTORY_LIMIT,
}: {
  channels: ChatSessionChannel[];
  children: React.ReactNode;
  enabled?: boolean;
  perChannelLimit?: number;
  mergedLimit?: number;
}) {
  const channelKey = channels
    .map((channel) => `${normalizeLogin(channel.login)}:${channel.userId ?? ""}`)
    .sort()
    .join("|");
  const channelsRef = useRef(channels);
  channelsRef.current = channels;
  const perChannelLimitRef = useRef(perChannelLimit);
  const mergedLimitRef = useRef(mergedLimit);
  perChannelLimitRef.current = perChannelLimit;
  mergedLimitRef.current = mergedLimit;

  const [messagesByChannel, setMessagesByChannel] = useState<Record<string, ChatMessage[]>>({});
  const [mergedMessages, setMergedMessages] = useState<ChatMessage[]>([]);
  const [statusByChannel, setStatusByChannel] = useState<Record<string, ChatConnectionStatus>>({});
  const [roomStateByChannel, setRoomStateByChannel] = useState<Record<string, ChatRoomState>>({});
  const [notices, setNotices] = useState<ChatNotice[]>([]);
  const [lastRaid, setLastRaid] = useState<RaidEvent | null>(null);
  const [activityClock, setActivityClock] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setActivityClock(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  // Keep a changed channel list from leaving disconnected history in a shared
  // room. Existing active channels retain their scrollback.
  useEffect(() => {
    const activeLogins = new Set(channels.map((channel) => normalizeLogin(channel.login)));
    setMessagesByChannel((previous) => {
      const entries = Object.entries(previous).filter(([login]) => activeLogins.has(login));
      return entries.length === Object.keys(previous).length ? previous : Object.fromEntries(entries);
    });
    setMergedMessages((previous) => {
      const next = previous.filter((message) => activeLogins.has(normalizeLogin(message.channelLogin)));
      return next.length === previous.length ? previous : next.slice(-mergedLimitRef.current);
    });
  }, [channelKey, channels]);

  useEffect(() => {
    setMessagesByChannel((previous) => {
      let changed = false;
      const next: Record<string, ChatMessage[]> = {};
      for (const [login, messages] of Object.entries(previous)) {
        const trimmed = messages.slice(-perChannelLimit);
        next[login] = trimmed;
        changed ||= trimmed.length !== messages.length;
      }
      return changed ? next : previous;
    });
    setMergedMessages((previous) => previous.length > mergedLimit ? previous.slice(-mergedLimit) : previous);
  }, [mergedLimit, perChannelLimit]);

  useEffect(() => {
    const activeChannels = channelsRef.current.map((channel) => ({
      ...channel,
      login: normalizeLogin(channel.login),
    }));

    if (!enabled || activeChannels.length === 0) {
      setStatusByChannel((previous) => {
        const next = { ...previous };
        for (const channel of activeChannels) next[channel.login] = "paused";
        return next;
      });
      return;
    }

    const emoteMaps = new Map<string, EmoteMap>();
    for (const channel of activeChannels) {
      void loadEmoteMap(channel.userId ?? "")
        .then((map) => emoteMaps.set(channel.login, map))
        .catch(() => emoteMaps.set(channel.login, new Map()));
    }

    const applyModeration = (event: ChatModerationEvent) => {
      const login = normalizeLogin(event.channelLogin);
      if (event.type === "message-delete") {
        if (!event.messageId) return;
        setMessagesByChannel((previous) => ({
          ...previous,
          [login]: (previous[login] ?? []).filter((message) => message.id !== event.messageId),
        }));
        setMergedMessages((previous) => removeMergedChatMessages(
          previous,
          (message) => normalizeLogin(message.channelLogin) === login && message.id === event.messageId,
        ));
        return;
      }
      if (event.type === "chat-clear") {
        const targetUserLogin = event.targetUserLogin ? normalizeLogin(event.targetUserLogin) : undefined;
        setMessagesByChannel((previous) => ({
          ...previous,
          [login]: targetUserLogin
            ? (previous[login] ?? []).filter(
                (message) => normalizeLogin(message.user) !== targetUserLogin,
              )
            : [],
        }));
        setMergedMessages((previous) => removeMergedChatMessages(
          previous,
          (message) => normalizeLogin(message.channelLogin) === login
            && (!targetUserLogin || normalizeLogin(message.user) === targetUserLogin),
        ));
        return;
      }
      if (event.type === "room-state") {
        setRoomStateByChannel((previous) => ({
          ...previous,
          [login]: { ...previous[login], ...event.state },
        }));
        return;
      }
      setNotices((previous) => [
        ...previous.slice(-11),
        {
          id: `${login}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          channelLogin: login,
          message: event.message,
          receivedAt: Date.now(),
        },
      ]);
    };

    return startMultiChannelChatClient({
      channels: activeChannels,
      emoteMaps,
      onStatus: (login, status) => {
        setStatusByChannel((previous) => ({ ...previous, [login]: status }));
      },
      onRaid: setLastRaid,
      onModeration: applyModeration,
      onMessage: (message) => {
        const login = normalizeLogin(message.channelLogin);
        setMessagesByChannel((previous) => {
          const existing = previous[login] ?? [];
          return {
            ...previous,
            [login]: [...existing.slice(-(perChannelLimitRef.current - 1)), message],
          };
        });
        setMergedMessages((previous) => appendMergedChatMessage(previous, message, mergedLimitRef.current));
      },
    });
  }, [channelKey, enabled]);

  const activityByChannel = useMemo(() => {
    const floor = activityClock - 60_000;
    const out: Record<string, number> = {};
    for (const channel of channels) {
      const login = normalizeLogin(channel.login);
      out[login] = (messagesByChannel[login] ?? []).filter(
        (message) => message.receivedAt >= floor,
      ).length;
    }
    return out;
  }, [activityClock, channels, messagesByChannel]);

  const value = useMemo<ChatSessionValue>(
    () => ({
      channels,
      messagesByChannel,
      mergedMessages,
      statusByChannel,
      roomStateByChannel,
      notices,
      lastRaid,
      activityByChannel,
      dismissRaid: () => setLastRaid(null),
    }),
    [
      channels,
      messagesByChannel,
      mergedMessages,
      statusByChannel,
      roomStateByChannel,
      notices,
      lastRaid,
      activityByChannel,
    ],
  );

  return <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>;
}

export function useChatSession(): ChatSessionValue {
  const value = useContext(ChatSessionContext);
  if (!value) throw new Error("useChatSession must be used inside ChatSessionProvider");
  return value;
}

export function useOptionalChatSession(): ChatSessionValue | null {
  return useContext(ChatSessionContext);
}
