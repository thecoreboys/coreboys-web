import { contentFingerprint } from "./fingerprint";
import { LocalEmbeddingProvider, embeddingSourceHash } from "./embedding";
import type { CompletedAnalysis, MediaSegmentRecord } from "./types";

export type TranscriptCue = { startSeconds: number; endSeconds: number; text: string };
export const MAX_TRANSCRIPT_BYTES = 1_000_000;

function timestamp(value: string): number {
  const match = /^(?:(\d{1,3}):)?([0-5]\d):([0-5]\d)[.,](\d{3})$/.exec(value);
  if (!match) throw new Error("Invalid caption timestamp. Use HH:MM:SS.mmm or MM:SS.mmm.");
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

/** Parse supplied caption text only. No URL fetching, scraping or model calls. */
export function parseTranscript(source: string, durationSeconds?: number | null): TranscriptCue[] {
  if (new TextEncoder().encode(source).length > MAX_TRANSCRIPT_BYTES) throw new Error("Captions must be smaller than 1 MB.");
  const blocks = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim().split(/\n[\t ]*\n/);
  const cues: TranscriptCue[] = [];
  for (const block of blocks) {
    if (/^(WEBVTT(?:\s|$)|NOTE(?:\s|$)|STYLE(?:\s|$)|REGION(?:\s|$))/.test(block)) continue;
    const lines = block.split("\n");
    const index = lines.findIndex((line) => line.includes("-->"));
    if (index < 0) throw new Error("A caption block is missing its timestamp range.");
    const timing = /^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/.exec(lines[index]!.trim());
    if (!timing) throw new Error("Invalid caption timestamp range.");
    const startSeconds = timestamp(timing[1]!);
    const endSeconds = timestamp(timing[2]!);
    if (endSeconds <= startSeconds || endSeconds > 86400 || (durationSeconds && endSeconds > durationSeconds + 2)) {
      throw new Error("Caption timing is outside this video's duration or is reversed.");
    }
    const text = lines.slice(index + 1).join(" ")
      .replace(/<[^>]*>/g, "").replace(/&(?:amp|lt|gt|nbsp|quot|apos);/g, (entity) => ({
        "&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": " ", "&quot;": '"', "&apos;": "'",
      }[entity]!)).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    if (!text || text.length > 4000) throw new Error("Each caption needs text, limited to 4,000 characters.");
    if (cues.length && startSeconds < cues[cues.length - 1]!.startSeconds) throw new Error("Caption timestamps must be in order.");
    cues.push({ startSeconds, endSeconds, text });
    if (cues.length > 5000) throw new Error("Use a transcript with no more than 5,000 cues.");
  }
  if (!cues.length) throw new Error("No timed captions were found. Supply a WebVTT or SRT transcript.");
  return cues;
}

/** Bounded evidence windows preserve real source timings; no scene names are invented. */
export function transcriptWindows(cues: readonly TranscriptCue[]): TranscriptCue[] {
  const windows: TranscriptCue[] = [];
  for (const cue of cues) {
    const previous = windows[windows.length - 1];
    if (previous && cue.startSeconds - previous.endSeconds <= 3
      && cue.endSeconds - previous.startSeconds <= 30 && previous.text.length + cue.text.length <= 1200) {
      if (!previous.text.endsWith(cue.text)) previous.text += ` ${cue.text}`;
      previous.endSeconds = Math.max(previous.endSeconds, cue.endSeconds);
    } else windows.push({ ...cue });
  }
  return windows;
}

export async function transcriptAnalysis(input: {
  importId: string; revisionId: string; assetKey: string; title: string;
  language: string; cues: TranscriptCue[];
}): Promise<CompletedAnalysis> {
  const inputHash = contentFingerprint({ cues: input.cues, language: input.language });
  const runId = contentFingerprint({ transcript: input.importId, version: 1, inputHash });
  const provider = new LocalEmbeddingProvider();
  const segments: MediaSegmentRecord[] = transcriptWindows(input.cues).map((cue, sequence) => ({
    id: contentFingerprint({ runId, sequence }), revisionId: input.revisionId, ownerRunId: runId,
    stage: "transcript", sequence, kind: "speech", startSeconds: cue.startSeconds, endSeconds: cue.endSeconds,
    title: null, text: cue.text, searchDocument: `${input.title} · ${cue.text}`, evidence: cue.text,
    metadata: { evidenceType: "reviewed-transcript", language: input.language, importId: input.importId },
  }));
  return {
    assetKey: input.assetKey,
    claim: { id: runId, revisionId: input.revisionId, analyzer: "core-reviewed-transcript", analyzerVersion: "1",
      inputHash, stage: "transcript", idempotencyKey: runId, policyVersion: "per-asset-reviewed-v1" },
    segments, tags: [], aliases: [], artifacts: [],
    embeddings: await Promise.all(segments.map(async (segment) => {
      const vector = await provider.embed(segment.searchDocument);
      return { revisionId: input.revisionId, segmentId: segment.id, ownerRunId: runId,
        provider: provider.name, model: provider.model, dimensions: provider.dimensions,
        sourceHash: embeddingSourceHash(segment.searchDocument), vector, vectorNorm: 1 };
    })),
    rawResult: { mode: "reviewed-transcript", importId: input.importId, segmentCount: segments.length, paidCalls: 0 },
  };
}
