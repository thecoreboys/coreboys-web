import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  RADIO_NETWORK_SLUGS,
  networkTuneCandidates,
  selectCueCandidate,
  selectNetworkTuneAsset,
  type RadioCueAsset,
} from "../lib/radio/public-catalog";

test("every network retains its existing synchronous first-tune recording", () => {
  for (const network of RADIO_NETWORK_SLUGS) {
    const candidates = networkTuneCandidates(network);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.kind, "tune_in");
    assert.equal(candidates[0]?.networkSlug, network);
    assert.match(candidates[0]?.audioUrl ?? "", /^\/audio\/network-tunes\/.+\.mp3$/);
    assert.equal(selectNetworkTuneAsset(network).id, candidates[0]?.id);
  }
});

test("a preloaded alternate avoids the immediately previous recording", () => {
  const assets: RadioCueAsset[] = [
    { id: "a", poolKey: "tune-in:core", kind: "tune_in", networkSlug: "core", title: "A", audioUrl: "/a.mp3", transcript: null, spokenTemplate: null, fallback: false },
    { id: "b", poolKey: "tune-in:core", kind: "tune_in", networkSlug: "core", title: "B", audioUrl: "/b.mp3", transcript: null, spokenTemplate: null, fallback: false },
  ];
  assert.equal(selectCueCandidate(assets, { excludedIds: ["a"], random: () => 0 })?.id, "b");
  assert.equal(selectNetworkTuneAsset("core", { candidates: assets, previousAssetId: "a", random: () => 0 }).id, "b");
  // A one-item pool remains playable rather than producing a dead tune-in.
  assert.equal(selectCueCandidate([assets[0]!], { excludedIds: ["a"] })?.id, "a");
});

test("radio APIs expose recorded cues only and keep the catalog cacheable", () => {
  const catalogRoute = readFileSync(resolve(process.cwd(), "app/api/radio/catalog/route.ts"), "utf8");
  const cueRoute = readFileSync(resolve(process.cwd(), "app/api/radio/cues/route.ts"), "utf8");
  const migration = readFileSync(resolve(process.cwd(), "scripts/migrations/033_dj_cora_radio_cues.sql"), "utf8");
  assert.match(catalogRoute, /max-age=45/);
  assert.match(catalogRoute, /getPublicRadioCueCatalog/);
  assert.match(cueRoute, /never prompts or invokes a text-to-speech service/);
  assert.match(migration, /live_takeover/);
  assert.match(migration, /status <> 'approved' OR audio_url IS NOT NULL/);
});
