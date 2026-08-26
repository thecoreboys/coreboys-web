"use client";

import type { ChatLayoutSync } from "@/components/live/useChatLayouts";
import type { SavedChatLayout } from "@/lib/chat-layouts";

type WorkspaceItem = {
  kind: string;
  name: string;
  payload: unknown;
  updatedAt: string;
};

const isSavedLayout = (payload: unknown): payload is SavedChatLayout => {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as Partial<SavedChatLayout>;
  return typeof value.id === "string" && typeof value.name === "string" && Boolean(value.layout);
};

/** Account sync is best-effort; the hook keeps local layouts if signed out. */
export const accountChatLayoutSync: ChatLayoutSync = {
  async load() {
    const response = await fetch("/api/account/workspaces?kind=chat", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`chat_layout_load_${response.status}`);
    const data = (await response.json()) as { items?: WorkspaceItem[] };
    return (data.items ?? [])
      .map((item) => item.payload)
      .filter(isSavedLayout);
  },
  async save(layout) {
    const response = await fetch("/api/account/workspaces", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "chat", name: layout.id, payload: layout }),
    });
    if (!response.ok) throw new Error(`chat_layout_save_${response.status}`);
  },
  async remove(id) {
    const response = await fetch(
      `/api/account/workspaces?kind=chat&name=${encodeURIComponent(id)}`,
      { method: "DELETE", credentials: "same-origin" },
    );
    if (!response.ok) throw new Error(`chat_layout_remove_${response.status}`);
  },
};
