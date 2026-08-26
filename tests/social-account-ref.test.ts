import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { normalizeCreatorSocialHandle } from "../lib/watch/social-account-ref.ts";

test("normalizes configured TikTok handles and official profile URLs", () => {
  assert.equal(normalizeCreatorSocialHandle("tiktok", "@FaZeAdapt"), "fazeadapt");
  assert.equal(
    normalizeCreatorSocialHandle("tiktok", "https://www.tiktok.com/@FaZeAdapt?lang=en"),
    "fazeadapt",
  );
  assert.equal(
    normalizeCreatorSocialHandle("tiktok", "m.tiktok.com/@realstableronaldo/"),
    "realstableronaldo",
  );
});

test("normalizes configured Instagram handles and official profile URLs", () => {
  assert.equal(normalizeCreatorSocialHandle("instagram", "@Lacy.Himself"), "lacy.himself");
  assert.equal(
    normalizeCreatorSocialHandle("instagram", "https://instagram.com/thefazeadapt/"),
    "thefazeadapt",
  );
  assert.equal(
    normalizeCreatorSocialHandle("instagram", "www.instagram.com/silky.durag"),
    "silky.durag",
  );
});

test("rejects post URLs, cross-provider URLs, and invalid account refs", () => {
  assert.equal(
    normalizeCreatorSocialHandle("tiktok", "https://www.tiktok.com/@fazeadapt/video/123"),
    "",
  );
  assert.equal(
    normalizeCreatorSocialHandle("instagram", "https://instagram.com/reel/abc/"),
    "",
  );
  assert.equal(
    normalizeCreatorSocialHandle("instagram", "https://tiktok.com/@fazeadapt"),
    "",
  );
  assert.equal(normalizeCreatorSocialHandle("instagram", "Adapt on Instagram"), "");
  assert.equal(normalizeCreatorSocialHandle("tiktok", ""), "");
});

test("official feed fetchers expose safe diagnostics and keep tokens out of media URLs", () => {
  const socialFeed = readFileSync(resolve(process.cwd(), "lib/social-feed.ts"), "utf8");
  const credentials = readFileSync(
    resolve(process.cwd(), "lib/watch/social-credentials.ts"),
    "utf8",
  );

  assert.match(socialFeed, /export async function fetchTikTokFeedResult/);
  assert.match(socialFeed, /export async function fetchInstagramFeedResult/);
  assert.match(socialFeed, /credentialSource: "env" \| null/);
  assert.match(socialFeed, /Authorization: `Bearer \$\{credential\.accessToken\}`/);
  assert.doesNotMatch(
    socialFeed,
    /new URLSearchParams\(\{[\s\S]{0,250}access_token:\s*credential\.accessToken/,
  );
  assert.match(credentials, /socialCredentialDiagnosticFor/);
  assert.match(credentials, /normalizeCreatorSocialHandle\(provider, rawHandle\)/);
  assert.match(credentials, /Viewer OAuth is intentionally excluded/);
});
