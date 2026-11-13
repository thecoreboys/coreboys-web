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

test("DJ Cora uses a bounded level meter driven by speech instead of crossing strands", () => {
  assert.match(director, /const rms = Math\.sqrt\(sum \/ samples\.length\)/);
  assert.match(director, /const level = clamp\(\(rms - 0\.012\) \* 16\)/);
  assert.match(director, /isSpeaking \? Math\.max\(voiceLevel, 0\.26\) : 0/);
  assert.match(director, /"--signal-level": reducedMotion \? 0 : signalLevel/);
  assert.match(director, /className=\{styles\.signalBar\}/);
  assert.doesNotMatch(director, /<Strands|components\/ui\/Strands/);
  assert.match(styles, /\.signalBar[^}]*scaleY\(calc\(1 \+ var\(--signal-level/);
});

test("phones get only the small DJ on/off button and Cora speaks whenever she is enabled", () => {
  const system = readFileSync(new URL("../components/watch/RadioAudioSystem.tsx", import.meta.url), "utf8");
  assert.match(system, /^\s*defaultExpanded\s*$/m);
  assert.match(director, /!autoCollapse && compactScreen \? <button/);
  assert.match(director, /onClick=\{blocked \? retry : toggleAudio\}/);
  assert.match(director, /widgetExpandedRef\.current \|\| compactScreenRef\.current/);
  assert.match(director, /data-voice=\{enabled && \(compactScreen \|\| widgetExpanded\) \? "on" : "off"\}/);
  assert.match(styles, /@media \(max-width: 767px\) \{\s*\.root \{ display: none; \}\s*\.voiceToggle \{ display: grid; \}/);
});

test("the viewer discretion advisory takes priority without waiting for DJ Cora", () => {
  const hero = readFileSync(new URL("../components/watch/NetworkChannelPage.tsx", import.meta.url), "utf8");
  const player = readFileSync(new URL("../components/watch/PersistentPlayer.tsx", import.meta.url), "utf8");
  for (const source of [hero, player]) {
    assert.doesNotMatch(source, /waitForNetworkTuningAudio\(\),/);
    assert.match(source, /if \(!needsAdvisory\)/);
    assert.match(source, /skipNetworkTuningAudio\(\)/);
  }
  assert.match(hero, /\{advisoryVisible \? \(/);
  assert.match(player, /contentAdvisoryVisible \? \(/);
});
