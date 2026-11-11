import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { storyChapters } from "../app/special-message/story-chapters";

const page = readFileSync(new URL("../app/special-message/page.tsx", import.meta.url), "utf8");
const panorama = readFileSync(new URL("../app/special-message/PanoramaViewer.tsx", import.meta.url), "utf8");
const banner = readFileSync(new URL("../components/chrome/UnreleasedBanner.tsx", import.meta.url), "utf8");

test("timeline links resolve to visible chapters in reading order", () => {
  const sections = [...page.matchAll(/<section id="([^"]+)" data-step="(\d+)"/g)];
  assert.deepEqual(sections.map((match) => ({ id: match[1], number: match[2] })), storyChapters.map(({ id, number }) => ({ id, number })));
  assert.doesNotMatch(page, /\{false\s*\?/);
});

test("the original photos, videos, posters, screenshots and panorama remain available", () => {
  const media = [
    "core-huddle.webp", "popularmmos-profile.jpg", "gamingwithjen-profile.jpg",
    "app-screens/home.png", "app-screens/guide.png", "app-screens/now-playing-guide.png", "app-screens/flock-network.png",
    "evidence/pc-build-open.webp", "evidence/pc-build-lit.webp", "evidence/pc-build-red-poster.webp",
    "evidence/pc-build-macro.mp4", "evidence/pc-build-tour.mp4", "evidence/pc-build-red.mp4",
    "evidence/army-mercury.webp", "evidence/ucf-mark.webp", "evidence/ucf-degree-redacted.webp",
    "evidence/core-backyard-dub-poster.webp", "evidence/core-backyard-es-dubbed.mp4", "evidence/drone-panorama.webp",
  ];
  for (const file of media) {
    assert.ok(`${page}\n${panorama}`.includes(`/special-message/${file}`), `Media reference retained: ${file}`);
    assert.ok(existsSync(new URL(`../public/special-message/${file}`, import.meta.url)), `Bundled media exists: ${file}`);
  }
});

test("the personal history and independent-project disclosure remain", () => {
  for (const phrase of [
    "Cranberry Crush", "Udonis Haslem", "Norris Cole", "LeBron James, Dwyane Wade,",
    "Lubcubs Gaming", "PopularMMOs", "GamingWithJen", "chronic anxiety",
    "neurodivergent", "July 31, 2026", "DigitalOcean", "Army Reserve",
    "B.S. in Computer Science", "people who speak Spanish", "Adapt, Woj, Bepsy,",
    "not affiliated with,", "@berryeyu",
  ]) assert.ok(page.includes(phrase), `Story detail retained: ${phrase}`);
  assert.doesNotMatch(page, /\$3 a month|support the site/i);
});

test("the site banner discloses independence and links to the creator's message", () => {
  assert.match(banner, /Unofficial fan site - not affiliated with CORE\./);
  assert.match(banner, /<Link href="\/special-message"/);
  assert.match(banner, /Read a message from the site creator\./);
});
