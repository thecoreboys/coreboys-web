import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const player = readFileSync(resolve(root, "components/watch/PersistentPlayer.tsx"), "utf8");
const theaterGuide = readFileSync(resolve(root, "components/watch/TheaterNetworkGuide.tsx"), "utf8");
const css = readFileSync(resolve(root, "app/watch/watch.css"), "utf8");

test("Theater Guide opens the shared Guide as a full-page dialog with a back action", () => {
  assert.match(player, /guideOverlayOpen \? "is-guide-open"/);
  assert.doesNotMatch(player, /guideDockedPlayer|is-guide-docked|data-guide-player/);
  assert.match(theaterGuide, /Dialog\.Portal/);
  assert.match(theaterGuide, /import\("\.\/GuideGrid"\)/);
  assert.match(theaterGuide, /Back to media player/);
  assert.match(theaterGuide, /onTune=\{tuneProgram\}/);
  assert.match(theaterGuide, /onClick=\{returnToPlayer\}/);
  assert.match(theaterGuide, /onEscapeKeyDown=\{event => \{ event.preventDefault\(\); event.stopPropagation\(\); returnToPlayer\(\); \}\}/);
  assert.match(player, /if \(event.defaultPrevented \|\| guideMenuOpen\) return/);
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
  assert.match(player, /shortsPage && queueOpen[\s\S]{0,240}lg:grid-cols-\[minmax\(0,calc\(\(100dvh-8rem-var\(--watch-creator-tags-height,0px\)\)\*9\/16\)\)_22rem\]/);
});

test("Theater has a top-left back arrow labeled Home", () => {
  assert.match(player, /\{theater && !shortsPage \? \([\s\S]*watch-player-theater-home[\s\S]*<Link[\s\S]*href="\/"[\s\S]*aria-label="Back to Home"[\s\S]*<ArrowLeft[\s\S]*<span>Home<\/span>/);
  assert.match(player, /onClick=\{minimizeForNavigation\}/);
  assert.match(player, /const minimizeForNavigation = useCallback\(\(\) => \{\s*cancelTheaterHandoff\(window\.location\);\s*minimize\(\);/);
  assert.match(css, /\.watch-player-theater-home\s*\{[^}]*position:\s*absolute;[^}]*top:[^;]+;[^}]*left:[^;]+;/s);
});

test("Theater uses the shared program cards instead of a separate cramped timeline", () => {
  assert.doesNotMatch(theaterGuide, /theater-network-guide-program/);
  assert.match(theaterGuide, /initialGuide=\{data\}/);
});
