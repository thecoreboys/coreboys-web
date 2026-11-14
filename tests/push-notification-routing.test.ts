import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { notificationTargetFor } from "../lib/notification-target";

function worker() {
  const listeners: Record<string, (event: any) => void> = {};
  const shown: Array<{ title: string; options: any }> = [];
  const opened: string[] = [];
  const windows: any[] = [];
  const context = {
    URL, URLSearchParams,
    self: { location: { origin: "https://thecoreboys.com" }, addEventListener: (type: string, listener: (event: any) => void) => { listeners[type] = listener; }, registration: { showNotification: async (title: string, options: any) => { shown.push({ title, options }); } } },
    clients: { matchAll: async () => windows, openWindow: async (url: string) => { opened.push(url); } },
  };
  runInNewContext(readFileSync("public/core-push-sw.js", "utf8"), context);
  return { listeners, shown, opened, windows };
}

for (const href of [
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ",
  "https://www.youtube.com/live/dQw4w9WgXcQ", "https://www.youtube.com/shorts/dQw4w9WgXcQ",
  "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  "https://www.tiktok.com/@core/video/1234567890123456", "https://www.instagram.com/reel/AbCd12345/",
  "https://www.instagram.com/p/AbCd12345/", "https://www.twitch.tv/core/clip/ExampleClip",
  "https://www.twitch.tv/videos/123456789", "https://www.twitch.tv/core",
  "https://x.com/core/status/1234567890123", "https://thecoreboys.com/account/notifications",
]) {
  test(`push and inbox agree on the destination for ${href}`, async () => {
    const harness = worker();
    let done: Promise<unknown> = Promise.resolve();
    harness.listeners.push!({ data: { json: () => ({ href, body: "Creator update" }) }, waitUntil: (promise: Promise<unknown>) => { done = promise; } });
    await done;
    const push = new URL(harness.shown[0]!.options.data.href, "https://thecoreboys.com");
    const inbox = new URL(notificationTargetFor({ href, title: "Creator update" }).href, "https://thecoreboys.com");
    assert.equal(push.pathname, inbox.pathname);
    for (const key of ["kind", "src", "id", "format", "orientation"]) assert.equal(push.searchParams.get(key), inbox.searchParams.get(key), key);
  });
}

test("malformed push payloads still show a usable update", async () => {
  const harness = worker();
  let done: Promise<unknown> = Promise.resolve();
  harness.listeners.push!({ data: { json: () => null }, waitUntil: (promise: Promise<unknown>) => { done = promise; } });
  await done;
  assert.equal(harness.shown[0]!.title, "CORE update");
});

test("a closing client cannot swallow notification navigation or send it off-site", async () => {
  const harness = worker();
  harness.windows.push({ navigate: async () => { throw new Error("closing"); }, focus: async () => {} });
  let done: Promise<unknown> = Promise.resolve();
  harness.listeners.notificationclick!({ notification: { close() {}, data: { href: "/\\evil.example/" } }, waitUntil: (promise: Promise<unknown>) => { done = promise; } });
  await done;
  assert.deepEqual(harness.opened, ["https://thecoreboys.com/account/notifications"]);
  assert.equal(notificationTargetFor({ href: "/\\evil.example/" }).href, "/account/notifications");
});
