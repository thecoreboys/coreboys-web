/** Provider-neutral contracts used by the chat page and media workspaces. */
export type ChatProviderKind = "twitch" | "youtube" | "core";

export type ChatAdapterChannel = {
  /** Stable provider-qualified id, for example `twitch:jasontheween`. */
  id: string;
  provider: ChatProviderKind;
  login: string;
  providerUserId?: string;
  displayName: string;
  avatarUrl?: string;
  accent?: string;
  isCore?: boolean;
};

export type ChatAdapterMessage = {
  id: string;
  channelId: string;
  channelLogin: string;
  provider: ChatProviderKind;
  authorLogin: string;
  authorDisplayName: string;
  body: string;
  receivedAt: number;
  replyParentId?: string;
};

export type ChatAdapterEvent =
  | { type: "message"; message: ChatAdapterMessage }
  | { type: "message-delete"; channelId: string; messageId: string }
  | { type: "chat-clear"; channelId: string; authorLogin?: string }
  | { type: "notice"; channelId: string; message: string };

export type ChatAdapterConnection = {
  disconnect(): void;
  pause?(): void;
  resume?(): void;
};

/**
 * Future providers implement this interface. Twitch is currently backed by
 * the anonymous IRC session in `twitch-chat-client`; CORE rooms can later use
 * the same UI without teaching the feed about another protocol.
 */
export interface ChatAdapter {
  readonly provider: ChatProviderKind;
  connect(
    channels: ChatAdapterChannel[],
    onEvent: (event: ChatAdapterEvent) => void,
  ): ChatAdapterConnection;
}

export function chatChannelId(provider: ChatProviderKind, login: string): string {
  return `${provider}:${login.trim().toLowerCase()}`;
}
