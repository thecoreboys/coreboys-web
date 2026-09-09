import { parseTranscript, type TranscriptCue } from "./transcript";

/** Original JSON3 events avoid the duplicate rolling lines in YouTube's VTT. */
export function youtubeCaptionsToVtt(source: string): string {
  if (new TextEncoder().encode(source).length > 4_000_000) throw new Error("Caption artifact exceeds 4 MB.");
  const data = JSON.parse(source) as { events?: unknown };
  if (!Array.isArray(data?.events) || data.events.length > 20_000) throw new Error("Invalid caption events.");
  const cues: TranscriptCue[] = [];
  for (const raw of data.events) {
    if (!raw || typeof raw !== "object") throw new Error("Invalid caption event.");
    const event = raw as { segs?: Array<{ utf8?: unknown }>; tStartMs?: unknown; dDurationMs?: unknown };
    if (!event.segs) continue; // Window-position/style event, not speech.
    if (!Array.isArray(event.segs) || event.segs.length > 2000) throw new Error("Invalid caption segments.");
    const text = event.segs.map((segment) => {
      if (!segment || typeof segment.utf8 !== "string") throw new Error("Invalid caption text.");
      return segment.utf8;
    }).join("").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    if (!text) continue; // Roll-up newline event, not repeated dialogue.
    if (!Number.isSafeInteger(event.tStartMs) || !Number.isSafeInteger(event.dDurationMs)
      || Number(event.tStartMs) < 0 || Number(event.dDurationMs) <= 0) throw new Error("Invalid caption timing.");
    cues.push({ startSeconds: Number(event.tStartMs) / 1000,
      endSeconds: (Number(event.tStartMs) + Number(event.dDurationMs)) / 1000, text });
    if (cues.length > 5000) throw new Error("Caption artifact exceeds 5,000 speech cues.");
  }
  const stamp = (seconds: number) => {
    const ms = Math.round(seconds * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
  };
  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const vtt = `WEBVTT\n\n${cues.map((cue) => `${stamp(cue.startSeconds)} --> ${stamp(cue.endSeconds)}\n${escape(cue.text)}`).join("\n\n")}`;
  parseTranscript(vtt); // Reuse the importer's byte, ordering and time bounds.
  return vtt;
}
