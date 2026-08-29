import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const channelPage = readFileSync(resolve(process.cwd(), "components/watch/NetworkChannelPage.tsx"), "utf8");
const persistentPlayer = readFileSync(resolve(process.cwd(), "components/watch/PersistentPlayer.tsx"), "utf8");

test("a current 24/7 live broadcast has open-ended hero metadata", () => {
  assert.match(channelPage, /const hasOpenEndedLiveOnAir = onAirEntry\?\.current === true && isLiveMedia\(onAirEntry\.item\)/);
  assert.match(channelPage, /Live since \$\{timeLabel\(onAirEntry\.startsAt/);
  assert.match(channelPage, /selectedLive \? \{\} : \{ endsAt: new Date\(selectedEntry\.endsAt\)\.toISOString\(\) \}/);
  assert.doesNotMatch(channelPage, /min remaining/);
  assert.doesNotMatch(channelPage, /rotation resumes/);
});

test("the persistent player ignores a stale schedule endpoint for live metadata", () => {
  const liveReturn = persistentPlayer.indexOf('if (airing.status === "live") return `Live now · Started ${point}`;');
  const parseEnd = persistentPlayer.indexOf("const parsedEnd = airing.endsAt ? Date.parse(airing.endsAt) : NaN;");

  assert.ok(liveReturn >= 0, "live metadata has an open-ended label");
  assert.ok(parseEnd > liveReturn, "the label is returned before any scheduled end can be formatted");
  assert.doesNotMatch(persistentPlayer, /return endsAt === null \? `Live now · Started \$\{span\}` : `Live now · \$\{span\}`/);
});
