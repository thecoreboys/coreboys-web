import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("channel pages derive and mount their canonical X Community", () => {
  const route = source("app/channels/[slug]/page.tsx");
  const page = source("components/watch/NetworkChannelPage.tsx");

  assert.match(route, /getXCommunityForMemberSlug\(channel\.memberSlug\)/);
  assert.match(route, /xCommunityKey=\{xCommunity\?\.key \?\? "core"\}/);
  assert.match(page, /xCommunityKey: XCommunityKey/);
  assert.match(page, /<XCommunityShelf selectedKey=\{xCommunityKey\} compact \/>/);
});

test("channel pages keep Community nominations distinct from cached owner-profile posts", () => {
  const route = source("app/channels/[slug]/page.tsx");
  const page = source("components/watch/NetworkChannelPage.tsx");

  assert.match(route, /catalog\.byPlatform\.x\.filter/);
  assert.match(route, /item\.memberSlug === channel\.memberSlug/);
  assert.match(route, /selectWatchHomeXPosts/);
  assert.match(route, /ownerXPosts=\{ownerXPosts\}/);
  assert.match(page, /import \{ XTweetsRail \} from "\.\/XTweetsRail"/);
  assert.match(page, /<XTweetsRail[\s\S]{0,240}items=\{ownerXPosts\}/);
  assert.match(page, /not posts from the X Community timeline/);
  assert.match(page, /hub\.all\.filter\(\(item\) => item\.platform !== "x"\)/);
  assert.match(page, /sourceDescriptors\.filter\(\(source\) => source\.platform !== "x"\)/);
});

test("the mounted Community shelf remains cache-only for X metadata", () => {
  const metadata = source("lib/x/community-metadata.ts");
  const shelf = source("components/x/XCommunityShelf.tsx");

  assert.match(metadata, /Visitor-facing directory reads are cache-only/);
  assert.doesNotMatch(metadata, /api\.x\.com|api\.twitter\.com/);
  assert.match(shelf, /\/api\/x\/communities/);
  assert.doesNotMatch(shelf, /api\.x\.com|api\.twitter\.com/);
});

test("a channel shelf scopes both cached metadata and moderated posts to its Community", () => {
  const shelf = source("components/x/XCommunityShelf.tsx");

  assert.match(shelf, /`\?key=\$\{encodeURIComponent\(selectedKey\)\}`/);
  assert.match(shelf, /`\?community=\$\{encodeURIComponent\(selectedKey\)\}`/);
  assert.match(shelf, /fetch\(`\/api\/x\/communities\$\{communityQuery\}`/);
  assert.match(shelf, /fetch\(`\/api\/x\/nominations\$\{nominationQuery\}`/);
  assert.match(shelf, /\}, \[selectedKey\]\);/);
});
