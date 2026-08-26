import assert from "node:assert/strict";
import test from "node:test";
import {
  chatColumnGridClass,
  chatLiveMediaHref,
  normalizeChatLayout,
  parseChatLayout,
  serializeChatLayout,
  shouldRenderChatStreams,
} from "../lib/chat-layouts";

test("stream tiles and chat columns share one responsive grid rule", () => {
  assert.equal(chatColumnGridClass(1), "grid-cols-1");
  assert.equal(chatColumnGridClass(2), "grid-cols-1 md:grid-cols-2");
  assert.equal(chatColumnGridClass(3), "grid-cols-1 md:grid-cols-2 xl:grid-cols-3");
  assert.equal(chatColumnGridClass(8), "grid-cols-1 md:grid-cols-2 xl:grid-cols-3");
});

test("new chat layouts show streams by default", () => {
  assert.equal(normalizeChatLayout({}).streamsVisible, true);
});

test("an explicit saved Hide streams choice remains respected", () => {
  const hidden = normalizeChatLayout({ streamsVisible: false });
  assert.equal(hidden.streamsVisible, false);
  assert.equal(parseChatLayout(serializeChatLayout(hidden))?.streamsVisible, false);
});

test("Watch + chat keeps streams enabled without Data Saver blocking them", () => {
  const layout = normalizeChatLayout({ streamsVisible: true, dataSaver: false });
  assert.equal(layout.streamsVisible, true);
  assert.equal(layout.dataSaver, false);
  assert.equal(shouldRenderChatStreams(layout.streamsVisible, layout.dataSaver), true);
  assert.equal(shouldRenderChatStreams(true, true), false);
});

test("builds the CORE media-player route for a live chat stream", () => {
  assert.equal(
    chatLiveMediaHref("StableRonaldo", "Ron"),
    "/theater?kind=live&login=stableronaldo&slug=ron",
  );
});
