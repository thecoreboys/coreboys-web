import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
// @ts-expect-error explicit TS import used by the test runner
import { TRANSCRIPT_SCHEMA_SQL } from "../lib/media-intelligence/transcript-schema.ts";
// @ts-expect-error explicit TS import used by the test runner
import { parseTranscript, transcriptWindows, transcriptAnalysis } from "../lib/media-intelligence/transcript.ts";

const sample = "WEBVTT\n\n00:02:00.000 --> 00:02:05.000\n<v Marlon>Let's play Minecraft with friends.</v>\n\n00:02:06.000 --> 00:02:10.000\nBuild a house &amp; find diamonds.";
test("deployed transcript migration matches runtime bootstrap", () => {
  const sql = readFileSync(new URL("../scripts/migrations/050_reviewed_transcripts.sql", import.meta.url), "utf8");
  assert.equal(sql.replace(/\s+/g, " ").trim(), TRANSCRIPT_SCHEMA_SQL.replace(/\s+/g, " ").trim());
});
test("VTT evidence preserves real timestamps and cleans presentation tags", () => {
  const cues = parseTranscript(sample, 600);
  assert.equal(cues[0]!.startSeconds, 120);
  assert.equal(cues[1]!.text, "Build a house & find diamonds.");
  assert.doesNotMatch(cues[0]!.text, /<v/);
  assert.equal(transcriptWindows(cues).length, 1);
  assert.equal(transcriptWindows(cues)[0]!.endSeconds, 130);
});
test("SRT sequence numbers and comma timestamps are supported", () => {
  assert.deepEqual(parseTranscript("1\r\n00:01:02,500 --> 00:01:05,000\r\nA kitchen moment."), [
    { startSeconds: 62.5, endSeconds: 65, text: "A kitchen moment." },
  ]);
});
test("invalid, unbounded and untimed transcripts fail closed", () => {
  for (const input of ["A story without timestamps", "WEBVTT", "00:01:10.000 --> 00:01:00.000\nReversed", "00:75:00.000 --> 00:76:00.000\nInvalid", "x".repeat(1_000_001)]) {
    assert.throws(() => parseTranscript(input));
  }
  assert.throws(() => parseTranscript(sample, 30), /duration/);
  assert.throws(() => parseTranscript("00:01.000 --> 00:02.000\nOne\n\n00:00.000 --> 00:02.000\nOut of order"), /order/);
});
test("evidence windows never bridge long gaps or manufacture scene labels", async () => {
  const cues = parseTranscript(sample + "\n\n00:05:00.000 --> 00:05:10.000\nNow we are cooking in the kitchen.");
  const input = { importId: "reviewed", revisionId: "revision", assetKey: "youtube:one", title: "An evening together", language: "en", cues };
  const analysis = await transcriptAnalysis(input);
  assert.equal(analysis.segments.length, 2);
  assert.equal(analysis.segments[0]!.startSeconds, 120);
  assert.equal(analysis.segments[1]!.startSeconds, 300);
  assert.equal(analysis.segments[0]!.kind, "speech");
  assert.equal(analysis.segments[0]!.title, null);
  assert.equal(analysis.rawResult.paidCalls, 0);
  assert.equal(analysis.claim.id, (await transcriptAnalysis(input)).claim.id);
  assert.equal(analysis.embeddings[0]!.provider, "local");
});
