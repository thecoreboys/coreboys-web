import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const director = readFileSync(new URL("../components/watch/RadioAudioDirector.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../components/watch/RadioAudioDirector.module.css", import.meta.url), "utf8");

test("DJ Cora is draggable and saves its placement", () => {
  assert.match(director, /core:radio-widget-placement:v1/);
  assert.match(director, /onPointerDown=\{startDragging\}/);
  assert.match(director, /onPointerMove=\{continueDragging\}/);
  assert.match(director, /saveWidgetPlacement\(next\)/);
  assert.match(styles, /cursor: grab/);
  assert.match(styles, /\.isDragging/);
});

test("dragging DJ Cora offscreen exposes an edge restore tab", () => {
  assert.match(director, /hiddenWidgetPlacement/);
  assert.match(director, /className=\{styles\.edgeRestore\}/);
  assert.match(director, /aria-label="Show DJ Cora"/);
  assert.match(styles, /\.edgeRestore\[data-edge="left"\]/);
  assert.match(styles, /\.edgeRestore\[data-edge="right"\]/);
  assert.match(styles, /\.edgeRestore\[data-edge="top"\]/);
  assert.match(styles, /\.edgeRestore\[data-edge="bottom"\]/);
});

test("the old FM badge and dedicated collapse control are removed", () => {
  assert.doesNotMatch(director, /87\.5 FM/);
  assert.match(director, />Stations<\/span>/);
  assert.doesNotMatch(director, /Release to tune/);
  assert.doesNotMatch(director, /collapseToggle/);
  assert.doesNotMatch(director, /isCollapsed/);
  assert.doesNotMatch(styles, /\.frequency/);
  assert.doesNotMatch(styles, /\.collapseToggle/);
  assert.doesNotMatch(styles, /\.isCollapsed/);
});

test("the channel dial commits one accessible selection to a new network", () => {
  assert.match(director, /lastCommittedTunerNetworkRef/);
  assert.match(director, /nextNetwork\.name === tunedNetwork/);
  assert.match(director, /onTuneNetwork\?\.\(nextNetwork\.slug\)/);
  assert.match(director, /onPointerUp=\{\(event\) => commitTuner/);
  assert.match(director, /onKeyUp=\{\(event\) =>/);
  assert.match(director, /onBlur=\{\(event\) => commitTuner/);
});

test("DJ Cora's signal strands move clearly while speaking, even without audio analysis", () => {
  assert.match(director, /const rms = Math\.sqrt\(sum \/ samples\.length\)/);
  assert.match(director, /const level = clamp\(\(rms - 0\.012\) \* 16\)/);
  assert.match(director, /isSpeaking \? Math\.max\(voiceLevel, 0\.26\) : 0/);
  assert.match(director, /speed=\{isSpeaking \? 0\.9 \+ signalLevel \* 2\.4 : 0\.13\}/);
  assert.match(director, /amplitude=\{isSpeaking \? 0\.85 \+ signalLevel \* 1\.8 : 0\.2\}/);
});
