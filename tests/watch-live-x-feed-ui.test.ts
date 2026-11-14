import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { useLiveXFeeds } from "../hooks/useLiveXFeeds";
import type { WatchHomeXPost, WatchHomeXSpace } from "../lib/watch/x-posts";

type FeedState = ReturnType<typeof useLiveXFeeds>;
type FeedProps = { initialMembers: WatchHomeXPost[]; initialCrew: WatchHomeXPost[]; spaces: WatchHomeXSpace[] };

function renderFeed(state: Partial<FeedState>, props: Partial<FeedProps> = {}) {
  const filename = path.resolve("components/watch/LiveHomeXFeeds.tsx");
  const nativeRequire = createRequire(filename);
  const module = { exports: {} as { LiveHomeXFeeds: ComponentType<FeedProps> } };
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: (name: string) => {
      if (name === "@/hooks/useLiveXFeeds") return {
        useLiveXFeeds: (members: WatchHomeXPost[], crew: WatchHomeXPost[]) => ({
          members, crew, feed: null, connection: "connecting", newPosts: { members: 0, crew: 0 },
          refresh() {}, dismiss() {}, ...state,
        }),
      };
      if (name === "next/link") return { __esModule: true,
        default: ({ children, ...attributes }: { children: ReactNode; href: string }) => createElement("a", attributes, children) };
      if (name === "./XTweetsRail") return {
        XTweetsRail: ({ items, spaces, title }: { items: unknown[]; spaces: unknown[]; title: string }) => (
          createElement("div", { "data-rail": title, "data-posts": items.length, "data-spaces": spaces.length })
        ),
      };
      if (name === "@/components/ui/BrowserDateTime") return {
        BrowserRelativeTime: ({ value }: { value: string }) => createElement("time", { dateTime: value }, "recently"),
      };
      if (name.endsWith(".module.css")) return { __esModule: true,
        default: new Proxy({}, { get: (_target, property) => String(property) }) };
      return nativeRequire(name);
    },
  }, { filename });
  return renderToStaticMarkup(createElement(module.exports.LiveHomeXFeeds, {
    initialMembers: [], initialCrew: [], spaces: [], ...props,
  }));
}

const post = { statusId: "2000000000000000001" } as WatchHomeXPost;
const feed: NonNullable<FeedState["feed"]> = { members: [post], crew: [], status: "fresh", refreshedAt: "2026-11-08T12:00:00Z",
  checkedAt: "2026-11-08T12:00:10Z", refreshIntervalSeconds: 300 };

test("empty X feeds render no headings, connection toolbar, or error placeholders", () => {
  for (const connection of ["connecting", "connected", "retrying", "offline"] as const) {
    assert.equal(renderFeed({ connection }), "");
  }
});

test("each audience is omitted independently when it has no content", () => {
  const membersOnly = renderFeed({}, { initialMembers: [post] });
  assert.match(membersOnly, /id="members-on-x"/);
  assert.doesNotMatch(membersOnly, /id="crew-on-x"|temporarily unavailable|No posts to show/);
  const crewOnly = renderFeed({}, { initialCrew: [post] });
  assert.match(crewOnly, /id="crew-on-x"/);
  assert.doesNotMatch(crewOnly, /id="members-on-x"/);
});

test("a valid Space can keep the members section visible without creating an empty crew section", () => {
  const html = renderFeed({}, { spaces: [{} as WatchHomeXSpace] });
  assert.match(html, /id="members-on-x"/);
  assert.match(html, /data-spaces="1"/);
  assert.doesNotMatch(html, /id="crew-on-x"/);
});

test("cached posts survive an outage without reconnecting banners or a false healthy indicator", () => {
  for (const connection of ["retrying", "offline"] as const) {
    const html = renderFeed({ connection, feed: { ...feed } }, { initialMembers: [post] });
    assert.match(html, /Saved posts/);
    assert.match(html, /data-active="false"/);
    assert.match(html, /data-posts="1"/);
    assert.doesNotMatch(html, /Reconnecting|Auto-updating|Updates automatically|temporarily unavailable/);
  }
});

test("only a fresh successful response advertises automatic updates", () => {
  const fresh = renderFeed({ connection: "connected", feed: { ...feed } }, { initialMembers: [post] });
  assert.match(fresh, /Updates automatically/);
  assert.match(fresh, /data-active="true"/);
  const stale = renderFeed({ connection: "connected", feed: { ...feed, status: "stale" } }, { initialMembers: [post] });
  assert.match(stale, /Saved posts/);
  assert.match(stale, /data-active="false"/);
});
