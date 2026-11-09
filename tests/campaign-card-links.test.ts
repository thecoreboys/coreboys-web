import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import test from "node:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { CAMPAIGN_SEEDS } from "../lib/campaigns/seeds";
import * as schedule from "../lib/campaigns/schedule";
import type { CampaignInput } from "../lib/campaigns/types";

const filename = resolve("components/campaigns/CampaignCard.tsx");
const nativeRequire = createRequire(filename);
const loaded = { exports: {} as { CampaignCard: ComponentType<{ campaign: CampaignInput; duplicate?: boolean; preview?: boolean }> } };
vm.runInNewContext(ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, {
  module: loaded, exports: loaded.exports,
  require: (name: string) => {
    if (name === "@/lib/campaigns/schedule") return schedule;
    if (name === "@/components/ui/SiteImage") return { __esModule: true, default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) };
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, property) => String(property) }) };
    return nativeRequire(name);
  },
}, { filename });

test("every campaign card and its looping copy opens its own organizer URL", () => {
  for (const campaign of CAMPAIGN_SEEDS) {
    for (const duplicate of [false, true]) {
      const html = renderToStaticMarkup(createElement(loaded.exports.CampaignCard, { campaign, duplicate }));
      const link = html.match(/<a\b[^>]*>/)?.[0] ?? "";
      assert.equal(link.match(/href="([^"]+)"/)?.[1], campaign.campaignUrl, campaign.title);
      assert.match(link, /target="_blank"/);
      assert.match(link, /rel="noopener noreferrer"/);
      assert.ok(link.includes(campaign.title), "the accessible label names the same campaign as the destination");
      assert.equal(/tabindex="-1"/.test(link), duplicate, "loop copies must not add duplicate keyboard stops");
      assert.ok(html.includes(`src="${campaign.imageUrl}"`), "artwork belongs to the same linked campaign");
    }
  }
});

test("unpublished previews cannot open external campaigns", () => {
  const html = renderToStaticMarkup(createElement(loaded.exports.CampaignCard, { campaign: CAMPAIGN_SEEDS[0]!, preview: true }));
  assert.doesNotMatch(html, /<a\b/);
  assert.match(html, /<article\b/);
});
