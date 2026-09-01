import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const theaterStage = readFileSync(resolve(root, "components/watch/TheaterStage.tsx"), "utf8");
const player = readFileSync(resolve(root, "components/watch/PersistentPlayer.tsx"), "utf8");
const catalog = readFileSync(resolve(root, "lib/watch/catalog.ts"), "utf8");

test("Theater preserves approved social artwork and photo media from its route", () => {
  assert.match(theaterStage, /function safeImageUrl/);
  assert.match(theaterStage, /const poster = safeImageUrl\(params\.get\("poster"\)/);
  assert.match(theaterStage, /const mediaUrl = safeImageUrl\(params\.get\("media"\)/);
  assert.match(theaterStage, /mediaUrl: mediaUrl \?\? undefined/);
});

test("Instagram photos route to the in-app Theater with canonical source preserved", () => {
  assert.match(catalog, /const instagramPhotoTheater = isPhoto && item\.platform === "instagram"/);
  assert.match(catalog, /instagramPhotoTheater \? sourceUrl : playableUrl/);
  assert.match(catalog, /instagramPhotoTheater \? `&poster=/);
});

test("social Theater presentations retain an intentional in-app source card", () => {
  assert.match(player, /data-social-theater-presentation/);
  assert.match(player, /socialTheaterLabel/);
  assert.match(player, /Original ↗/);
  assert.match(player, /query\.set\("poster", item\.poster\)/);
  assert.match(player, /query\.set\("media", item\.mediaUrl\)/);
});
