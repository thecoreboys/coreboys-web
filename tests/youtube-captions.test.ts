import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error explicit TS imports used by the test runner
import { youtubeCaptionsToVtt } from "../lib/media-intelligence/youtube-captions.ts";
// @ts-expect-error explicit TS imports used by the test runner
import { parseTranscript } from "../lib/media-intelligence/transcript.ts";

test("YouTube JSON3 uses real event times without duplicated roll-up lines", () => {
  const result = parseTranscript(youtubeCaptionsToVtt(JSON.stringify({ events: [
    { tStartMs: 0, id: 1 },
    { tStartMs: 120000, dDurationMs: 2500, segs: [{ utf8: "Welcome" }, { utf8: " to school." }] },
    { tStartMs: 122499, dDurationMs: 1, aAppend: 1, segs: [{ utf8: "\n" }] },
    { tStartMs: 122500, dDurationMs: 2500, segs: [{ utf8: "Let's begin." }] },
  ] })));
  assert.equal(result.length, 2);
  assert.equal(result[0]!.startSeconds, 120);
  assert.equal(result[0]!.endSeconds, 122.5);
  assert.equal(result[1]!.text, "Let's begin.");
});

test("caption conversion preserves genuine repeated speech and literal angle brackets", () => {
  const cues = parseTranscript(youtubeCaptionsToVtt(JSON.stringify({ events: [
    { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "No!" }] },
    { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: "No!" }] },
    { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: "A < B & C" }] },
  ] })));
  assert.deepEqual(cues.map((cue) => cue.text), ["No!", "No!", "A < B & C"]);
});

test("malformed or excessive caption artifacts fail closed", () => {
  for (const events of [null, [{}], [{ segs: [{ utf8: "Text" }], tStartMs: -1, dDurationMs: 1 }],
    [{ segs: [{ utf8: 5 }], tStartMs: 0, dDurationMs: 1 }],
    [{ segs: [{ utf8: "Text" }], tStartMs: 0, dDurationMs: 90000000 }]]) {
    assert.throws(() => youtubeCaptionsToVtt(JSON.stringify({ events })));
  }
  assert.throws(() => youtubeCaptionsToVtt("x".repeat(4_000_001)), /4 MB/);
});
