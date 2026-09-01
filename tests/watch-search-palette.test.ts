import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const palette = read("components/watch/WatchPalette.tsx");
const chrome = read("components/watch/WatchChrome.tsx");
const topNav = read("components/chrome/TopNav.tsx");
const layout = read("app/layout.tsx");
const enhancements = read("components/watch/GlobalWatchEnhancements.tsx");
const css = read("app/watch/watch.css");

test("mounts one global, focusable search palette through deferred watch enhancements", () => {
  assert.match(layout, /<GlobalWatchEnhancements\s*\/>/);
  assert.doesNotMatch(layout, /<WatchPalette\b/);
  assert.doesNotMatch(chrome, /<WatchPalette/);
  assert.match(layout, /import "\.\/watch\/watch\.css"/);
  assert.match(enhancements, /const WatchPalette = dynamic\(/);
  assert.match(enhancements, /import\("@\/components\/watch\/WatchPalette"\)/);
  assert.match(enhancements, /<WatchPalette\s*\/>/);
  assert.match(enhancements, /isWatchSurface\(pathname\)/);
  assert.match(palette, /window\.addEventListener\("core-watch-search", show\)/);
  assert.match(palette, /window\.requestAnimationFrame\(\(\) => inputRef\.current\?\.focus\(\)\)/);
  assert.match(palette, /createPortal\(/);
});

test("uses a compact one-column palette without a provider preview pane", () => {
  assert.doesNotMatch(palette, /function SearchPreview\(/);
  assert.doesNotMatch(palette, /<SearchPreview\b/);
  assert.doesNotMatch(palette, /<iframe|embedFor\(/);
  assert.match(palette, /<h1 id="watch-search-title">Search CORE<\/h1>/);
  assert.doesNotMatch(palette, /Search everything CORE/);
  assert.match(css, /\.watch-search-body\s*\{\s*display:\s*block;/);
  assert.match(css, /\.watch-search-preview\s*\{\s*display:\s*none\s*!important;/);
});

test("keeps the quick filter rail small while retaining every format in Filters", () => {
  assert.match(palette, /const PRIMARY_FILTERS = new Set<SearchFilter>\(\["all", "live", "videos", "shorts"\]\)/);
  assert.match(palette, /const HIDDEN_CONTENT_FILTERS = FILTERS\.filter\(\(option\) => !PRIMARY_FILTERS\.has\(option\.id\)\)/);
  const fullFilterBlock = palette.match(/const FILTERS[^]*?\];/)?.[0] ?? "";
  for (const id of ["broadcasts", "photos", "posts"]) {
    assert.match(fullFilterBlock, new RegExp(`id: "${id}"`));
  }
  assert.match(palette, /<details className="watch-search-more-filters">/);
  assert.match(palette, /\{HIDDEN_CONTENT_FILTERS\.map\(/);
  assert.match(palette, /<legend>Content type<\/legend>/);
  assert.match(palette, /<legend>Platform<\/legend>/);
  assert.match(palette, /<span>Creator<\/span>/);
});

test("warms and reuses the seed catalog before search is opened", () => {
  assert.match(palette, /SEARCH_SEED_SESSION_KEY/);
  assert.match(palette, /window\.sessionStorage/);
  assert.match(palette, /requestIdleCallback/);
  assert.match(palette, /\/api\/watch\/search\?q=&limit=60&liveFirst=true&mode=basic/);
  assert.match(palette, /SEARCH_LIVE_CACHE_MS\s*=\s*60_000/);
  assert.match(palette, /SEARCH_DISCOVERY_CACHE_MS\s*=\s*5 \* 60_000/);
  assert.match(palette, /requestSearchSeed\(/);
  assert.match(palette, /warmSearchSeed/);
});

test("renders local candidates first and only lets current indexed work refine them", () => {
  assert.match(palette, /useDeferredValue/);
  assert.match(palette, /indexedQueryCache/);
  assert.match(palette, /writeQueryCache\(/);
  assert.match(palette, /controller\.abort\(\)/);
  assert.match(palette, /mergeRankedResults\(local, indexedSearch\.results/);
  assert.match(palette, /Refining matches/);
  assert.doesNotMatch(palette, /Finding the strongest matches/);
});

test("gives an empty search one featured result before at most two useful groups", () => {
  assert.match(palette, /const featuredItem\s*=\s*continueItems\[0\]\s*\?\?\s*liveItems\[0\]\s*\?\?\s*trendingItems\[0\]/);
  assert.match(palette, />For you</);
  assert.match(palette, /groups\.slice\(0, 2\)/);
  assert.match(palette, /watch-search-featured/);
  assert.match(palette, /watch-search-skeleton/);
  assert.doesNotMatch(palette, /Browse creators/);
});

test("keeps membership discovery contextual instead of a permanent smart-search chip", () => {
  assert.doesNotMatch(palette, /Smart search\s*[··]/);
  assert.doesNotMatch(palette, /watch-search-premium-link/);
  assert.match(palette, /Broader matches available with Membership/);
  assert.match(palette, /const showMembershipHint/);
  assert.match(palette, /needle\.length\s*>=\s*2/);
  assert.match(palette, /rows\.length\s*<=\s*2/);
});

test("retains predictable ranking, privacy-safe recents, and existing content handoff", () => {
  assert.match(palette, /RECENT_SEARCH_LIMIT = 8/);
  assert.match(palette, /kind: "search-recents", name: "recent"/);
  assert.match(palette, /localStorage/);
  assert.doesNotMatch(palette, /RECENT_SEARCH_PREFIX}:guest/);
  assert.match(palette, /method: "DELETE"/);
  assert.match(palette, /hasAnalyticsConsent\(\)/);
  assert.doesNotMatch(palette, /trackSearchEvent\([^\n]+query:/);
  assert.match(palette, /function mergeRankedResults\(/);
  assert.match(palette, /left\.key\.localeCompare\(right\.key\)/);
  assert.match(palette, /player\.play\(item, rankedQueue/);
  assert.match(palette, /router\.push\(`\/channels\/\$\{row\.member\.slug\}`\)/);
});

test("uses restrained exit motion and protects the results scroller from unnecessary work", () => {
  assert.match(palette, /isClosing/);
  assert.match(palette, /setIsClosing\(true\)[^]*?setOpen\(false\)/);
  assert.match(css, /\.watch-search-backdrop\.is-closing/);
  assert.match(css, /\.watch-search-dialog\.is-closing/);
  assert.match(css, /\.watch-search-results\s*\{[^}]*contain:\s*layout paint style;/);
  assert.match(css, /content-visibility:\s*auto;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[^]*?\.watch-search-backdrop\.is-closing[^]*?animation:\s*none\s*!important/);
});

test("keeps global navigation available and sends all selected filters through the unified API", () => {
  assert.match(topNav, /!pathname\.startsWith\("\/admin"\)/);
  assert.doesNotMatch(topNav, /pathname\.startsWith\("\/channels"\)/);
  assert.match(palette, /params\.set\("scope", scope\)/);
  assert.match(palette, /creatorFilter !== "all"\) params\.set\("member", creatorFilter\)/);
  assert.match(palette, /platformFilter !== "all"\) params\.set\("platform", platformFilter\)/);
});
