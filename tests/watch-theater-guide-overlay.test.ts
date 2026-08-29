import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const player = readFileSync(resolve(root, "components/watch/PersistentPlayer.tsx"), "utf8");
const theaterGuide = readFileSync(resolve(root, "components/watch/TheaterNetworkGuide.tsx"), "utf8");
const css = readFileSync(resolve(root, "app/watch/watch.css"), "utf8");

test("Theater Guide stays inside the existing player frame", () => {
  assert.match(player, /guideOverlayOpen \? "is-guide-open"/);
  assert.doesNotMatch(player, /guideDockedPlayer|is-guide-docked|data-guide-player/);
  assert.match(css, /\.watch-player-frame-shell\.is-guide-open\s*\{[^}]*overflow:\s*hidden/s);
});

test("Guide and Now Playing toggle labels do not render a back arrow", () => {
  const start = player.indexOf("watch-player-guide-home");
  const end = player.indexOf("data-player-workspace-grid", start);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.doesNotMatch(player.slice(start, end), /ArrowLeft|ChevronLeft/);
  assert.match(player.slice(start, end), /guideMenuOpen \? "Now Playing" : "Guide"/);
});

test("Shorts never inherits the Theater Guide control", () => {
  assert.match(player, /const guideOverlayOpen = theater && !shortsPage && guideMenuOpen/);
  assert.match(player, /\{theater && !shortsPage \? \(\s*<div className="watch-player-guide-home">/);
});

test("Shorts preserves a closed companion panel while the viewer moves between clips", () => {
  assert.match(player, /const playerPageKey = shortsPage \? "shorts" : "theater"/);
  assert.match(player, /playerPageSidebarInitializedRef\.current === playerPageKey\) return/);
  assert.match(player, /shortsPage && queueOpen[\s\S]{0,240}lg:grid-cols-\[minmax\(0,calc\(\(100dvh-8rem\)\*9\/16\)\)_22rem\]/);
});

test("Theater has a top-left back arrow labeled Home", () => {
  assert.match(player, /\{theater && !shortsPage \? \([\s\S]*watch-player-theater-home[\s\S]*<Link[\s\S]*href="\/"[\s\S]*aria-label="Back to Home"[\s\S]*<ArrowLeft[\s\S]*<span>Home<\/span>/);
  assert.match(player, /onClick=\{\(\) => minimize\(\)\}/);
  assert.match(css, /\.watch-player-theater-home\s*\{[^}]*position:\s*absolute;[^}]*top:[^;]+;[^}]*left:[^;]+;/s);
});

test("Theater Guide program labels do not create native browser tooltips", () => {
  assert.doesNotMatch(theaterGuide, /onClick=\{\(\) => tune\(row, entry\)\} title=\{entry\.title\}/);
  assert.match(theaterGuide, /<strong>\{entry\.title\}<\/strong>/);
});
