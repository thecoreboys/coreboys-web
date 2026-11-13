import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import test from "node:test";
import * as React from "react";
import ts from "typescript";
import * as audio from "../lib/watch/preview-audio";

type ButtonProps = { "aria-label"?: string; "aria-pressed"?: boolean; onClick?: (event: unknown) => void; children?: React.ReactNode };
function findButton(node: unknown): React.ReactElement<ButtonProps> | null {
  if (Array.isArray(node)) return node.map(findButton).find(Boolean) ?? null;
  if (!React.isValidElement<ButtonProps>(node)) return null;
  return node.type === "button" ? node : findButton(node.props.children);
}

function harness(source: "youtube" | "native" | "twitch", enabled = true) {
  const filename = resolve("components/watch/PreviewAudioControl.tsx");
  const nativeRequire = createRequire(filename);
  const slots: Array<{ value?: unknown; deps?: unknown[]; cleanup?: void | (() => void) }> = [];
  const effects: Array<() => void> = [];
  const timers = new Map<number, { at: number; callback: () => void; interval?: number }>();
  const messages: Array<{ func?: string }> = [];
  const claims: string[] = [], releases: string[] = [], plays: boolean[] = [];
  let cursor = 0, dirty = false, tree: unknown, active = true, ready = true, now = 0, timerId = 0, denySound = false;
  const browser = Object.assign(new EventTarget(), {
    setTimeout(callback: () => void, delay: number) { const id = ++timerId; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout(id: number) { timers.delete(id); },
    setInterval(callback: () => void, delay: number) { const id = ++timerId; timers.set(id, { at: now + delay, callback, interval: delay }); return id; },
    clearInterval(id: number) { timers.delete(id); },
  });
  const player = {
    current: null, previewSoundEnabled: enabled, previewVolume: .35,
    setPreviewSoundEnabled(value: boolean) { player.previewSoundEnabled = value; dirty = true; },
    claimPreviewAudio(id: string) { claims.push(id); }, releasePreviewAudio(id: string) { releases.push(id); },
  };
  const media = Object.assign(new EventTarget(), {
    muted: true, volume: 0, paused: false, ended: false, seeking: false, error: null,
    play() {
      plays.push(media.muted);
      if (!media.muted && media.volume > 0 && denySound) { media.paused = true; return Promise.reject(new DOMException("Sound gesture required", "NotAllowedError")); }
      media.paused = false; return Promise.resolve();
    },
  });
  const twitch = {
    muted: true, volume: 0, paused: false,
    setMuted(value: boolean) { twitch.muted = value; },
    setVolume(value: number) { twitch.volume = value; },
    getMuted: () => twitch.muted, isPaused: () => twitch.paused,
    play() { plays.push(twitch.muted); if (!twitch.muted && denySound) twitch.muted = true; twitch.paused = false; },
  };
  const nativeRef = { current: source === "native" ? media : null };
  const twitchRef = source === "twitch" ? { current: twitch } : undefined;
  const frameRef = { current: { contentWindow: { postMessage: (message: string) => messages.push(JSON.parse(message)) } } };
  const hooks = {
    ...React, useId: () => "hover-audio-test",
    useState<T>(initial: T) {
      const index = cursor++; slots[index] ??= { value: initial };
      return [slots[index]!.value, (update: T | ((value: T) => T)) => {
        const next = typeof update === "function" ? (update as (value: T) => T)(slots[index]!.value as T) : update;
        if (!Object.is(next, slots[index]!.value)) { slots[index]!.value = next; dirty = true; }
      }];
    },
    useRef<T>(initial: T) { const index = cursor++; slots[index] ??= { value: { current: initial } }; return slots[index]!.value; },
    useCallback<T>(callback: T, deps: unknown[]) {
      const index = cursor++;
      if (!slots[index] || deps.some((dep, i) => !Object.is(dep, slots[index]!.deps?.[i]))) slots[index] = { value: callback, deps };
      return slots[index]!.value;
    },
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
      const index = cursor++;
      if (!slots[index] || deps.some((dep, i) => !Object.is(dep, slots[index]!.deps?.[i]))) {
        const previous = slots[index]; slots[index] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[index]!.cleanup = effect(); });
      }
    },
  };
  const loaded = { exports: {} as { PreviewAudioControl: (props: unknown) => unknown } };
  vm.runInNewContext(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, {
    module: loaded, exports: loaded.exports, window: browser,
    document: Object.assign(new EventTarget(), { visibilityState: "visible" }), CustomEvent, DOMException,
    require(name: string) {
      if (name === "react") return hooks;
      if (name === "@/components/providers/PlayerProvider") return { usePlayer: () => player };
      if (name === "@/hooks/useReducedMotion") return { useReducedMotion: () => true };
      if (name === "@/lib/watch/preview-audio") return audio;
      if (name === "@/components/base/tooltip/tooltip") return { Tooltip: () => null };
      return nativeRequire(name);
    },
  }, { filename });
  function render() {
    do {
      cursor = 0; dirty = false;
      tree = loaded.exports.PreviewAudioControl({ active, ready, native: source === "native", youtube: source === "youtube", nativeRef, frameRef, twitchRef });
      while (effects.length) effects.shift()!();
    } while (dirty);
  }
  function advance(milliseconds: number) {
    const end = now + milliseconds;
    while (true) {
      const next = [...timers.entries()].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at;
      if (next[1].interval) next[1].at += next[1].interval; else timers.delete(next[0]);
      next[1].callback(); render();
    }
    now = end;
  }
  return {
    render, advance, media, twitch, player, messages, claims, releases, plays,
    button: () => findButton(tree)!,
    click() { findButton(tree)!.props.onClick!({ preventDefault() {}, stopPropagation() {} }); render(); },
    setActive(value: boolean) { active = value; render(); },
    setReady(value: boolean) { ready = value; render(); },
    deny(value: boolean) { denySound = value; },
    youtubeState(info: Record<string, unknown>) {
      browser.dispatchEvent(Object.assign(new Event("message"), { source: frameRef.current.contentWindow, data: { event: "infoDelivery", info } }));
      render();
    },
    claimOther() { browser.dispatchEvent(new CustomEvent(audio.PREVIEW_AUDIO_CLAIM_EVENT, { detail: { ownerId: "another-preview" } })); render(); },
    async settle() { await new Promise<void>(resolve => setImmediate(resolve)); render(); },
    dispose() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test("expanded YouTube previews request sound automatically and retain a working mute toggle", () => {
  const h = harness("youtube");
  try {
    h.render();
    assert.ok(h.messages.some(message => message.func === "unMute"));
    assert.match(h.button().props["aria-label"]!, /^Mute preview/);
    assert.equal(h.claims.length, 1);
    h.click();
    assert.equal(h.player.previewSoundEnabled, false);
    assert.equal(h.messages.at(-1)?.func, "mute");
    h.click();
    assert.equal(h.player.previewSoundEnabled, true);
    assert.ok(h.messages.some(message => message.func === "playVideo"));
    h.setActive(false);
    assert.equal(h.messages.at(-1)?.func, "mute");
  } finally { h.dispose(); }
});

test("YouTube confirms audible playback and recovers if the provider mutes it again", () => {
  const h = harness("youtube");
  try {
    h.render(); h.advance(0);
    h.youtubeState({ muted: false, volume: 35, playerState: 1 });
    assert.equal(h.button().props["aria-pressed"], true);
    h.youtubeState({ muted: true, volume: 35, playerState: 2 });
    assert.match(h.button().props["aria-label"]!, /browser requires a click/);
    assert.equal(h.releases.length, 1);
    assert.equal(h.messages.at(-1)?.func, "playVideo");
    h.setReady(false); h.setReady(true);
    assert.equal(h.claims.length, 1);
  } finally { h.dispose(); }
});

test("a saved mute preference stays quiet until explicitly enabled", () => {
  const h = harness("youtube", false);
  try {
    h.render();
    assert.equal(h.messages.some(message => message.func === "unMute"), false);
    assert.equal(h.claims.length, 0);
    h.click();
    assert.equal(h.player.previewSoundEnabled, true);
    assert.ok(h.messages.some(message => message.func === "unMute"));
  } finally { h.dispose(); }
});

test("blocked native sound resumes muted video without repeating the automatic attempt", async () => {
  const h = harness("native");
  try {
    h.deny(true); h.render(); await h.settle();
    assert.deepEqual(h.plays, [false, true]);
    assert.equal(h.media.muted, true);
    assert.equal(h.media.paused, false);
    assert.equal(h.claims.length, 1);
    assert.equal(h.releases.length, 1);
    assert.match(h.button().props["aria-label"]!, /browser requires a click/);
    h.setReady(false); h.setReady(true); await h.settle();
    assert.deepEqual(h.plays, [false, true]);
    h.deny(false); h.click(); await h.settle(); h.advance(0);
    assert.equal(h.media.muted, false);
    assert.equal(h.media.volume, .35);
    h.setActive(false);
    assert.equal(h.media.muted, true);
    assert.equal(h.media.volume, 0);
  } finally { h.dispose(); }
});

test("a delayed native autoplay pause resumes muted playback and reports the sound block", async () => {
  const h = harness("native");
  try {
    h.render(); await h.settle(); h.advance(0);
    assert.equal(h.media.muted, false);
    assert.equal(h.media.volume, .35);
    h.media.paused = true;
    h.media.dispatchEvent(new Event("pause"));
    await h.settle(); h.advance(0);
    assert.equal(h.media.muted, true);
    assert.equal(h.media.paused, false);
    assert.equal(h.media.volume, 0);
    assert.equal(h.claims.length, 1);
    assert.equal(h.releases.length, 1);
    assert.match(h.button().props["aria-label"]!, /browser requires a click/);
  } finally { h.dispose(); }
});

test("Twitch preview audio uses the SDK, confirms sound, and releases the lease on exit", () => {
  const h = harness("twitch");
  try {
    h.render(); h.advance(200);
    assert.equal(h.twitch.muted, false);
    assert.equal(h.twitch.volume, .35);
    assert.equal(h.button().props["aria-pressed"], true);
    assert.equal(h.claims.length, 1);
    h.setActive(false);
    assert.equal(h.twitch.muted, true);
    assert.equal(h.twitch.volume, 0);
    assert.equal(h.releases.length, 1);
  } finally { h.dispose(); }
});

test("blocked Twitch sound leaves muted playback running and allows a direct retry", () => {
  const h = harness("twitch");
  try {
    h.deny(true); h.render(); h.advance(1700);
    assert.equal(h.twitch.muted, true);
    assert.equal(h.twitch.paused, false);
    assert.equal(h.releases.length, 1);
    const attempts = h.plays.length;
    h.setReady(false); h.setReady(true); h.advance(2000);
    assert.equal(h.plays.length, attempts);
    h.deny(false); h.click(); h.advance(200);
    assert.equal(h.twitch.muted, false);
    assert.equal(h.button().props["aria-pressed"], true);
  } finally { h.dispose(); }
});

test("a different preview takes ownership without overlapping Twitch audio", () => {
  const h = harness("twitch");
  try {
    h.render(); h.advance(200); h.claimOther();
    assert.equal(h.twitch.muted, true);
    assert.equal(h.twitch.volume, 0);
    assert.equal(h.releases.length, 1);
    assert.equal(h.claims.length, 1);
  } finally { h.dispose(); }
});
