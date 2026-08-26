import assert from "node:assert/strict";
import test from "node:test";
import { twitchUserEmoteUrl } from "../lib/oauth/twitch-emotes";

test("builds Twitch user emote images from the provider template", () => {
  const url = twitchUserEmoteUrl(
    "https://static.example/{{id}}/{{format}}/{{theme_mode}}/{{scale}}",
    {
      id: "emote_123",
      name: "COREHype",
      format: ["static", "animated"],
      theme_mode: ["light", "dark"],
      scale: ["1.0", "2.0", "3.0"],
    },
  );
  assert.equal(url, "https://static.example/emote_123/animated/dark/2.0");
});

test("rejects malformed Twitch emote IDs", () => {
  assert.equal(twitchUserEmoteUrl(undefined, { id: "../escape", name: "bad" }), null);
});
