import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const preview = readFileSync(new URL("../components/watch/HoverPreview.tsx", import.meta.url), "utf8");
const watchCss = readFileSync(new URL("../app/watch/watch.css", import.meta.url), "utf8");

test("portrait hover previews use icon actions without redundant play tooltips", () => {
  assert.match(preview, /Button as AriaButton/);
  assert.match(preview, /shape === "portrait" \? "is-icon-only"/);
  assert.match(preview, /title=\{feedback === "not_interested" \? "Undo not interested" : "Not interested"\}/);
  assert.match(preview, /Show fewer recommendations like this title\./);
  assert.match(preview, /title=\{feedback === "like" \? "Unlike" : "Like"\}/);
  assert.match(preview, /Use this title to improve your recommendations\./);
  assert.doesNotMatch(preview, /title="Play now"/);
  assert.doesNotMatch(preview, /Open this title in the CORE media player\./);
  assert.match(preview, /excludeFromTabOrder=\{!keyboardActive\}/);
});

test("portrait icon actions retain accessible 44 pixel targets without visible labels", () => {
  assert.match(watchCss, /\.watch-preview-feedback\.is-icon-only button\s*\{[^}]*width: 44px;[^}]*height: 44px;/s);
  assert.match(watchCss, /\.watch-preview-feedback\.is-icon-only button span\s*\{\s*display: none;/s);
  assert.match(preview, /aria-label=\{feedback === "like"/);
  assert.match(preview, /aria-label=\{`Play \$\{item\.title\} now`\}/);
});
