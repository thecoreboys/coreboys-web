import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import test from "node:test";
import * as React from "react";
import ts from "typescript";
import * as client from "../lib/radio-client";

// Exercise the mounted director's real request/skip handlers with a small hook
// host and fake audio, so silent requests cannot accidentally allocate media.
function mountDirector() {
  const filename = resolve("components/watch/RadioAudioDirector.tsx");
  const nativeRequire = createRequire(filename);
  const slots: Array<{ value?: unknown; deps?: unknown[]; cleanup?: void | (() => void) }> = [];
  const pending: Array<() => void> = [];
  const lifecycle: client.RadioCueLifecycleEvent[] = [];
  let cursor = 0;
  let dirty = false;
  let tree: unknown;
  let props = { autoCollapse: false };
  const browser = Object.assign(new EventTarget(), {
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    cancelAnimationFrame() {}, requestAnimationFrame: () => 1,
  });
  class AudioStub extends EventTarget {
    static created: AudioStub[] = [];
    preload = "";
    volume = 0;
    currentTime = 0;
    paused = true;
    constructor(public src: string) { super(); AudioStub.created.push(this); }
    async play() { this.paused = false; }
    pause() { this.paused = true; }
  }
  const hooks = {
    ...React,
    useState<T>(initial: T | (() => T)) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: typeof initial === "function" ? (initial as () => T)() : initial };
      return [slots[index]!.value, (update: T | ((previous: T) => T)) => {
        const next = typeof update === "function" ? (update as (previous: T) => T)(slots[index]!.value as T) : update;
        if (!Object.is(next, slots[index]!.value)) { slots[index]!.value = next; dirty = true; }
      }];
    },
    useRef<T>(initial: T) {
      const index = cursor++;
      slots[index] ??= { value: { current: initial } };
      return slots[index]!.value;
    },
    useCallback<T>(callback: T, deps: unknown[]) {
      const index = cursor++;
      if (!slots[index] || deps.some((dep, i) => !Object.is(dep, slots[index]!.deps?.[i]))) slots[index] = { value: callback, deps };
      return slots[index]!.value;
    },
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
      const index = cursor++;
      if (!slots[index] || deps.some((dep, i) => !Object.is(dep, slots[index]!.deps?.[i]))) {
        const previous = slots[index];
        slots[index] = { deps };
        pending.push(() => { previous?.cleanup?.(); slots[index]!.cleanup = effect(); });
      }
    },
  };
  const loaded = { exports: {} as { RadioAudioDirector: (options: typeof props) => unknown } };
  vm.runInNewContext(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, {
    module: loaded, exports: loaded.exports,
    window: browser,
    document: Object.assign(new EventTarget(), { body: {} }),
    Audio: AudioStub, CustomEvent, Date, performance,
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    require(name: string) {
      if (name === "react") return hooks;
      if (name === "react-dom") return { createPortal: (content: unknown) => content };
      if (name === "@/lib/radio-client") return { ...client, emitRadioCueLifecycle: (event: client.RadioCueLifecycleEvent) => lifecycle.push(event), setRadioAudioDirectorMounted() {} };
      if (name === "@/hooks/useReducedMotion") return { useReducedMotion: () => true };
      if (name === "@/components/providers/AuthProvider") return { useAuth: () => ({ user: null }) };
      if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
      if (name.startsWith("@/")) return new Proxy({}, { get: () => () => null });
      return nativeRequire(name);
    },
  }, { filename });
  function render() {
    do {
      dirty = false;
      cursor = 0;
      tree = loaded.exports.RadioAudioDirector(props);
      while (pending.length) pending.shift()!();
    } while (dirty);
  }
  type ToggleProps = { "aria-label"?: string; onClick?: () => void; children?: React.ReactNode };
  function findToggle(node: unknown): React.ReactElement<ToggleProps> | null {
    if (Array.isArray(node)) return node.map(findToggle).find(Boolean) ?? null;
    if (!React.isValidElement<ToggleProps>(node)) return null;
    if (["Show DJ Cora controls", "Close DJ Cora controls"].includes(node.props["aria-label"] ?? "")) return node;
    return findToggle(node.props.children);
  }
  render();
  return {
    lifecycle,
    audio: AudioStub.created,
    toggle() { findToggle(tree)!.props.onClick!(); render(); },
    autoCollapse(value: boolean) { props = { autoCollapse: value }; render(); },
    async request(id: string) {
      const result = await new Promise<client.RadioCueOutcome>((complete) => browser.dispatchEvent(new CustomEvent(client.RADIO_CUE_REQUEST_EVENT, {
        detail: { id, kind: "network_tune_in", audioUrl: "/audio/network-tunes/core-247.mp3", allowRepeat: true, resolve: complete },
      })));
      render();
      return result;
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test("collapsed DJ suppresses transition audio without creating or replaying it", async () => {
  const director = mountDirector();
  try {
    director.toggle();
    assert.equal((await director.request("collapsed-route")).reason, "widget_collapsed");
    assert.equal(director.audio.length, 0);
    director.toggle();
    assert.equal(director.audio.length, 0, "opening the dock must not replay skipped announcements");
    assert.equal((await director.request("expanded-route")).status, "started");
    assert.equal(director.audio.length, 1);
    assert.equal(director.audio[0]!.paused, false);
  } finally { director.unmount(); }
});

test("collapsing an active DJ stops the transition cue and auto-collapsed pages stay silent", async () => {
  const director = mountDirector();
  try {
    assert.equal((await director.request("playing-route")).status, "started");
    director.toggle();
    await Promise.resolve();
    assert.equal(director.audio[0]!.paused, true);
    assert.ok(director.lifecycle.some((event) => event.status === "skipped" && event.reason === "widget_collapsed"));
    director.toggle();
    director.autoCollapse(true);
    assert.equal((await director.request("hidden-route")).reason, "widget_collapsed");
    assert.equal(director.audio.length, 1);
  } finally { director.unmount(); }
});

test("a transition waiting for the previous cue to stop cannot start after collapse", async () => {
  const director = mountDirector();
  try {
    await director.request("first-route");
    const pendingSwitch = director.request("next-route");
    director.toggle();
    assert.equal((await pendingSwitch).reason, "widget_collapsed");
    assert.equal(director.audio.length, 1, "the pending transition must not allocate another player");
    assert.equal(director.audio[0]!.paused, true);
  } finally { director.unmount(); }
});
