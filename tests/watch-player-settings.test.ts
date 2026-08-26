import assert from "node:assert/strict";
import test from "node:test";
import { youtubeCaptionCommands } from "../lib/watch/youtube-player";

test("YouTube captions enable without replacing the iframe", () => {
  assert.deepEqual(youtubeCaptionCommands(true), [
    { func: "loadModule", args: ["captions"] },
    { func: "setOption", args: ["captions", "track", { languageCode: "en" }] },
    { func: "setOption", args: ["captions", "reload", true] },
  ]);
});

test("YouTube captions turn off explicitly", () => {
  assert.deepEqual(youtubeCaptionCommands(false), [
    { func: "setOption", args: ["captions", "track", {}] },
    { func: "unloadModule", args: ["captions"] },
  ]);
});

test("YouTube caption module changes only once it reports ready", () => {
  assert.deepEqual(youtubeCaptionCommands(true, { moduleReady: true }), [
    { func: "setOption", args: ["captions", "track", { languageCode: "en" }] },
    { func: "setOption", args: ["captions", "reload", true] },
  ]);
});
