import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { XTweetsRailProps } from "../components/watch/XTweetsRail";
import type { WatchHomeXPost } from "../lib/watch/x-posts";

const filename = path.resolve("components/watch/XTweetsRail.tsx");
const nativeRequire = createRequire(filename);
const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;

function renderPosts(items: WatchHomeXPost[]) {
  const module = { exports: {} as { XTweetsRail: ComponentType<XTweetsRailProps> } };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, URL,
    require: (name: string) => {
      if (name === "@/components/x/useSeenXPost") return { useSeenXPost: () => ({ rootRef: { current: null }, isNew: false }) };
      if (name === "@/components/ui/dialog") return { Dialog: () => null, DialogContent: () => null, DialogTitle: () => null };
      if (name === "@/components/clips/PlatformLogo") return { PlatformLogo: () => createElement("span", { "data-logo": true }) };
      if (name === "@/components/ui/BrowserDateTime") return {
        BrowserRelativeTime: () => createElement("time", null, "Recently"),
      };
      if (name === "@/lib/watch/presentation") return { isRecentItem: () => false };
      if (name.endsWith(".module.css")) return { __esModule: true,
        default: new Proxy({}, { get: (_target, property) => String(property) }) };
      return nativeRequire(name);
    },
  }, { filename });
  return renderToStaticMarkup(createElement(module.exports.XTweetsRail, { items }));
}

function post(overrides: Partial<WatchHomeXPost> = {}): WatchHomeXPost {
  return {
    id: "x-2000000000000000001", statusId: "2000000000000000001", text: "BACK",
    sourceUrl: "https://x.com/FaZeAdapt/status/2000000000000000001",
    publishedAt: "2026-11-08T12:00:00Z",
    author: { slug: "adapt", label: "Adapt", handle: "@FaZeAdapt", portrait: "https://pbs.twimg.com/profile_images/avatar.jpg",
      profileUrl: "https://x.com/FaZeAdapt", accent: "#ff3333", verified: true },
    media: [], entities: [], ...overrides,
  };
}

function urlEntity(text: string, token: string, href: string, extra = {}) {
  const start = text.indexOf(token);
  return { kind: "url" as const, start, end: start + token.length, href, ...extra };
}

test("the first render includes the rich image card and photo without repeating shortened or attachment links", () => {
  const text = "BACK\n\nhttps://t.co/stream https://t.co/photo";
  const item = post({ text,
    entities: [
      urlEntity(text, "https://t.co/stream", "https://www.twitch.tv/Adapt", {
        title: "Adapt on Twitch", description: "Catch the latest stream.",
        imageUrl: "https://pbs.twimg.com/news_img/stream-preview.jpg", label: "Twitch.tv/Adapt",
      }),
      urlEntity(text, "https://t.co/photo", "https://x.com/FaZeAdapt/status/2000000000000000001/photo/1", { label: "pic.x.com/photo" }),
    ],
    media: [{ id: "photo", kind: "image", thumbnailUrl: "https://pbs.twimg.com/media/photo.jpg", mediaUrl: null,
      width: 1366, height: 2048, orientation: "portrait" }],
  });
  const html = renderPosts([item]);
  assert.match(html, /<p class="postText">BACK<\/p>/);
  assert.match(html, /data-has-image="true"/);
  assert.match(html, /src="https:\/\/pbs\.twimg\.com\/news_img\/stream-preview\.jpg"[^>]*loading="eager"/);
  assert.match(html, /src="https:\/\/pbs\.twimg\.com\/media\/photo\.jpg"[^>]*loading="eager"/);
  assert.match(html, /Adapt on Twitch/);
  assert.match(html, /Catch the latest stream\./);
  assert.doesNotMatch(html, /pic\.x\.com|https:\/\/t\.co\/|Open linked post on X/);
});

test("an attachment reference is retained when no cached attachment can be displayed", () => {
  const text = "Photo https://t.co/photo";
  const html = renderPosts([post({ text, entities: [urlEntity(text, "https://t.co/photo",
    "https://x.com/FaZeAdapt/status/2000000000000000001/photo/1", { label: "pic.x.com/photo" })] })]);
  assert.match(html, /href="https:\/\/x\.com\/FaZeAdapt\/status\/2000000000000000001\/photo\/1"/);
  assert.match(html, /Open linked post on X/);
});

test("YouTube links have a ready thumbnail without waiting for a provider widget", () => {
  const text = "https://t.co/video";
  const html = renderPosts([post({ text, entities: [urlEntity(text, text, "https://www.youtube.com/watch?v=abcdefghijk")] })]);
  assert.match(html, /src="https:\/\/i\.ytimg\.com\/vi\/abcdefghijk\/hqdefault\.jpg"/);
  assert.match(html, /data-kind="youtube"/);
  assert.doesNotMatch(html, /<iframe|class="postText"|platform\.twitter\.com/);
});

test("additional links beyond the card limit remain available in the post copy", () => {
  const text = "https://t.co/one https://t.co/two https://t.co/three";
  const entities = ["one", "two", "three"].map((key) => urlEntity(text, `https://t.co/${key}`, `https://example.com/${key}`));
  const html = renderPosts([post({ text, entities })]);
  assert.equal((html.match(/class="linkPreview"/g) ?? []).length, 2);
  assert.match(html, /class="postText">[\s\S]*href="https:\/\/example\.com\/three"/);
});

test("image requests are eager for the first cards and remain lazy further down the feed", () => {
  const items = Array.from({ length: 7 }, (_, index) => {
    const text = `https://t.co/link${index}`;
    return post({ id: `x-${index}`, statusId: `200000000000000000${index}`, text,
      entities: [urlEntity(text, text, `https://example.com/${index}`, { imageUrl: `https://example.com/image${index}.jpg` })] });
  });
  const html = renderPosts(items);
  assert.match(html, /src="https:\/\/example\.com\/image0\.jpg"[^>]*loading="eager"/);
  assert.match(html, /src="https:\/\/example\.com\/image6\.jpg"[^>]*loading="lazy"/);
});
