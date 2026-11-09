import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import test from "node:test";
import * as React from "react";
import ts from "typescript";
import * as audio from "../lib/watch/preview-audio";

test("a saved sound preference cannot interrupt muted hover playback before a direct sound gesture", () => {
  const filename = resolve("components/watch/PreviewAudioControl.tsx");
  const nativeRequire = createRequire(filename);
  const slots: Array<{ value?: unknown; deps?: unknown[]; cleanup?: void | (() => void) }> = [];
  const effects: Array<() => void> = [];
  const messages: Array<{ func?: string }> = [];
  let cursor = 0, dirty = false, tree: unknown, active = true, timerId = 0;
  const browser = Object.assign(new EventTarget(), {
    setTimeout: () => ++timerId, clearTimeout() {},
  });
  const player = {
    current: null, previewSoundEnabled: true, previewVolume: 0.35,
    setPreviewSoundEnabled(value: boolean) { player.previewSoundEnabled = value; },
    claimPreviewAudio() {}, releasePreviewAudio() {},
  };
  const frameRef = { current: { contentWindow: { postMessage: (message: string) => messages.push(JSON.parse(message)) } } };
  const nativeRef = { current: null };
  const hooks = {
    ...React,
    useId: () => "hover-test",
    useState<T>(initial: T) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index]!.value, (update: T | ((value: T) => T)) => {
        const next = typeof update === "function" ? (update as (value: T) => T)(slots[index]!.value as T) : update;
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
        effects.push(() => { previous?.cleanup?.(); slots[index]!.cleanup = effect(); });
      }
    },
  };
  const loaded = { exports: {} as { PreviewAudioControl: (props: unknown) => unknown } };
  vm.runInNewContext(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, {
    module: loaded, exports: loaded.exports, window: browser,
    document: Object.assign(new EventTarget(), { visibilityState: "visible" }),
    CustomEvent, DOMException,
    require(name: string) {
      if (name === "react") return hooks;
      if (name === "@/components/providers/PlayerProvider") return { usePlayer: () => player };
      if (name === "@/hooks/useReducedMotion") return { useReducedMotion: () => true };
      if (name === "@/lib/watch/preview-audio") return audio;
      if (name === "@/components/base/tooltip/tooltip") return { Tooltip: () => null };
      return nativeRequire(name);
    },
  }, { filename });
  const render = () => {
    do {
      cursor = 0; dirty = false;
      tree = loaded.exports.PreviewAudioControl({ active, ready: true, native: false, youtube: true, nativeRef, frameRef });
      while (effects.length) effects.shift()!();
    } while (dirty);
  };
  type ButtonProps = { "aria-label"?: string; onClick?: (event: unknown) => void; children?: React.ReactNode };
  const button = (node: unknown): React.ReactElement<ButtonProps> | null => {
    if (Array.isArray(node)) return node.map(button).find(Boolean) ?? null;
    if (!React.isValidElement<ButtonProps>(node)) return null;
    return node.type === "button" ? node : button(node.props.children);
  };
  try {
    render();
    assert.equal(messages.some((message) => message.func === "unMute"), false);
    assert.match(button(tree)!.props["aria-label"]!, /^Unmute preview/);
    button(tree)!.props.onClick!({ preventDefault() {}, stopPropagation() {} });
    render();
    assert.equal(messages.some((message) => message.func === "unMute"), true);
    assert.equal(messages.some((message) => message.func === "playVideo"), true);
    active = false;
    render();
    assert.equal(messages.at(-1)?.func, "mute");
  } finally {
    for (const slot of slots) slot?.cleanup?.();
  }
});
