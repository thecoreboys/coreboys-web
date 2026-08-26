import assert from "node:assert/strict";
import test from "node:test";
import {
  appendMergedChatMessage,
  removeMergedChatMessages,
} from "../components/live/ChatSession";
import type { ChatMessage } from "../lib/twitch-chat-client";

function message(id: string, receivedAt: number, channelLogin = "adapt"): ChatMessage {
  return {
    id,
    receivedAt,
    channelLogin,
    user: "viewer",
    displayName: "Viewer",
    badges: [],
    tokens: [{ kind: "text", text: id }],
    raw: id,
  };
}

test("incrementally merges cross-channel chat in chronological order", () => {
  let merged: ChatMessage[] = [];
  merged = appendMergedChatMessage(merged, message("one", 100, "adapt"), 5);
  merged = appendMergedChatMessage(merged, message("three", 300, "lacy"), 5);
  merged = appendMergedChatMessage(merged, message("two", 200, "silky"), 5);

  assert.deepEqual(merged.map((entry) => entry.id), ["one", "two", "three"]);
});

test("merged chat remains bounded and ignores duplicate provider deliveries", () => {
  let merged: ChatMessage[] = [];
  for (let index = 1; index <= 4; index += 1) {
    merged = appendMergedChatMessage(merged, message(String(index), index), 3);
  }
  merged = appendMergedChatMessage(merged, message("4", 4), 3);

  assert.deepEqual(merged.map((entry) => entry.id), ["2", "3", "4"]);
});

test("moderation removes messages from the incremental merged buffer", () => {
  const messages = [message("one", 1, "adapt"), message("two", 2, "lacy")];
  const remaining = removeMergedChatMessages(messages, (entry) => entry.channelLogin === "adapt");

  assert.deepEqual(remaining.map((entry) => entry.id), ["two"]);
});
