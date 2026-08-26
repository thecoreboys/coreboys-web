import assert from "node:assert/strict";
import test from "node:test";
import { parseXCommunitiesJson, parseXFeaturedPostIds, parseXPostReference } from "../lib/x/parsing";

test("X post references accept canonical ids/URLs and reject lookalike hosts", () => {
  assert.deepEqual(parseXPostReference("1234567890"), {
    postId: "1234567890",
    authorHandle: "i",
    url: "https://x.com/i/status/1234567890",
  });
  assert.equal(parseXPostReference("https://x.com/coreboys/status/1234567890")?.postId, "1234567890");
  assert.equal(parseXPostReference("https://x.com.evil.example/coreboys/status/1234567890"), null);
});

test("X Community configuration needs exact IDs and ignores unknown keys", () => {
  const parsed = parseXCommunitiesJson(JSON.stringify({
    core: { id: "1234567890", description: "Official" },
    flock: { url: "https://x.com/i/communities/9876543210" },
    invented: { id: "1111111111" },
    stable: { url: "https://x.com/coreboys" },
  }));
  assert.equal(parsed.core?.communityUrl, "https://x.com/i/communities/1234567890");
  assert.equal(parsed.flock?.communityId, "9876543210");
  assert.equal(parsed.stable, undefined);
  assert.equal("invented" in parsed, false);
});

test("verified creator Communities map to the correct six owners without inventing CORE", () => {
  const parsed = parseXCommunitiesJson(JSON.stringify({
    flock: { id: "1846278604495138826" },
    stable: { id: "1863444310034702669" },
    thugs: { id: "2001078933861884415" },
    m3: { id: "1926380245063520455" },
    nms: { id: "1882332006949744648" },
    slg: { id: "1552952920630493185" },
  }));

  assert.deepEqual(Object.keys(parsed).sort(), ["flock", "m3", "nms", "slg", "stable", "thugs"]);
  assert.equal(parsed.flock?.communityUrl, "https://x.com/i/communities/1846278604495138826");
  assert.equal(parsed.stable?.communityUrl, "https://x.com/i/communities/1863444310034702669");
  assert.equal(parsed.thugs?.communityUrl, "https://x.com/i/communities/2001078933861884415");
  assert.equal(parsed.m3?.communityUrl, "https://x.com/i/communities/1926380245063520455");
  assert.equal(parsed.nms?.communityUrl, "https://x.com/i/communities/1882332006949744648");
  assert.equal(parsed.slg?.communityUrl, "https://x.com/i/communities/1552952920630493185");
  assert.equal(parsed.core, undefined);
});

test("the explicit featured-post configuration has one sitewide slot", () => {
  assert.deepEqual(
    parseXFeaturedPostIds("1234567890,9876543210"),
    ["1234567890"],
  );
});
