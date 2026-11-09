import assert from "node:assert/strict";
import test from "node:test";
import { FaceGuestProfileSchema, FaceCanonicalKeySchema, faceGuestPerson } from "../lib/face-people";
import { parsePublicFacePresenceResponse } from "../lib/face-presence-public";
import { EMPTY_FACE_OVERVIEW, parseFaceOverview } from "../components/admin/faces/types";
import { facePresencePlaybackMs, faceTagsAtPlaybackTime } from "../lib/face-presence-playback";

test("admins can save a guest without adding a CORE member or supplying biometric data", () => {
  const guest = FaceGuestProfileSchema.parse({ slug: " guest-streamer ", displayName: " Guest Streamer ", twitchLogin: "Guest_Streamer", youtubeUrl: "https://www.youtube.com/@gueststreamer" });
  assert.equal(guest.twitchLogin, "guest_streamer");
  const person = faceGuestPerson(guest);
  assert.equal(person.key, "guest:guest-streamer");
  assert.equal(person.profileHref, "/people/guest-streamer");
  assert.equal(person.portraitUrl, null);
  assert.equal(person.socials[0]?.url, "https://www.twitch.tv/guest_streamer");
  const overview = parseFaceOverview({ ...EMPTY_FACE_OVERVIEW, people: [person] });
  assert.equal(overview.ok, true);
  assert.equal(overview.overview.people[0]?.displayName, "Guest Streamer");
  assert.equal(overview.overview.identities.length, 0);
  assert.equal(FaceCanonicalKeySchema.safeParse(person.key).success, true);
});

test("guest profiles reject unsafe destinations, invalid keys and enrollment fields", () => {
  const profile = { slug: "guest", displayName: "Guest" };
  for (const youtubeUrl of [
    "javascript:alert(1)", "https://youtube.com.attacker.test/@guest", "https://attacker@youtube.com/@guest",
    "https://www.youtube.com/redirect?q=https://attacker.test", "https://www.youtube.com/watch?v=123",
    "https://www.youtube.com/@guest?tracking=1", "http://youtube.com/@guest",
  ]) assert.equal(FaceGuestProfileSchema.safeParse({ ...profile, youtubeUrl }).success, false, youtubeUrl);
  assert.equal(FaceGuestProfileSchema.safeParse({ ...profile, slug: "../admin" }).success, false);
  assert.equal(FaceGuestProfileSchema.safeParse({ ...profile, twitchLogin: "https://twitch.tv/guest" }).success, false);
  assert.equal(FaceGuestProfileSchema.safeParse({ ...profile, embedding: [1, 0] }).success, false);
  assert.equal(FaceGuestProfileSchema.safeParse(profile).success, true, "social accounts are optional");
});

test("guest profile tags survive public parsing while private and malformed routes are rejected", () => {
  const tag = { trackId: "track", identityId: "identity", displayName: "Guest", profileHref: "/people/guest", startMs: 0, endMs: 1000, confidenceBand: "reviewed", bbox: null, socialLinks: [] };
  const parsed = parsePublicFacePresenceResponse({ contentId: "yt-fixture", atMs: 100, tags: [tag, ...[
    "/people/../../admin", "/people/%2e%2e/admin", "/people/guest?redirect=/admin", "/people/guest/extra", "/people/", "//evil.test/people/guest",
  ].map((profileHref) => ({ ...tag, profileHref }))] });
  assert.equal(parsed?.tags.length, 1);
  assert.equal(parsed?.tags[0]?.profileHref, "/people/guest");
});

test("tags require the current video's real clock and disappear at the interval end", () => {
  const sample = { contentId: "vod-1", seconds: 3, observedAt: 1000 };
  assert.equal(facePresencePlaybackMs(sample, "vod-1", 2000), 3000);
  assert.equal(facePresencePlaybackMs(sample, "vod-2", 2000), null);
  assert.equal(facePresencePlaybackMs(sample, "vod-1", 6001), null);
  assert.equal(facePresencePlaybackMs(null, "vod-1", 2000), null);
  assert.equal(facePresencePlaybackMs({ ...sample, seconds: NaN }, "vod-1", 2000), null);
  const tags = [{ startMs: 1000, endMs: 2000 }, { startMs: 0, endMs: null }];
  assert.equal(faceTagsAtPlaybackTime(tags, 1000).length, 1);
  assert.equal(faceTagsAtPlaybackTime(tags, 2000).length, 0);
  assert.equal(faceTagsAtPlaybackTime(tags, null).length, 0);
});
