import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const railPath = new URL("../components/watch/XTweetsRail.tsx", import.meta.url);
const hoverPath = new URL("../components/watch/XPostHoverPreview.tsx", import.meta.url);
const embedPath = new URL("../components/x/XPostEmbed.tsx", import.meta.url);
const timelinePath = new URL("../components/x/XProfileTimeline.tsx", import.meta.url);
const widgetsPath = new URL("../lib/x/widgets.ts", import.meta.url);

test("Watch home renders cached X posts as native cards without embeds or visitor fetches", async () => {
  const rail = await readFile(railPath, "utf8");
  const hover = await readFile(hoverPath, "utf8");
  const embed = await readFile(embedPath, "utf8");
  const timeline = await readFile(timelinePath, "utf8");
  const widgets = await readFile(widgetsPath, "utf8");
  assert.doesNotMatch(rail, /XPostEmbed|XProfileTimeline/);
  assert.doesNotMatch(rail, /fetch\s*\(/);
  assert.match(rail, /title = "On X"/);
  assert.match(rail, /maxItems = 18/);
  assert.match(rail, /Math\.min\(48, Math\.trunc\(maxItems\)\)/);
  assert.match(rail, /WatchHomeXPost/);
  assert.match(rail, /data-featured/);
  assert.match(rail, /useSeenXPost/);
  assert.match(rail, /<XPostCard post=\{post\}/);
  assert.match(rail, /BrowserRelativeTime/);
  assert.match(rail, /post\.media/);
  assert.match(rail, /if \(!items\.length && !spaces\.length\) return null/);
  assert.doesNotMatch(`${rail}\n${hover}`, /platform\.twitter\.com|api\.x\.com/);

  // Other explicitly interactive X surfaces retain their privacy gate; the
  // homepage no longer imports either one.
  assert.match(embed, /privacyHold && !manual/);
  assert.match(embed, /Load X post/);
  assert.match(embed, /dnt: true/);
  assert.match(timeline, /Show latest posts/);
  assert.match(timeline, /data\.dnt = "true"|dataset\.dnt = "true"/);
  assert.match(widgets, /platform\.twitter\.com\/widgets\.js/);
});
