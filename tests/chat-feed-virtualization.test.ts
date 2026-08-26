import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVirtualChatMetrics,
  chatMessageKey,
  getChatHistoryStart,
  getVirtualChatWindow,
} from "../components/live/ChatFeed";

const rows = Array.from({ length: 1_000 }, (_, index) => ({
  channelLogin: index % 2 === 0 ? "adapt" : "lacy",
  id: `message-${index}`,
}));

test("chat history keeps the existing tail window until earlier messages are requested", () => {
  assert.equal(getChatHistoryStart(0, 240), 0);
  assert.equal(getChatHistoryStart(240, 240), 0);
  assert.equal(getChatHistoryStart(1_000, 240), 760);
  assert.equal(getChatHistoryStart(1_000, 480), 520);
  assert.equal(getChatHistoryStart(1_000, 50_000), 0);
});

test("virtual chat range stays small after all prior history has been revealed", () => {
  const heights = new Map(rows.map((row) => [chatMessageKey(row), 30]));
  const metrics = buildVirtualChatMetrics(rows, heights);
  const middle = getVirtualChatWindow(metrics, 15_000, 420, 480);
  const tail = getVirtualChatWindow(metrics, metrics.totalHeight - 420, 420, 480);

  assert.equal(metrics.totalHeight, 30_000);
  assert.ok(middle.start > 0);
  assert.ok(middle.end < rows.length);
  assert.ok(middle.end - middle.start < 60, "only nearby rows should mount in the middle of a large feed");
  assert.ok(tail.end - tail.start < 60, "the latest view should remain virtualized too");
  assert.equal(tail.end, rows.length);
});

test("virtual metrics use unique channel and provider message identifiers", () => {
  const duplicateProviderIds = [
    { channelLogin: "adapt", id: "same" },
    { channelLogin: "lacy", id: "same" },
  ];
  const metrics = buildVirtualChatMetrics(
    duplicateProviderIds,
    new Map([
      [chatMessageKey(duplicateProviderIds[0]!), 40],
      [chatMessageKey(duplicateProviderIds[1]!), 52],
    ]),
  );

  assert.deepEqual(metrics.offsets, [0, 40]);
  assert.equal(metrics.totalHeight, 92);
});
