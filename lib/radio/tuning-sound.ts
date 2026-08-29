/**
 * A very small, local-only sound bed for a network tune-in.
 *
 * This intentionally contains no asset fetch, provider call, or generated
 * speech. It uses one short Web Audio sequence only while a viewer is already
 * navigating to a network, so browser audio permission is still tied to that
 * explicit gesture. Station-audio preferences remain the single mute control
 * for both DJ Cora's recorded IDs and this optional tuning texture.
 */

export type RadioTuningSoundOptions = {
  enabled?: boolean;
  volume?: number;
  /** Mute supplied by a host surface, when one is available. */
  muted?: boolean;
  /** Treat data saver as a request for the quietest possible transition. */
  dataSaver?: boolean;
  /** Audio description takes precedence over non-essential station texture. */
  suppressed?: boolean;
  /** Respect the same preference that removes the accompanying transition motion. */
  reducedMotion?: boolean;
};

export type RadioTuningSoundHandle = {
  stop: () => void;
};

const MAX_MASTER_GAIN = 0.014;
const SEQUENCE_SECONDS = 0.76;

let sharedContext: AudioContext | null = null;
let activeSound: RadioTuningSoundHandle | null = null;
let lastTunerTickAt = 0;

export function stopActiveRadioTuningSound() {
  activeSound?.stop();
}

function clamp(value: number, lower = 0, upper = 1) {
  return Math.min(upper, Math.max(lower, value));
}

function inBrowser() {
  return typeof window !== "undefined";
}

function systemPrefersReducedMotion() {
  return inBrowser()
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Exported separately to keep the sound policy easy to test without Web Audio. */
export function isRadioTuningSoundAllowed(options: RadioTuningSoundOptions = {}) {
  const volume = typeof options.volume === "number" ? clamp(options.volume) : 1;
  return options.enabled !== false
    && !options.muted
    && !options.dataSaver
    && !options.suppressed
    && !options.reducedMotion
    && volume > 0;
}

function getAudioContext() {
  if (!inBrowser()) return null;
  if (sharedContext && sharedContext.state !== "closed") return sharedContext;
  const AudioContextConstructor = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  sharedContext = new AudioContextConstructor();
  return sharedContext;
}

function createSoftNoise(context: AudioContext, seconds: number) {
  const length = Math.max(1, Math.ceil(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const channel = buffer.getChannelData(0);
  let previous = 0;
  for (let index = 0; index < channel.length; index += 1) {
    // A simple low-pass random walk avoids sharp broadband static.
    previous = (previous * 0.91) + ((Math.random() * 2 - 1) * 0.09);
    channel[index] = previous;
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  return source;
}

/**
 * Plays a soft, less-than-one-second radio sweep. Call this synchronously from
 * a click/keyboard navigation path; a browser that still refuses audio simply
 * produces no effect and does not block the route transition.
 */
export function playRadioTuningSound(options: RadioTuningSoundOptions = {}): RadioTuningSoundHandle | null {
  const reducedMotion = options.reducedMotion ?? systemPrefersReducedMotion();
  if (!inBrowser() || document.visibilityState === "hidden" || !isRadioTuningSoundAllowed({ ...options, reducedMotion })) {
    return null;
  }

  try {
    activeSound?.stop();
    const context = getAudioContext();
    if (!context) return null;

    // This is deliberately invoked before any promise boundary. In supported
    // browsers it preserves the navigation click's user-activation grant.
    if (context.state === "suspended") void context.resume().catch(() => {});

    const now = context.currentTime;
    const master = context.createGain();
    const volume = typeof options.volume === "number" ? clamp(options.volume) : 1;
    const peak = Math.max(0.0001, MAX_MASTER_GAIN * volume);
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(peak, now + 0.035);
    master.gain.setValueAtTime(peak * 0.82, now + 0.38);
    master.gain.exponentialRampToValueAtTime(0.0001, now + SEQUENCE_SECONDS);
    master.connect(context.destination);

    const sources: AudioScheduledSourceNode[] = [];
    const tone = context.createOscillator();
    const toneGain = context.createGain();
    tone.type = "sine";
    tone.frequency.setValueAtTime(310, now);
    tone.frequency.exponentialRampToValueAtTime(590, now + 0.32);
    tone.frequency.exponentialRampToValueAtTime(470, now + 0.58);
    toneGain.gain.setValueAtTime(0.0001, now);
    toneGain.gain.exponentialRampToValueAtTime(0.68, now + 0.05);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);
    tone.connect(toneGain).connect(master);
    tone.start(now);
    tone.stop(now + 0.64);
    sources.push(tone);

    const noise = createSoftNoise(context, 0.42);
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(1_280, now);
    noiseFilter.Q.setValueAtTime(0.72, now);
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.16, now + 0.045);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
    noise.connect(noiseFilter).connect(noiseGain).connect(master);
    noise.start(now);
    noise.stop(now + 0.4);
    sources.push(noise);

    const chime = context.createOscillator();
    const chimeGain = context.createGain();
    chime.type = "triangle";
    chime.frequency.setValueAtTime(700, now + 0.43);
    chime.frequency.exponentialRampToValueAtTime(830, now + 0.66);
    chimeGain.gain.setValueAtTime(0.0001, now);
    chimeGain.gain.setValueAtTime(0.0001, now + 0.41);
    chimeGain.gain.exponentialRampToValueAtTime(0.46, now + 0.47);
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.73);
    chime.connect(chimeGain).connect(master);
    chime.start(now + 0.4);
    chime.stop(now + 0.74);
    sources.push(chime);

    let stopped = false;
    let cleanupTimer: number | null = null;
    let handle: RadioTuningSoundHandle | null = null;
    const cleanup = () => {
      if (cleanupTimer !== null) window.clearTimeout(cleanupTimer);
      cleanupTimer = null;
      master.disconnect();
      if (activeSound === handle) activeSound = null;
    };
    const stop = () => {
      if (stopped) return;
      stopped = true;
      const stopAt = context.currentTime + 0.07;
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), context.currentTime);
      master.gain.exponentialRampToValueAtTime(0.0001, stopAt);
      for (const source of sources) {
        try {
          source.stop(stopAt);
        } catch {
          // A source may have naturally ended before a quick navigation.
        }
      }
      cleanupTimer = window.setTimeout(cleanup, 100);
    };
    handle = { stop };
    activeSound = handle;
    cleanupTimer = window.setTimeout(cleanup, Math.ceil((SEQUENCE_SECONDS + 0.12) * 1_000));
    return handle;
  } catch {
    // Web Audio is decorative. Refusing it must never delay the actual tune-in.
    return null;
  }
}

/** A quiet mechanical tick used only while a listener physically moves the on-screen dial. */
export function playRadioTunerTick(options: RadioTuningSoundOptions = {}) {
  const reducedMotion = options.reducedMotion ?? systemPrefersReducedMotion();
  if (!isRadioTuningSoundAllowed({ ...options, reducedMotion })) return;
  const nowMs = Date.now();
  if (nowMs - lastTunerTickAt < 42) return;
  lastTunerTickAt = nowMs;
  try {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === "suspended") void context.resume().catch(() => {});
    const startedAt = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, startedAt);
    gain.gain.exponentialRampToValueAtTime(0.008, startedAt + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.035);
    const oscillator = context.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(1_050, startedAt);
    oscillator.frequency.exponentialRampToValueAtTime(760, startedAt + 0.03);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(startedAt);
    oscillator.stop(startedAt + 0.04);
  } catch {
    // A dial remains fully usable when Web Audio is unavailable.
  }
}
