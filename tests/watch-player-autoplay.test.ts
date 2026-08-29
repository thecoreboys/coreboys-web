import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { embedFor, type Playable } from "../lib/watch/playable";
import {
  shouldStartFullPlayerMuted,
  shouldUpgradeTwitchLiveAutoplay,
  withTwitchAutoplayPermissions,
} from "../lib/watch/player-autoplay";

const multiview = readFileSync(resolve(process.cwd(), "components/watch/MultiPlayerStage.tsx"), "utf8");
const channelPage = readFileSync(resolve(process.cwd(), "components/watch/NetworkChannelPage.tsx"), "utf8");
const channelCss = readFileSync(resolve(process.cwd(), "components/watch/NetworkChannelPage.module.css"), "utf8");
const billboard = readFileSync(resolve(process.cwd(), "components/watch/Billboard.tsx"), "utf8");
const billboardCss = readFileSync(resolve(process.cwd(), "app/watch/watch.css"), "utf8");
const watchHome = readFileSync(resolve(process.cwd(), "components/watch/WatchHome.tsx"), "utf8");
const xArchive = readFileSync(resolve(process.cwd(), "app/channels/[slug]/x/page.tsx"), "utf8");
const persistentPlayer = readFileSync(resolve(process.cwd(), "components/watch/PersistentPlayer.tsx"), "utf8");

function playable(overrides: Partial<Playable>): Playable {
  return {
    key: "fixture",
    kind: "youtube",
    platform: "youtube",
    title: "Fixture",
    poster: "/poster.jpg",
    memberSlug: "house",
    memberLabel: "CORE",
    youtubeId: null,
    twitchLogin: null,
    vodId: null,
    clipSrc: null,
    clipId: null,
    url: null,
    ...overrides,
  };
}

test("full-player YouTube autoplay is muted without enabling preview looping", () => {
  const src = embedFor(playable({ youtubeId: "abcdefghijk" }), {
    parent: "core.test",
    origin: "https://core.test",
    muted: true,
    loop: false,
  });
  const url = new URL(src!);

  assert.equal(url.searchParams.get("autoplay"), "1");
  assert.equal(url.searchParams.get("mute"), "1");
  assert.equal(url.searchParams.has("loop"), false);
  assert.equal(url.searchParams.has("playlist"), false);
});

test("Twitch live autoplay requests the browser-safe muted mode", () => {
  const src = embedFor(playable({
    kind: "live",
    platform: "twitch",
    twitchLogin: "stableronaldo",
  }), {
    parent: "core.test",
    origin: "https://core.test",
    muted: true,
    loop: false,
  });
  const url = new URL(src!);

  assert.equal(url.searchParams.get("channel"), "stableronaldo");
  assert.equal(url.searchParams.get("autoplay"), "true");
  assert.equal(url.searchParams.get("muted"), "true");
});

test("the content advisory is acknowledged once per browser before Twitch muted autoplay", () => {
  const advisory = readFileSync(resolve(process.cwd(), "lib/watch/content-advisory.ts"), "utf8");
  assert.match(advisory, /const CONTENT_ADVISORY_STORAGE_KEY = "coretv\.content-advisory-seen\.v2"/);
  assert.match(advisory, /window\.localStorage\.setItem\(CONTENT_ADVISORY_STORAGE_KEY, "1"\)/);
  assert.match(persistentPlayer, /hasAcknowledgedContentAdvisory\(\)/);
  assert.match(persistentPlayer, /acknowledgeContentAdvisory\(\)/);
  assert.match(persistentPlayer, /shape === "portrait" \? "\/watch\/advisory\/coretv-mature-audience-station-portrait-v2\.png" : "\/watch\/advisory\/coretv-mature-audience-station-v2\.png"/);
  assert.doesNotMatch(persistentPlayer, /current\.kind === "live" && current\.platform === "twitch" && !hasTuningAudio/);
});

test("every player surface captures muted autoplay before routing settles", () => {
  assert.equal(shouldStartFullPlayerMuted("theater", false, false), true);
  assert.equal(shouldStartFullPlayerMuted("mini", true, false), true);
  assert.equal(shouldStartFullPlayerMuted("mini", false, true), true);
  assert.equal(shouldStartFullPlayerMuted("mini", false, false), true);
});

