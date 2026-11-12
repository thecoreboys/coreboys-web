import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import type { Metadata, MetadataRoute } from "next";
import ts from "typescript";
import * as seo from "../lib/seo";
import { MEMBERS } from "../lib/members";
import MemberOG from "../app/about/[slug]/opengraph-image";

test("a page gets its own canonical, title, description, and both share images", () => {
  const metadata = seo.withPageMetadata("/guide", { title: "Live Stream Guide", description: "Find live streams, upcoming shows, and replays from The Core Boys." });
  assert.equal(metadata.alternates?.canonical, `${seo.SITE_URL}/guide`);
  assert.equal(metadata.openGraph?.title, "Live Stream Guide | The Core Boys");
  assert.equal(metadata.twitter?.title, metadata.openGraph?.title);
  assert.equal(metadata.twitter?.description, metadata.description);
  assert.ok(JSON.stringify(metadata.openGraph?.images).includes(seo.CORE_SHARE_IMAGE.url));
  assert.ok(JSON.stringify(metadata.twitter?.images).includes(seo.CORE_SHARE_IMAGE.url));
});

test("article and creator metadata retain their own image and tags instead of inheriting the homepage", () => {
  const metadata = seo.withPageMetadata("/news/update", {
    title: "A CORE announcement", description: "A creator announcement from The Core Boys.",
    openGraph: { type: "article", tags: ["creator news"], publishedTime: "2026-11-12T12:00:00Z" },
    robots: { index: false, follow: false },
  }, seo.creatorShareImage("ron", "StableRonaldo"));
  assert.equal((metadata.openGraph as { type: string }).type, "article");
  assert.ok(JSON.stringify(metadata.openGraph).includes("creator news"));
  assert.ok(JSON.stringify(metadata.twitter?.images).includes("/social/ron-share-2026.png"));
  assert.equal((metadata.robots as { index: boolean }).index, false);
});

test("all exported static page metadata includes complete social cards and a route canonical", () => {
  const files = readdirSync("app", { encoding: "utf8", recursive: true }).map(file => String(file)).filter(file => /(?:^|[\\/])(?:page|layout)\.tsx$/.test(file));
  let checked = 0;
  for (const file of files) {
    const filename = join("app", file);
    const source = readFileSync(filename, "utf8");
    const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    for (const statement of tree.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (declaration.name.getText(tree) !== "metadata" || !declaration.initializer) continue;
        const code = ts.transpileModule(`module.exports = ${declaration.initializer.getText(tree)}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
        const module = { exports: {} };
        runInNewContext(code, { module, URL, ...seo });
        const metadata = module.exports as Metadata;
        assert.ok(metadata.description, `${filename}: description`);
        assert.ok(Array.isArray(metadata.openGraph?.images) && metadata.openGraph.images.length, `${filename}: Open Graph image`);
        assert.ok(Array.isArray(metadata.twitter?.images) && metadata.twitter.images.length, `${filename}: Twitter image`);
        assert.ok(metadata.openGraph?.title && metadata.twitter?.title, `${filename}: share title`);
        assert.ok(String(metadata.alternates?.canonical).startsWith(seo.SITE_URL), `${filename}: absolute canonical`);
        if (file !== "page.tsx" && file !== "layout.tsx") assert.notEqual(metadata.alternates?.canonical, `${seo.SITE_URL}/`, `${filename}: must not canonicalize to the homepage`);
        checked++;
      }
    }
  }
  assert.ok(checked >= 60, "audit covers the site's page metadata");
});

test("share images are real PNGs with accurate dimensions and usable file sizes", () => {
  for (const filename of ["core-boys-share-2026.png", ...MEMBERS.map(member => `${member.slug}-share-2026.png`)]) {
    const image = readFileSync(join("public/social", filename));
    assert.equal(image.subarray(1, 4).toString(), "PNG", filename);
    assert.equal(image.readUInt32BE(16), 1200, filename);
    assert.equal(image.readUInt32BE(20), 630, filename);
    assert.ok(image.length > 10_000 && image.length < 5_000_000, filename);
  }
});

test("creator image endpoints return the same published image and reject missing creators", async () => {
  const response = await MemberOG({ params: { slug: "ron" } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), readFileSync("public/social/ron-share-2026.png"));
  assert.equal((await MemberOG({ params: { slug: "not-a-member" } })).status, 404);
});

test("descriptions use readable bounded text and JSON-LD cannot close its script element", () => {
  const description = seo.seoDescription(`<p>${"Creator news and streams. ".repeat(30)}</p>`);
  assert.ok(description.length <= 170);
  assert.equal(description.includes("<p>"), false);
  const original = { headline: "</script><img src=x>" };
  const serialized = seo.serializeJsonLd(original);
  assert.equal(serialized.includes("<"), false);
  assert.deepEqual(JSON.parse(serialized), original);
});

function sitemapModule(fail = false) {
  const dependencies: Record<string, unknown> = {
    "@/lib/seo": seo,
    "@/lib/members": { MEMBERS: [{ slug: "ron" }], CREW: [{ slug: "crew" }] },
    "@/lib/fan-mail": { MAIL_MEMBERS: [{ slug: "ron" }] },
    "@/lib/watch/channels": { NETWORK_CHANNELS: [{ slug: "core" }, { slug: "ron" }] },
    "@/lib/articles": { getPublishedArticles: async () => { if (fail) throw new Error("offline"); return [{ slug: "update" }]; } },
    "@/lib/core-originals": { getCoreOriginalSnapshot: async () => { if (fail) throw new Error("offline"); return { originals: [{ slug: "show" }] }; } },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync("app/sitemap.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { module, exports: module.exports, require: (name: string) => dependencies[name] });
  return module.exports as { default: () => Promise<MetadataRoute.Sitemap> };
}

test("the sitemap lists canonical public pages, creators, news, and shows without private or redirected routes", async () => {
  const urls = (await sitemapModule().default()).map(entry => entry.url);
  for (const path of [...seo.INDEXABLE_SITE_PATHS, "/channels/ron", "/about/ron/numbers", "/crew/crew", "/news/update", "/originals/show"]) assert.ok(urls.includes(seo.absoluteSiteUrl(path)), path);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.some(url => /\/(?:admin|studio|account|dvr|passport|watch\/network|reset-password)(?:\/|$)/.test(new URL(url).pathname)), false);
  assert.equal(urls.some(url => /^\/m\/|^\/about\/[^/]+$/.test(new URL(url).pathname)), false);
});

test("the sitemap retains public navigation if optional article and show sources are unavailable", async () => {
  const urls = (await sitemapModule(true).default()).map(entry => entry.url);
  assert.ok(urls.includes(seo.absoluteSiteUrl("/guide")));
  assert.ok(urls.includes(seo.absoluteSiteUrl("/special-message")));
});
