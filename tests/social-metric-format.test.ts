import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping runner requires an explicit TypeScript suffix.
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { crewMetricSlug, formatCompactSocialCount, snapshotLookupKeys, socialHandle, socialMetricUnit, twitchLoginForSocial } from "../lib/social-metric-format.ts";

test("formats social counts without crossing a unit as 1000K", () => {
  assert.equal(formatCompactSocialCount(999), "999");
  assert.equal(formatCompactSocialCount(1_000), "1K");
  assert.equal(formatCompactSocialCount(999_950), "1M");
  assert.equal(formatCompactSocialCount(1_200_000), "1.2M");
  assert.equal(formatCompactSocialCount(1_200_000_000), "1.2B");
});

test("uses platform-correct metric labels", () => {
  assert.equal(socialMetricUnit("youtube"), "subs");
  assert.equal(socialMetricUnit("twitch"), "followers");
  assert.equal(socialMetricUnit("instagram"), "followers");
});

test("derives normalized handles and Twitch logins from profile data", () => {
  const twitch = {
    platform: "twitch",
    url: "https://www.twitch.tv/Laiys",
    handle: "@Laiys",
  };
  assert.equal(twitchLoginForSocial(twitch), "laiys");
  assert.equal(socialHandle({ platform: "tiktok", url: "https://www.tiktok.com/@creator" }), "creator");
});

test("keeps historical Twitch snapshot keys readable", () => {
  const twitch = {
    platform: "twitch",
    url: "https://www.twitch.tv/drewwall",
    handle: "drewwall",
  };
  assert.deepEqual(snapshotLookupKeys(twitch), [
    "twitch::https://www.twitch.tv/drewwall",
    "twitch::drewwall",
  ]);
  assert.deepEqual(
    snapshotLookupKeys({ platform: "youtube", url: "https://www.youtube.com/@Adapt" }),
    ["youtube::https://www.youtube.com/@Adapt"],
  );
});

test("namespaces crew snapshots away from member totals", () => {
  assert.equal(crewMetricSlug("drew-wall"), "__crew__:drew-wall");
});
