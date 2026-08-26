import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  X_EMBED_PREFERENCE_EVENT,
  parseXEmbedPreference,
  shouldAutoLoadXEmbed,
} from "../lib/x/embed-preference";

test("X embeds default to per-embed opt-in", () => {
  assert.equal(parseXEmbedPreference(undefined), "ask");
  assert.equal(parseXEmbedPreference("granted"), "ask");
  assert.equal(shouldAutoLoadXEmbed("ask", false), false);
});

test("only the distinct always preference auto-loads, unless a privacy signal is active", () => {
  assert.equal(parseXEmbedPreference("always"), "always");
  assert.equal(shouldAutoLoadXEmbed("always", false), true);
  assert.equal(shouldAutoLoadXEmbed("always", true), false);
});

test("analytics consent cannot authorize X and same-tab preference changes are broadcast", () => {
  const preference = readFileSync(resolve(process.cwd(), "lib/x/embed-preference.ts"), "utf8");
  const embed = readFileSync(resolve(process.cwd(), "components/x/XPostEmbed.tsx"), "utf8");
  assert.equal(parseXEmbedPreference("granted"), "ask");
  assert.doesNotMatch(embed, /coreboys-consent|analytics/i);
  assert.match(preference, /window\.dispatchEvent\(new CustomEvent\(X_EMBED_PREFERENCE_EVENT/);
  assert.match(embed, /window\.addEventListener\(X_EMBED_PREFERENCE_EVENT/);
  assert.equal(X_EMBED_PREFERENCE_EVENT, "coreboys:x-embed-preference");
});