test("a paused Twitch mini player upgrades once when Theater opens", () => {
  const base = {
    isTwitchLive: true,
    mode: "mini" as const,
    playerPage: true,
    guideLivePlayback: false,
    playing: false,
    mutedIntent: false,
  };

  assert.equal(shouldUpgradeTwitchLiveAutoplay(base), true);
  assert.equal(shouldUpgradeTwitchLiveAutoplay({ ...base, playing: true }), false);
  assert.equal(shouldUpgradeTwitchLiveAutoplay({ ...base, mutedIntent: true }), false);
  assert.equal(shouldUpgradeTwitchLiveAutoplay({ ...base, isTwitchLive: false }), false);
});

test("Theater recovers a provider-owned Twitch pause without overriding a manual CORE pause", () => {
  assert.match(persistentPlayer, /const handleProviderPause = \(\) => \{/);
  assert.match(persistentPlayer, /const shouldRecover = handlersRef\.current\.onPaused\(\)/);
  assert.match(persistentPlayer, /if \(!shouldRecover\) \{\s*manualPause = true/);
  assert.match(persistentPlayer, /if \(!startMuted\) return/);
  assert.match(persistentPlayer, /for \(const delay of \[120, 650, 1_800\]\)/);
  assert.match(persistentPlayer, /if \(paused === true\) \{\s*requestAutoplay\(\);\s*scheduleMutedRecovery\(3_000\)/);
  assert.match(persistentPlayer, /if \(positionAdvanced && !playbackStarted\) markPlaybackStarted\(\)/);
  assert.match(persistentPlayer, /if \(!playingRef\.current\) return false/);
});

test("the generated Twitch iframe receives delegated autoplay permission", () => {
  assert.equal(
    withTwitchAutoplayPermissions(null),
    "autoplay; encrypted-media; picture-in-picture; fullscreen",
  );
  assert.equal(
    withTwitchAutoplayPermissions("picture-in-picture; autoplay *"),
    "picture-in-picture; autoplay *; encrypted-media; fullscreen",
  );
});

test("Twitch VOD previews start at the current 24/7 clock position", () => {
  const src = embedFor(playable({
    kind: "vod",
    platform: "twitch",
    vodId: "123456789",
  }), {
    parent: "core.test",
    origin: "https://core.test",
    muted: true,
    loop: false,
    startSeconds: 3_723,
  });
  const url = new URL(src!);

  assert.equal(url.searchParams.get("video"), "123456789");
  assert.equal(url.searchParams.get("time"), "1h2m3s");
  assert.equal(url.searchParams.get("muted"), "true");
});

test("TikTok full-player autoplay stays muted and does not loop", () => {
  const src = embedFor(playable({
    kind: "clip",
    platform: "tiktok",
    sourceUrl: "https://www.tiktok.com/@core/video/1234567890",
  }), {
    parent: "core.test",
    origin: "https://core.test",
    muted: true,
    loop: false,
  });
  const url = new URL(src!);

  assert.equal(url.searchParams.get("autoplay"), "1");
  assert.equal(url.searchParams.get("muted"), "1");
  assert.equal(url.searchParams.get("loop"), "0");
});

test("provider frames can preload muted without beginning playback", () => {
  const youtube = new URL(embedFor(playable({ youtubeId: "abcdefghijk" }), {
    parent: "core.test",
    origin: "https://core.test",
    muted: true,
    autoplay: false,
    loop: false,
  })!);
  const tiktok = new URL(embedFor(playable({
    kind: "clip",
    platform: "tiktok",
    sourceUrl: "https://www.tiktok.com/@core/video/1234567890",
  }), {
    parent: "core.test",
    origin: "https://core.test",
    muted: true,
    autoplay: false,
    loop: false,
  })!);

  assert.equal(youtube.searchParams.get("autoplay"), "0");
  assert.equal(youtube.searchParams.get("mute"), "1");
  assert.equal(tiktok.searchParams.get("autoplay"), "0");
  assert.equal(tiktok.searchParams.get("muted"), "1");
});

test("multiview programs use muted autoplay without preview looping", () => {
  assert.match(
    multiview,
    /autoplay: true,[\s\S]{0,120}muted: tile\.muted,[\s\S]{0,420}loop: false/,
  );
  assert.match(multiview, /func: "playVideo"/);
  assert.match(multiview, /type: "play"/);
  assert.match(multiview, /onCanPlay=\{\(event\) => \{/);
});

test("network hero retries only after its provider iframe has loaded", () => {
  assert.match(channelPage, /const \[frameReadyToken, setFrameReadyToken\] = useState\(0\)/);
  assert.match(channelPage, /if \(!frameSrc \|\| frameReadyToken === 0\) return/);
  assert.match(channelPage, /setFrameReadyToken\(\(token\) => token \+ 1\)/);
  assert.match(channelPage, /const attempts = \[180, 650, 1_400, 2_800\]/);
});

test("network 24/7 Twitch preview verifies and recovers actual paused playback", () => {
  assert.match(channelPage, /isPaused\?: \(\) => boolean/);
  assert.match(channelPage, /return typeof paused === "boolean" \? paused : null/);
  assert.match(channelPage, /instance\.addEventListener\(api\.Player\.PAUSE/);
  assert.match(channelPage, /scheduleRetries\(\[120, 700, 1_800, 3_200, 5_200, 7_500\], true\)/);
  assert.match(channelPage, /document\.addEventListener\("visibilitychange", resumeWhenVisible\)/);
});

test("network hero starts muted and keeps the scheduled item through provider recovery", () => {
  assert.match(channelPage, /muted:\s*true,[\s\S]{0,220}autoplay:\s*true/);
  assert.match(channelPage, /const maxPlaybackAttempts = 16/);
  assert.match(channelPage, /PLAYBACK_BLOCKED[\s\S]{0,800}scheduleRetries\(\[250, 800, 1_800, 3_200, 5_200, 7_500\], true\)/);
  assert.doesNotMatch(channelPage, /const mutedFallbackTimer = window\.setTimeout/);
  assert.match(channelPage, /className=\{styles\.heroPreviewSound\}/);
  assert.match(channelPage, /className=\{styles\.heroPreviewRetry\}/);
  assert.match(channelPage, /autoStart && usesTwitchSdk && playing/);
  assert.match(channelCss, /\.heroPreviewSound\s*\{[\s\S]{0,160}z-index:\s*8/);
  assert.doesNotMatch(channelPage, /autoplayFallbackEntry/);
  assert.doesNotMatch(channelPage, /opening next program/);
});

test("the home billboard yields provider playback to the persistent player", () => {
  assert.match(billboard, /const wantsAutoplay =[\s\S]{0,320}!current &&[\s\S]{0,160}!dataSaver/);
});

test("the home carousel guarantees live Twitch and recent Twitch broadcasts", () => {
  assert.match(watchHome, /const twitchBroadcasts = selectTwitchHeroBroadcasts\(catalog\.broadcasts\)/);
  assert.match(watchHome, /return unique\(\[[\s\S]{0,420}\.\.\.catalog\.live,[\s\S]{0,80}\.\.\.twitchBroadcasts,/);
  assert.match(billboard, /else if \(twitchVideo\) options\.video = twitchVideo\.startsWith\("v"\)/);
});

test("the home Twitch hero remains unobscured and interactive for autoplay", () => {
  assert.match(billboard, /\{!isTwitch \? \(\s*<button[\s\S]{0,180}watch-billboard-live-core-overlay/);
  assert.match(
    billboardCss,
    /\.watch-billboard-live-player\.is-preview\.is-twitch \.watch-billboard-live-mount iframe[\s\S]{0,220}pointer-events: auto !important/,
  );
});

test("the X archive prefers X profile metadata for tweet authors", () => {
  assert.match(xArchive, /const xAuthorAvatar = safeHttpsUrl\(item\.x\?\.authorAvatarUrl\)/);
  assert.match(xArchive, /portrait: xAuthorAvatar \?\? channel\.artwork/);
  assert.match(xArchive, /profileUrl: safeHttpsUrl\(item\.x\?\.authorProfileUrl\)/);
});
