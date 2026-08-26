import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const home = readFileSync(resolve(root, "components/watch/WatchHome.tsx"), "utf8");
const css = readFileSync(resolve(root, "app/watch/watch.css"), "utf8");

test("CORE Originals uses the shared mouse tooltip instead of a browser-native title", () => {
  assert.match(home, /<Tooltip key=\{poster\.id\} title=\{poster\.title\} description="Open this CORE Original collection\."/);
  assert.doesNotMatch(home, /right-click for browser link options/);
  assert.doesNotMatch(home, /title=\{`Open \$\{poster\.title\}/);
});

test("CORE Originals leaves headroom for raised hover cards in its scroll rail", () => {
  assert.match(css, /\.watch-events-series-rail\s*\{[\s\S]{0,420}padding:\s*0\.7rem 0\.1rem 0\.8rem;/);
  assert.match(css, /\.watch-events-series-poster:hover,[\s\S]{0,220}transform:\s*translateY\(-0\.34rem\) scale\(1\.025\)/);
});
