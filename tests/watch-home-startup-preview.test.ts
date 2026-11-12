import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import { createElement, type ComponentType, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import ts from "typescript";
import type { DeferredHomeRail as HomeRail } from "../components/watch/DeferredHomeRail";

const filename = resolve("components/watch/DeferredHomeRail.tsx");
const nativeRequire = createRequire(filename);
const loaded = { exports: {} as { DeferredHomeRail: ComponentType<ComponentProps<typeof HomeRail>> } };
vm.runInNewContext(ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, {
  module: loaded, exports: loaded.exports,
  require: (name: string) => name === "@/lib/watch/viewport-approach" ? {} : nativeRequire(name),
}, { filename });

test("lower rows offer native links, titles and lazy covers before JavaScript starts", () => {
  function InteractiveCards(): never {
    throw new Error("Interactive cards must wait until the viewer approaches");
  }
  const props = {
    title: "Videos",
    previews: [{
      id: "video-one", shape: "landscape", title: "Japan <trip>", subtitle: "CORE",
      poster: "/covers/japan.webp", href: "/theater?kind=youtube&id=video-one",
    }],
    children: createElement(InteractiveCards),
  };
  const html = renderToStaticMarkup(createElement(loaded.exports.DeferredHomeRail, props));

  assert.match(html, /href="\/theater\?kind=youtube&amp;id=video-one"/);
  assert.match(html, /Japan &lt;trip&gt;/);
  assert.match(html, /src="\/covers\/japan.webp"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /fetchPriority="low"/i);
  assert.doesNotMatch(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /<link[^>]+rel="preload"/);
});
