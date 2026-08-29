import assert from "node:assert/strict";
import test from "node:test";
import {
  publicInstagramProfileAvatarUrl,
  publicSnapchatProfileAvatarUrl,
  publicYouTubeChannelAvatarUrl,
  profileImageUrlExpiry,
  safeProfileImageUrl,
} from "../lib/watch/social-profile-image";
import { extractPublicTikTokProfileAvatar } from "../lib/tiktok-public";

test("public YouTube channel metadata accepts only the canonical yt3 avatar CDN", () => {
  const result = publicYouTubeChannelAvatarUrl(
    '<meta property="og:image" content="https://yt3.googleusercontent.com/channel-avatar=s900-c-k-c0x00ffffff-no-rj">',
  );
  assert.equal(result, "https://yt3.googleusercontent.com/channel-avatar=s900-c-k-c0x00ffffff-no-rj");
});

test("public YouTube channel metadata rejects video artwork and non-HTTPS values", () => {
  assert.equal(
    publicYouTubeChannelAvatarUrl(
      '<meta content="https://i.ytimg.com/vi/abc/hqdefault.jpg" property="og:image">',
    ),
    null,
  );
  assert.equal(
    publicYouTubeChannelAvatarUrl(
      '<meta property="og:image" content="http://yt3.ggpht.com/unsafe">',
    ),
    null,
  );
});

test("profile image normalizer only returns absolute HTTPS URLs", () => {
  assert.equal(
    safeProfileImageUrl("https://static-cdn.jtvnw.net/avatar.png"),
    "https://static-cdn.jtvnw.net/avatar.png",
  );
  assert.equal(safeProfileImageUrl("/members/ron.jpg"), null);
  assert.equal(safeProfileImageUrl("javascript:alert(1)"), null);
});

test("signed TikTok and Instagram profile URLs expose a cache refresh deadline", () => {
  assert.equal(
    profileImageUrlExpiry("https://p19.tiktokcdn-us.com/avatar.jpeg?x-expires=1800000000"),
    1_800_000_000_000,
  );
  assert.equal(
    profileImageUrlExpiry("https://scontent-mia5-1.cdninstagram.com/avatar.jpg?oe=6B49D200"),
    Number.parseInt("6B49D200", 16) * 1_000,
  );
  assert.equal(profileImageUrlExpiry("https://yt3.googleusercontent.com/avatar"), null);
});

test("public Instagram profile metadata accepts only the requested account's CDN avatar", () => {
  const avatar = publicInstagramProfileAvatarUrl(
    '<meta property="og:title" content="Ronaldo (&#064;stableronaldo) &#x2022; Instagram photos and videos"><script type="application/json">{"profile_pic_url":"https://scontent-mia5-1.cdninstagram.com/v/t51.82787-19/ron.jpg?x=1\\u0026y=2"}</script>',
    "@stableronaldo",
  );
  assert.equal(
    avatar,
    "https://scontent-mia5-1.cdninstagram.com/v/t51.82787-19/ron.jpg?x=1&y=2",
  );
});

test("public Instagram profile metadata rejects another handle and off-platform images", () => {
  const anotherCreator = '<meta property="og:title" content="Lacy (&#064;lacy.himself) &#x2022; Instagram photos and videos"><script>{"profile_pic_url":"https://scontent-mia5-1.cdninstagram.com/portrait.jpg"}</script>';
  const offPlatform = '<meta property="og:title" content="Ronaldo (&#064;stableronaldo) &#x2022; Instagram photos and videos"><script>{"profile_pic_url":"https://example.test/portrait.jpg"}</script>';
  assert.equal(publicInstagramProfileAvatarUrl(anotherCreator, "stableronaldo"), null);
  assert.equal(publicInstagramProfileAvatarUrl(offPlatform, "stableronaldo"), null);
});

test("public Snapchat profile metadata accepts only the explicit Snapchat profile picture", () => {
  const avatar = publicSnapchatProfileAvatarUrl(
    '<img alt="Profile Picture" srcSet="https://cf-st.sc-cdn.net/d/abc.webp 1x, https://cf-st.sc-cdn.net/d/abc@2x.webp 2x">',
  );
  assert.equal(avatar, "https://cf-st.sc-cdn.net/d/abc.webp");
  assert.equal(
    publicSnapchatProfileAvatarUrl('<img alt="Profile Picture" src="https://example.test/portrait.webp">'),
    null,
  );
});

test("public TikTok profile metadata returns only an exact handle's TikTok CDN avatar", () => {
  const profile = extractPublicTikTokProfileAvatar(
    '<script type="application/json">{"UserModule":{"users":{"realstableronaldo":{"uniqueId":"realstableronaldo","avatarLarger":"https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/avatar.jpeg?x=1"}}}}</script>',
    "@realstableronaldo",
  );
  assert.deepEqual(profile, {
    handle: "realstableronaldo",
    avatarUrl: "https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/avatar.jpeg?x=1",
  });
});

test("public TikTok profile metadata rejects a mismatched handle or a non-TikTok CDN image", () => {
  const mismatched = '<script type="application/json">{"user":{"uniqueId":"anothercreator","avatarLarger":"https://p16-sign-va.tiktokcdn.com/a.jpeg"}}</script>';
  const offCdn = '<script type="application/json">{"user":{"uniqueId":"realstableronaldo","avatarLarger":"https://example.test/a.jpeg"}}</script>';
  assert.equal(extractPublicTikTokProfileAvatar(mismatched, "realstableronaldo"), null);
  assert.equal(extractPublicTikTokProfileAvatar(offCdn, "realstableronaldo"), null);
});
