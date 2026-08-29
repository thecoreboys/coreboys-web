/**
 * DJ Cora's approved ElevenLabs voice reference.
 *
 * This is deliberately a production-workflow setting, not a browser TTS
 * integration. Cues remain rendered, reviewed, and uploaded as static audio
 * before they can be served by the radio catalog, so opening a network can
 * never make a per-listener provider request.
 */
export const DEFAULT_DJ_CORA_ELEVENLABS_VOICE_ID = "st7NwhTPEzqo2riw7qWC";

export function getDjCoraElevenLabsVoiceId() {
  const configured = process.env.ELEVENLABS_DJ_CORA_VOICE_ID?.trim();
  return configured || DEFAULT_DJ_CORA_ELEVENLABS_VOICE_ID;
}

