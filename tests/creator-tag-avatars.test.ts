import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import * as model from "../lib/creator-tags/model";
import type { CreatorProfile } from "../lib/creator-tags/model";

const twitch: CreatorProfile = { id: "test", name: "Test Creator", aliases: ["testcreator"], active: true, socials: [{ platform: "twitch", url: "https://www.twitch.tv/testcreator" }] };
const kick: CreatorProfile = { ...twitch, id: "kick-test", socials: [{ platform: "kick", url: "https://kick.com/testcreator" }] };
type Service = {
  creatorAvatarSource(creator: CreatorProfile, now?: number): unknown;
  fetchCreatorAvatarUpdates(creators: CreatorProfile[], limit?: number, now?: number): Promise<Array<{ previous: CreatorProfile; profile: CreatorProfile }>>;
};
function service(options: { twitchFailure?: boolean; wrongKickUser?: boolean } = {}) {
  let twitchCalls = 0, kickCalls = 0;
  const source = transpileModule(readFileSync(resolve("lib/creator-tags/avatars.ts"), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
  const api = {};
  vm.runInNewContext(`(function(exports,require){${source}\n})`, { Date, URL, AbortSignal, fetch: async (url: string) => {
    assert.match(url, /^https:\/\/kick\.com\/api\/v2\/channels\/[a-z0-9-]+$/);
    kickCalls++;
    return { ok: true, json: async () => ({ slug: new URL(url).pathname.split("/").at(-1), user: { username: options.wrongKickUser ? "unrelated" : "testcreator", profile_pic: "https://files.kick.com/images/user/1/avatar.webp" }, banner_image: "https://files.kick.com/banner.webp" }) };
  } })(api, (id: string) => {
    if (id === "server-only") return {};
    if (id === "./model") return model;
    if (id === "@/lib/twitch") return { fetchUsersByLogin: async (logins: string[]) => {
      twitchCalls++;
      if (options.twitchFailure) throw new Error("provider unavailable");
      return Object.fromEntries(logins.map((login) => [login, { login, profile_image_url: "https://static-cdn.jtvnw.net/jtv_user_pictures/avatar.png" }]));
    } };
    throw new Error(`Unexpected avatar dependency: ${id}`);
  });
  return { api: api as Service, counts: () => ({ twitchCalls, kickCalls }) };
}
const now = Date.parse("2026-10-12T12:00:00Z");
test("scheduled avatar refresh respects fresh metadata, manual pictures and hidden creators", () => {
  const { api } = service();
  assert.ok(api.creatorAvatarSource(twitch, now));
  assert.equal(api.creatorAvatarSource({ ...twitch, active: false }, now), null);
  assert.equal(api.creatorAvatarSource({ ...twitch, avatarUrl: "https://media.thecoreboys.com/avatars/curated.webp" }, now), null);
  const fresh = { ...twitch, avatarUrl: "https://static-cdn.jtvnw.net/jtv_user_pictures/avatar.png", avatarSourceProfile: twitch.socials[0]!.url, avatarCheckedAt: new Date(now - 60_000).toISOString() };
  assert.equal(api.creatorAvatarSource(fresh, now), null);
  assert.ok(api.creatorAvatarSource({ ...fresh, avatarCheckedAt: new Date(now - 2 * 86_400_000).toISOString() }, now));
});
test("profile metadata refresh uses batched Twitch and attributable Kick pictures without model calls", async () => {
  const { api, counts } = service();
  const updates = await api.fetchCreatorAvatarUpdates([twitch, kick], 50, now);
  assert.equal(updates.length, 2);
  assert.equal(updates[0]!.profile.avatarCheckedAt, new Date(now).toISOString());
  assert.equal(updates[1]!.profile.avatarUrl, "https://files.kick.com/images/user/1/avatar.webp");
  assert.deepEqual(counts(), { twitchCalls: 1, kickCalls: 1 });
  assert.equal(twitch.avatarUrl, undefined, "provider lookup cannot mutate the source profile");
});
test("failed or mismatched providers cannot replace verified pictures or use channel banners", async () => {
  const { api } = service({ twitchFailure: true, wrongKickUser: true });
  const updates = await api.fetchCreatorAvatarUpdates([twitch, kick], 50, now);
  assert.equal(updates.length, 2);
  for (const entry of updates) {
    assert.equal(entry.profile.avatarUrl, undefined);
    assert.equal(api.creatorAvatarSource(entry.profile, now + 60_000), null, "failed profiles receive a cooldown so later entries can refresh");
  }
});
test("avatar refresh caps Kick requests and normalizes trailing slashes", async () => {
  const { api, counts } = service();
  const profiles = Array.from({ length: 12 }, (_, index) => ({ ...kick, id: `guest-${index}`, socials: [{ platform: "kick" as const, url: `https://kick.com/guest-${index}/` }] }));
  await api.fetchCreatorAvatarUpdates(profiles, 1000, now);
  assert.equal(counts().kickCalls, 5);
});
