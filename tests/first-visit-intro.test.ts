import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  activeIntroCue, hasSeenIntro, introCastRevealed, introCreditVisible, introCueState, introPreloadPercent, rememberIntro,
  INTRO_NAME_CUES, INTRO_PRELOAD_WEIGHTS, INTRO_SEEN_KEY,
} from "../lib/first-visit-intro";
import { MEMBERS, MEMBERS_BY_SLUG } from "../lib/members";

const component = readFileSync(resolve(process.cwd(), "components/editorial/FirstVisitIntro.tsx"), "utf8");
const preload = readFileSync(resolve(process.cwd(), "components/editorial/intro-preload.ts"), "utf8");
const VIDEO_SECONDS = 45.7;

test("the welcome intro remembers completed or deliberately skipped visits across sessions", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(hasSeenIntro(storage), false);
  rememberIntro(storage);
  assert.equal(values.get(INTRO_SEEN_KEY), "1");
  assert.equal(hasSeenIntro(storage), true);
  assert.equal(hasSeenIntro({ getItem: (key) => values.get(key) ?? null }), true);
});

test("blocked local storage falls back to an exact first-party cookie", () => {
  const blocked = { getItem: () => { throw new Error("Storage disabled"); }, setItem: () => { throw new Error("Storage disabled"); } };
  assert.doesNotThrow(() => rememberIntro(blocked));
  assert.equal(hasSeenIntro(blocked, "theme=dark; core_welcome_seen=1; consent=necessary"), true);
  assert.equal(hasSeenIntro(null, "not_core_welcome_seen=1"), false);
  assert.equal(hasSeenIntro(null, "core_welcome_seen=10"), false);
  assert.equal(hasSeenIntro(blocked, ""), false);
});

test("the creator credit appears during the last four seconds of the actual video", () => {
  assert.equal(introCreditVisible(41.6, 45.7), false);
  assert.equal(introCreditVisible(41.7, 45.7), true);
  assert.equal(introCreditVisible(45.7, 45.7), true);
  assert.equal(introCreditVisible(0, 0), false);
  assert.equal(introCreditVisible(10, Infinity), false);
});

test("every friend gets exactly one name cue, in order, inside the video", () => {
  const slugs = INTRO_NAME_CUES.map((cue) => cue.slug);
  assert.deepEqual([...slugs].sort(), MEMBERS.map((member) => member.slug).sort());
  for (const [index, cue] of INTRO_NAME_CUES.entries()) {
    assert.ok(MEMBERS_BY_SLUG[cue.slug], `${cue.slug} is a member`);
    assert.ok(cue.at >= 0 && cue.until > cue.at && cue.until <= VIDEO_SECONDS, `${cue.slug} fits the video`);
    const next = INTRO_NAME_CUES[index + 1];
    if (next) assert.ok(cue.until <= next.at, `${cue.slug} leaves before ${next.slug} arrives`);
  }
  // Cards alternate edges so consecutive names never stack on one side.
  for (let index = 1; index < INTRO_NAME_CUES.length; index++) {
    assert.notEqual(INTRO_NAME_CUES[index]?.placement.split("-")[0], INTRO_NAME_CUES[index - 1]?.placement.split("-")[0]);
  }
});

test("name cues follow the video clock", () => {
  const [first, second] = INTRO_NAME_CUES;
  assert.ok(first && second);
  assert.equal(activeIntroCue(first.at - 0.1), null);
  assert.equal(activeIntroCue(first.at)?.slug, first.slug);
  assert.equal(activeIntroCue(second.at)?.slug, second.slug);
  assert.equal(introCueState(first, first.at - 0.1), "waiting");
  assert.equal(introCueState(first, first.at), "on");
  assert.equal(introCueState(first, first.until), "done");
  assert.equal(introCastRevealed(0), 0);
  assert.equal(introCastRevealed(second.at), 2);
  assert.equal(introCastRevealed(VIDEO_SECONDS), INTRO_NAME_CUES.length);
});

test("the boot percentage is a weighted view of the real preload and only completes when every part does", () => {
  const weights = Object.values(INTRO_PRELOAD_WEIGHTS).reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(weights - 1) < 1e-9);
  const none = { video: 0, decode: 0, shelves: 0, artwork: 0, portraits: 0 };
  assert.equal(introPreloadPercent(none), 0);
  assert.equal(introPreloadPercent({ ...none, video: 1 }), 55);
  assert.equal(introPreloadPercent({ video: 1, decode: 1, shelves: 1, artwork: 1, portraits: 0.99 }), 99);
  assert.equal(introPreloadPercent({ video: 1, decode: 1, shelves: 1, artwork: 1, portraits: 1 }), 100);
  assert.equal(introPreloadPercent({ video: 4, decode: Number.NaN, shelves: -1, artwork: 1, portraits: 1 }), 85);
});

test("sound is requested from the visitor's own begin press, with an honest muted fallback", () => {
  const begin = component.slice(component.indexOf("const begin = useCallback("), component.indexOf("}, [go, source]);"));
  assert.match(begin, /media\.muted = !withSound/);
  assert.match(begin, /playWithMutedFallback\(media/);
  assert.match(begin, /if \(withSound && media\.muted\) setSoundBlocked\(true\)/);
  assert.match(component, /onClick=\{\(\) => begin\(true\)\}/);
  assert.match(component, /soundBlocked \? <button[^>]*onClick=\{toggleSound\}/);
  // The prompted Enter press must never land on Skip.
  assert.match(component, /querySelector<HTMLElement>\("\[data-intro-focus\]"\)\?\.focus\(\)/);
});

test("the boot terminal reports real progress from the preload", () => {
  assert.match(preload, /response\.body\.getReader\(\)/);
  assert.match(preload, /onProgress\(loaded, Math\.max\(total, loaded\)\)/);
  assert.match(preload, /state\.shelves\.done \+= 1/);
  assert.match(component, /Preparing your CORE experience/);
  assert.match(component, /preloadIntroVideo\(controller\.signal, \(done, total\)/);
  assert.match(component, /prepareHomeForIntro\(controller\.signal, \(progress\)/);
});

test("Home's hero waits for the whole intro, including its closing transition", () => {
  assert.match(component, /export const useFirstVisitIntroActive/);
  assert.match(component, /const active = eligible && \(checking \|\| open\)/);
  assert.match(component, /setTimeout\(\(\) => setOpen\(false\), minimal \? LEAVE_MINIMAL_MS : LEAVE_MS\)/);
});
