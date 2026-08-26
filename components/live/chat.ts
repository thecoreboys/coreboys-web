export { ChatDock, type ChatDockProps } from "@/components/live/ChatDock";
export {
  ChatFeed,
  EMPTY_CHAT_FILTERS,
  filterChatMessages,
  type ChatFeedFilters,
  type ChatRoleFilter,
} from "@/components/live/ChatFeed";
export {
  ChatSessionProvider,
  useChatSession,
  useOptionalChatSession,
  type ChatSessionChannel,
  type ChatSessionValue,
} from "@/components/live/ChatSession";
export { ChatComposer, type ChatEmote } from "@/components/live/ChatComposer";
export { useChatLayouts, type ChatLayoutSync } from "@/components/live/useChatLayouts";
export {
  BUILT_IN_CHAT_LAYOUTS,
  normalizeChatLayout,
  parseChatLayout,
  serializeChatLayout,
  type ChatLayoutSnapshot,
  type ChatViewMode,
  type SavedChatLayout,
} from "@/lib/chat-layouts";
