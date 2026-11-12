import "server-only";

import { Client, credentials, Metadata } from "@grpc/grpc-js";
import { parse } from "protobufjs";
import type { RemoteChatMessage } from "./multiview-remote";

// Only the fields needed to render YouTube's public chat are decoded.
// https://developers.google.com/youtube/data/live/streaming-live-chat#stream_list.proto
const protocol = parse(`
  syntax = "proto2";
  message Request {
    optional string liveChatId = 1;
    repeated string part = 100;
  }
  message Snippet {
    optional int32 type = 1;
    optional string publishedAt = 4;
    optional string displayMessage = 16;
  }
  message Author { optional string displayName = 103; }
  message Item {
    optional string id = 101;
    optional Snippet snippet = 2;
    optional Author author = 3;
  }
  message Response {
    optional string offlineAt = 2;
    repeated Item items = 1007;
  }
`).root;
const requestType = protocol.lookupType("Request");
const responseType = protocol.lookupType("Response");

type StreamResponse = {
  offlineAt?: string;
  items?: Array<{ id?: string; author?: { displayName?: string }; snippet?: { type?: number; publishedAt?: string; displayMessage?: string } }>;
};
type ChatEvent = { type: "ready" | "unavailable" } | { type: "messages"; messages: RemoteChatMessage[] };
type Listener = (event: ChatEvent) => void;

async function openYouTubeChat(videoId: string, key: string, signal: AbortSignal, emit: Listener) {
  const lookup = new URL("https://www.googleapis.com/youtube/v3/videos");
  lookup.search = new URLSearchParams({ id: videoId, part: "liveStreamingDetails", fields: "items(liveStreamingDetails(activeLiveChatId))" }).toString();
  const result = await fetch(lookup, {
    headers: { "x-goog-api-key": key },
    signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
    cache: "no-store",
  });
  if (!result.ok) throw new Error("YouTube chat lookup failed");
  const data = await result.json() as { items?: Array<{ liveStreamingDetails?: { activeLiveChatId?: string } }> };
  const liveChatId = data.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
  if (!liveChatId || signal.aborted) throw new Error("YouTube live chat is unavailable");

  const client = new Client("youtube.googleapis.com:443", credentials.createSsl());
  const metadata = new Metadata();
  metadata.set("x-goog-api-key", key);
  const stream = client.makeServerStreamRequest(
    "/youtube.api.v3.V3DataLiveChatMessageService/StreamList",
    (input: { liveChatId: string; part: string[] }) => Buffer.from(requestType.encode(input).finish()),
    (bytes) => responseType.toObject(responseType.decode(bytes)) as StreamResponse,
    { liveChatId, part: ["id", "snippet", "authorDetails"] },
    metadata,
  );
  const readyTimeout = setTimeout(() => stream.cancel(), 12000);
  let closed = false;
  const cancel = () => stream.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(readyTimeout);
    signal.removeEventListener("abort", cancel);
    client.close();
    if (!signal.aborted) emit({ type: "unavailable" });
  };
  stream.once("metadata", () => {
    clearTimeout(readyTimeout);
    emit({ type: "ready" });
  });
  stream.on("data", (batch: StreamResponse) => {
    if (batch.offlineAt) {
      stream.cancel();
      return;
    }
    const messages = (batch.items ?? []).flatMap(({ id, author, snippet }): RemoteChatMessage[] => {
      const time = Date.parse(snippet?.publishedAt ?? "");
      if (!id || snippet?.type !== 1 || !snippet.displayMessage || !author?.displayName || !Number.isFinite(time)) return [];
      return [{ id, author: author.displayName.slice(0, 100), text: snippet.displayMessage.slice(0, 500), time }];
    }).slice(-100);
    if (messages.length) emit({ type: "messages", messages });
  });
  stream.once("error", close);
  stream.once("end", close);
}

type Feed = {
  listeners: Set<Listener>;
  controller: AbortController;
  ready: boolean;
  unavailable: boolean;
  recent: RemoteChatMessage[];
  idle?: ReturnType<typeof setTimeout>;
};
const feeds = new Map<string, Feed>();
const MAX_FEEDS = 12;

export function subscribeToYouTubeRemoteChat(videoId: string, key: string, listener: Listener) {
  let feed = feeds.get(videoId);
  if (!feed) {
    if (feeds.size >= MAX_FEEDS) {
      listener({ type: "unavailable" });
      return () => {};
    }
    const shared: Feed = { listeners: new Set(), controller: new AbortController(), ready: false, unavailable: false, recent: [] };
    feeds.set(videoId, shared);
    feed = shared;
    const emit: Listener = (event) => {
      if (shared.controller.signal.aborted) return;
      if (event.type === "ready") shared.ready = true;
      if (event.type === "unavailable") shared.unavailable = true;
      if (event.type === "messages") shared.recent = [...shared.recent, ...event.messages].slice(-80);
      for (const subscriber of shared.listeners) subscriber(event);
    };
    void openYouTubeChat(videoId, key, shared.controller.signal, emit).catch(() => emit({ type: "unavailable" }));
  }
  const shared = feed;
  clearTimeout(shared.idle);
  shared.listeners.add(listener);
  if (shared.unavailable) listener({ type: "unavailable" });
  else {
    if (shared.ready) listener({ type: "ready" });
    if (shared.recent.length) listener({ type: "messages", messages: shared.recent });
  }
  return () => {
    shared.listeners.delete(listener);
    if (shared.listeners.size) return;
    shared.idle = setTimeout(() => {
      shared.controller.abort();
      feeds.delete(videoId);
    }, 30000);
  };
}
