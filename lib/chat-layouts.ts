export type ChatViewMode = "combined" | "columns" | "focused";

export type ChatLayoutSnapshot = {
  version: 1;
  mode: ChatViewMode;
  channelLogins: string[];
  focusedLogin?: string;
  textScale: number;
  streamsVisible: boolean;
  maxConnected: number;
  dataSaver: boolean;
};

export type SavedChatLayout = {
  id: string;
  name: string;
  layout: ChatLayoutSnapshot;
  updatedAt: string;
};

const modes = new Set<ChatViewMode>(["combined", "columns", "focused"]);
const normalizeLogin = (login: string) => login.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");

export function shouldRenderChatStreams(streamsVisible: boolean, dataSaver: boolean): boolean {
  return streamsVisible && !dataSaver;
}

/** Keep stream tiles and chat columns on the same responsive grid. */
export function chatColumnGridClass(channelCount: number): string {
  if (channelCount <= 1) return "grid-cols-1";
  if (channelCount === 2) return "grid-cols-1 md:grid-cols-2";
  return "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";
}

export function chatLiveMediaHref(login: string, slug?: string): string {
  const query = new URLSearchParams({ kind: "live", login: normalizeLogin(login) });
  const normalizedSlug = slug ? normalizeLogin(slug) : "";
  if (normalizedSlug) query.set("slug", normalizedSlug);
  return `/theater?${query.toString()}`;
}

export function normalizeChatLayout(value: Partial<ChatLayoutSnapshot>): ChatLayoutSnapshot {
  const channelLogins = [...new Set((value.channelLogins ?? []).map(normalizeLogin).filter(Boolean))].slice(0, 8);
  const focused = value.focusedLogin ? normalizeLogin(value.focusedLogin) : undefined;
  return {
    version: 1,
    mode: value.mode && modes.has(value.mode) ? value.mode : "combined",
    channelLogins,
    focusedLogin: focused && channelLogins.includes(focused) ? focused : channelLogins[0],
    textScale: Math.max(0.7, Math.min(1.8, Number(value.textScale) || 1)),
    streamsVisible: value.streamsVisible ?? true,
    maxConnected: Math.max(1, Math.min(8, Math.round(Number(value.maxConnected) || 6))),
    dataSaver: Boolean(value.dataSaver),
  };
}

export function serializeChatLayout(layout: ChatLayoutSnapshot): string {
  return JSON.stringify(normalizeChatLayout(layout));
}

export function parseChatLayout(serialized: string): ChatLayoutSnapshot | null {
  try {
    const value = JSON.parse(serialized) as Partial<ChatLayoutSnapshot>;
    if (!value || typeof value !== "object") return null;
    return normalizeChatLayout(value);
  } catch {
    return null;
  }
}

export function createSavedChatLayout(name: string, layout: ChatLayoutSnapshot): SavedChatLayout {
  const cleanName = name.trim().slice(0, 48) || "My chat layout";
  const id = `${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "layout"}-${Date.now().toString(36)}`;
  return { id, name: cleanName, layout: normalizeChatLayout(layout), updatedAt: new Date().toISOString() };
}

export const BUILT_IN_CHAT_LAYOUTS: ReadonlyArray<Pick<SavedChatLayout, "id" | "name" | "layout">> = [
  {
    id: "one-room",
    name: "One room",
    layout: normalizeChatLayout({ mode: "combined", channelLogins: [], textScale: 1, streamsVisible: false, maxConnected: 6, dataSaver: false }),
  },
  {
    id: "chat-wall",
    name: "Chat wall",
    layout: normalizeChatLayout({ mode: "columns", channelLogins: [], textScale: 0.9, streamsVisible: false, maxConnected: 6, dataSaver: false }),
  },
  {
    id: "watch-and-chat",
    name: "Watch + chat",
    layout: normalizeChatLayout({ mode: "focused", channelLogins: [], textScale: 1, streamsVisible: true, maxConnected: 4, dataSaver: false }),
  },
];
