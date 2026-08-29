import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const channelPage = readFileSync(resolve(process.cwd(), "components/watch/NetworkChannelPage.tsx"), "utf8");
const channelCss = readFileSync(resolve(process.cwd(), "components/watch/NetworkChannelPage.module.css"), "utf8");

test("channel social tiles only use an avatar resolved for that exact social account", () => {
  assert.match(channelPage, /avatarUrl:\s*socialAvatarByUrl\[social\.url\]/);
  assert.doesNotMatch(channelPage, /avatarUrl:\s*socialAvatarByUrl\[social\.url\]\s*\?\?\s*member\.portrait/);
  assert.doesNotMatch(channelPage, /social\.avatarUrl\s*\?\?\s*channel\.artwork/);
});

test("an expired or unavailable social avatar falls back to its platform mark", () => {
  assert.match(channelPage, /function ChannelSocialAvatar/);
  assert.match(channelPage, /onError=\{\(\) => setImageFailed\(true\)\}/);
  assert.match(channelPage, /<SocialIcon platform=\{social\.platform\} size=\{18\}/);
  assert.match(channelCss, /\.connectedAccountFallback\s*\{/);
  assert.match(channelCss, /\.connectedAccountAvatar\[data-platform="instagram"\]/);
  assert.match(channelCss, /\.connectedAccountAvatar\[data-platform="tiktok"\]/);
});
