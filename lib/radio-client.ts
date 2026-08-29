/**
 * Client-only primitives for the DJ Cora playback layer.
 *
 * This module deliberately contains no text generation, TTS, provider, or
 * network calls. A caller may only ask the mounted director to play an
 * already-approved audio asset supplied in the request.
 */

export const RADIO_CUE_REQUEST_EVENT = "core-radio-request";
export const RADIO_CUE_SKIP_EVENT = "core-radio-skip";
export const RADIO_CUE_LIFECYCLE_EVENT = "core-radio-lifecycle";
export const RADIO_NETWORK_LIVE_TAKEOVER_EVENT = "core:watch-network-live-takeover";
export const RADIO_USER_GESTURE_EVENT = "core-radio-user-gesture";

export type RadioCueKind =
  | "network_tune_in"
  /** Catalog compatibility alias; direct client requests should use `network_tune_in`. */
  | "tune_in"
  | "live_takeover"
  | "intermission"
  | "outro"
  | "station_id";

export type RadioCuePriority = number;

export type RadioCue = {
  /** Stable catalog ID. This is never generated in the browser. */
  id: string;
  kind: RadioCueKind;
  /** A local or approved CDN asset. `data:` and executable URLs are rejected. */
  audioUrl: string;
  /** Human-reviewed transcript used for visible captions. */
  transcript?: string | null;
  /** Optional shorter display caption. */
  caption?: string | null;
  title?: string | null;
  networkSlug?: string | null;
  creatorName?: string | null;
  creatorSlug?: string | null;
  sourceContentId?: string | null;
  priority?: RadioCuePriority | null;
  volume?: number | null;
  cooldownMs?: number | null;
};

export type RadioCueRequest = Omit<Partial<RadioCue>, "id" | "kind" | "audioUrl"> & {
  /** Accepted for callers which already have a catalog record. */
  cue?: RadioCue;
  /** `id` is optional for immediate static assets; a stable fallback is made from the URL. */
  id?: string;
  cueId?: string;
  kind: RadioCueKind;
  audioUrl: string;
  networkSlug?: string | null;
  creatorName?: string | null;
  creatorSlug?: string | null;
  /** Stable live/video ID. Live-takeover requests are deduped by this per session. */
  sourceContentId?: string | null;
  priority?: RadioCuePriority | null;
  /** Do not begin background voice audio until a visitor has interacted. */
  requiresUserGesture?: boolean;
  /** Allows an integration to explicitly opt out of live-feed-adjacent cues. */
  allowWhenLive?: boolean;
  /** Hard guard: a live takeover must never interrupt a viewer's active live stream. */
  viewerIsWatchingLive?: boolean;
  /** Attempts lower priority than an active cue are dropped unless this is true. */
  queueIfBusy?: boolean;
  /** Lets the caller use the only approved variant again when there is no alternative. */
  allowRepeat?: boolean;
  /** Override the default repeat key, e.g. network + cue family. */
  historyKey?: string;
  /** Default 6 hours. Set to 0 to only apply session dedupe. */
  noRepeatWindowMs?: number;
  /** Requester label for telemetry/debugging only. */
  reason?: string;
};

export type RadioCueStatus =
  | "started"
  | "queued"
  | "finished"
  | "skipped"
  | "interrupted"
  | "suppressed"
  | "autoplay_blocked"
  | "unavailable"
  | "invalid";

export type RadioCueOutcome = {
  status: RadioCueStatus;
  cueId: string | null;
  kind?: RadioCueKind;
  reason?: string;
};

export type RadioCueLifecycleEvent = RadioCueOutcome & {
  at: number;
  networkSlug?: string | null;
  creatorSlug?: string | null;
  sourceContentId?: string | null;
};

export type RadioCueHistoryEntry = {
  id: string;
  key: string;
  at: number;
};

export type RadioCueSelection<T extends RadioCue = RadioCue> = {
  cue: T;
  /** True when every approved alternative was recently used. */
  repeated: boolean;
};

export type RadioCueSelectionOptions = {
  historyKey?: string;
  now?: number;
  noRepeatWindowMs?: number;
  random?: () => number;
};

/**
 * The network page can emit this lightweight event whenever 24/7 programming
 * is preempted by a live stream. It intentionally contains no generated copy
 * or remote source. The director can only play it when a matching approved
 * cue is available in its catalog (or when `audioUrl` is explicitly supplied).
 */
export type RadioNetworkLiveTakeoverEvent = {
  networkSlug: string;
  sourceContentId: string;
  creatorName?: string | null;
  creatorSlug?: string | null;
  title?: string | null;
  previous?: { id?: string | null; kind?: string | null; title?: string | null } | null;
  viewerIsWatchingLive?: boolean;
  allowWhenLive?: boolean;
  /** Optional immediate, preapproved asset for installations without a catalog resolver. */
  audioUrl?: string | null;
  cue?: RadioCue | null;
  priority?: number | null;
  transcript?: string | null;
  caption?: string | null;
};

/** Accepted nested payload emitted by `lib/watch/live-takeover`. */
export type RadioNetworkLiveTakeoverPayload = RadioNetworkLiveTakeoverEvent | {
  id?: string;
  network?: { slug?: string | null; name?: string | null; href?: string | null } | null;
  live?: {
    sourceId?: string | null;
    creatorName?: string | null;
    creatorSlug?: string | null;
    title?: string | null;
  } | null;
  previous?: { id?: string | null; itemId?: string | null; kind?: string | null; title?: string | null } | null;
  policy?: {
    viewerIsWatchingLive?: boolean;
    allowWhenLive?: boolean;
    shouldAnnounce?: boolean;
  } | null;
  viewer?: {
    wasWatchingLive?: boolean;
    activePlayback?: { isLive?: boolean } | null;
  } | null;
};

type RadioCueRequestDetail = RadioCueRequest & {
  resolve?: (outcome: RadioCueOutcome) => void;
};

const STORAGE_VERSION = 1;
const SESSION_HISTORY_KEY = "core:radio-cora:session-history:v1";
const LOCAL_HISTORY_KEY = "core:radio-cora:local-history:v1";
const MAX_HISTORY = 48;
const DEFAULT_NO_REPEAT_WINDOW_MS = 6 * 60 * 60 * 1_000;
const DEFAULT_PRIORITIES: Record<RadioCueKind, number> = {
  network_tune_in: 70,
  tune_in: 70,
  live_takeover: 50,
  intermission: 40,
  outro: 35,
  station_id: 20,
};

let directorMounted = false;

function inBrowser() {
  return typeof window !== "undefined";
}

function storage(scope: "session" | "local"): Storage | null {
  if (!inBrowser()) return null;
  try {
    return scope === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function storageKey(scope: "session" | "local") {
  return scope === "session" ? SESSION_HISTORY_KEY : LOCAL_HISTORY_KEY;
}

function parseHistory(value: string | null): RadioCueHistoryEntry[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return [];
    const record = parsed as { version?: unknown; entries?: unknown };
    if (record.version !== STORAGE_VERSION || !Array.isArray(record.entries)) return [];
    return record.entries.flatMap((entry): RadioCueHistoryEntry[] => {
      if (!entry || typeof entry !== "object") return [];
      const candidate = entry as Partial<RadioCueHistoryEntry>;
      return typeof candidate.id === "string"
        && typeof candidate.key === "string"
        && typeof candidate.at === "number"
        && Number.isFinite(candidate.at)
        ? [{ id: candidate.id, key: candidate.key, at: candidate.at }]
        : [];
    }).slice(-MAX_HISTORY);
  } catch {
    return [];
  }
}

function writeHistory(scope: "session" | "local", entries: RadioCueHistoryEntry[]) {
  const target = storage(scope);
  if (!target) return;
  try {
    target.setItem(storageKey(scope), JSON.stringify({ version: STORAGE_VERSION, entries: entries.slice(-MAX_HISTORY) }));
  } catch {
    // Storage can be disabled in private or quota-constrained contexts. The
    // director still has its in-memory request dedupe in that case.
  }
}

export function radioCueHistoryKey(cue: Pick<RadioCue, "kind" | "networkSlug">, override?: string) {
  return override?.trim() || `${cue.kind}:${cue.networkSlug?.trim() || "global"}`;
}

export function radioCuePriority(cue: Pick<RadioCue, "kind" | "priority">) {
  const explicit = cue.priority;
  return typeof explicit === "number" && Number.isFinite(explicit)
    ? explicit
    : DEFAULT_PRIORITIES[cue.kind];
}

export function isApprovedRadioAudioUrl(value: string | null | undefined) {
  if (!value?.trim()) return false;
  const source = value.trim();
  if (source.startsWith("/")) return true;
  try {
    const url = new URL(source);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function stableCueId(request: Pick<RadioCueRequest, "id" | "cueId" | "audioUrl" | "kind">) {
  const explicit = request.id?.trim() || request.cueId?.trim();
  if (explicit) return explicit;
  // The URL is only used for in-browser de-duplication of a caller-provided
  // static asset. It never becomes a remote lookup or generated identifier.
  return `${request.kind}:${request.audioUrl.trim()}`;
}

export function normalizeRadioCueRequest(request: RadioCueRequest): RadioCueRequest & { id: string; cue: RadioCue } {
  const base = request.cue;
  const kind = request.kind ?? base?.kind;
  const audioUrl = request.audioUrl ?? base?.audioUrl;
  const id = stableCueId({ id: request.id ?? base?.id, cueId: request.cueId, kind, audioUrl });
  const cue: RadioCue = {
    id,
    kind,
    audioUrl,
    transcript: request.transcript ?? base?.transcript ?? null,
    caption: request.caption ?? base?.caption ?? null,
    title: request.title ?? base?.title ?? null,
    networkSlug: request.networkSlug ?? base?.networkSlug ?? null,
    creatorName: request.creatorName ?? base?.creatorName ?? null,
    creatorSlug: request.creatorSlug ?? base?.creatorSlug ?? null,
    sourceContentId: request.sourceContentId ?? base?.sourceContentId ?? null,
    priority: request.priority ?? base?.priority ?? null,
    volume: request.volume ?? base?.volume ?? null,
    cooldownMs: request.cooldownMs ?? base?.cooldownMs ?? null,
  };
  return { ...request, id, kind, audioUrl, cue };
}

/**
 * Handles both the flat client event contract and the nested 24/7 takeover
 * event emitted by the network player. The latter has no audio by design;
 * callers must resolve an already-approved asset from their local catalog.
 */
export function normalizeRadioNetworkLiveTakeoverEvent(value: unknown): RadioNetworkLiveTakeoverEvent | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const asString = (candidate: unknown): string | null => typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
  const asBoolean = (candidate: unknown): boolean | undefined => typeof candidate === "boolean" ? candidate : undefined;
  const networkRecord = raw.network && typeof raw.network === "object" ? raw.network as Record<string, unknown> : null;
  const liveRecord = raw.live && typeof raw.live === "object" ? raw.live as Record<string, unknown> : null;
  const policyRecord = raw.policy && typeof raw.policy === "object" ? raw.policy as Record<string, unknown> : null;
  const previousRecord = raw.previous && typeof raw.previous === "object" ? raw.previous as Record<string, unknown> : null;
  const viewerRecord = raw.viewer && typeof raw.viewer === "object" ? raw.viewer as Record<string, unknown> : null;
  const activePlaybackRecord = viewerRecord?.activePlayback && typeof viewerRecord.activePlayback === "object"
    ? viewerRecord.activePlayback as Record<string, unknown>
    : null;
  const networkSlug = asString(raw.networkSlug) ?? asString(networkRecord?.slug);
  const sourceContentId = asString(raw.sourceContentId) ?? asString(liveRecord?.sourceId);
  if (!networkSlug || !sourceContentId) return null;
  const previousKind = asString(previousRecord?.kind);
  const directCue = raw.cue && typeof raw.cue === "object" ? raw.cue as RadioCue : null;
  const viewerStates = [
    asBoolean(raw.viewerIsWatchingLive),
    asBoolean(policyRecord?.viewerIsWatchingLive),
    asBoolean(viewerRecord?.wasWatchingLive),
    asBoolean(activePlaybackRecord?.isLive),
  ];
  return {
    networkSlug,
    sourceContentId,
    creatorName: asString(raw.creatorName) ?? asString(liveRecord?.creatorName),
    creatorSlug: asString(raw.creatorSlug) ?? asString(liveRecord?.creatorSlug),
    title: asString(raw.title) ?? asString(liveRecord?.title),
    previous: previousRecord ? {
      id: asString(previousRecord.id) ?? asString(previousRecord.itemId),
      kind: previousKind,
      title: asString(previousRecord.title),
    } : null,
    // Any affirmative active-live signal wins. `policy.suppressWhileViewerOnLive`
    // is intentionally not read here: it describes the rule, not the viewer.
    viewerIsWatchingLive: viewerStates.includes(true) ? true : (viewerStates.includes(false) ? false : undefined),
    allowWhenLive: asBoolean(raw.allowWhenLive) ?? asBoolean(policyRecord?.allowWhenLive) ?? (asBoolean(policyRecord?.shouldAnnounce) === false ? false : undefined),
    audioUrl: asString(raw.audioUrl),
    cue: directCue,
    priority: typeof raw.priority === "number" && Number.isFinite(raw.priority) ? raw.priority : null,
    transcript: asString(raw.transcript),
    caption: asString(raw.caption),
  };
}

export function getRadioCueHistory(scope: "session" | "local" | "both" = "both") {
  const scopes = scope === "both" ? (["session", "local"] as const) : [scope] as const;
  const latest = new Map<string, RadioCueHistoryEntry>();
  for (const entry of scopes.flatMap((entryScope) => parseHistory(storage(entryScope)?.getItem(storageKey(entryScope)) ?? null))) {
    const key = `${entry.key}:${entry.id}`;
    if ((latest.get(key)?.at ?? -Infinity) < entry.at) latest.set(key, entry);
  }
  return [...latest.values()].sort((left, right) => left.at - right.at);
}

export function rememberRadioCue(cue: Pick<RadioCue, "id" | "kind" | "networkSlug">, options: { historyKey?: string; now?: number } = {}) {
  const entry: RadioCueHistoryEntry = {
    id: cue.id,
    key: radioCueHistoryKey(cue, options.historyKey),
    at: options.now ?? Date.now(),
  };
  rememberRadioCueEntry(entry, "both");
}

export function rememberRadioCueEntry(entry: RadioCueHistoryEntry, scope: "session" | "local" | "both" = "both") {
  const scopes = scope === "both" ? (["session", "local"] as const) : [scope] as const;
  for (const entryScope of scopes) {
    const existing = parseHistory(storage(entryScope)?.getItem(storageKey(entryScope)) ?? null)
      .filter((candidate) => !(candidate.id === entry.id && candidate.key === entry.key));
    existing.push(entry);
    writeHistory(entryScope, existing);
  }
}

export function wasRadioCueRemembered(
  id: string,
  key: string,
  options: { scope?: "session" | "local" | "both"; now?: number; withinMs?: number } = {},
) {
  const now = options.now ?? Date.now();
  const withinMs = Math.max(0, options.withinMs ?? DEFAULT_NO_REPEAT_WINDOW_MS);
  return getRadioCueHistory(options.scope ?? "both").some((entry) => (
    entry.id === id && entry.key === key && entry.at >= now - withinMs
  ));
}

export function clearRadioCueHistory(scope: "session" | "local" | "both" = "both") {
  const scopes = scope === "both" ? (["session", "local"] as const) : [scope] as const;
  for (const entryScope of scopes) {
    try {
      storage(entryScope)?.removeItem(storageKey(entryScope));
    } catch {
      // no-op when browser storage is unavailable
    }
  }
}

/**
 * Selects an approved cue without writing history. The director records the
 * selected cue only after audio actually begins, so autoplay failures do not
 * burn a variation for the listener.
 */
export function chooseRadioCue<T extends RadioCue>(
  cues: readonly T[],
  options: RadioCueSelectionOptions = {},
): RadioCueSelection<T> | null {
  const candidates = cues.filter((cue) => Boolean(cue.id?.trim()) && isApprovedRadioAudioUrl(cue.audioUrl));
  if (!candidates.length) return null;
  const now = options.now ?? Date.now();
  const windowMs = Math.max(0, options.noRepeatWindowMs ?? DEFAULT_NO_REPEAT_WINDOW_MS);
  const history = getRadioCueHistory("both");
  const recentlyUsed = new Set(
    history
      .filter((entry) => entry.at >= now - windowMs)
      .filter((entry) => entry.key === radioCueHistoryKey(candidates[0]!, options.historyKey))
      .map((entry) => entry.id),
  );
  const fresh = candidates.filter((cue) => !recentlyUsed.has(cue.id));
  const pool = fresh.length ? fresh : candidates;
  const random = options.random ?? Math.random;
  const rawIndex = Math.floor(random() * pool.length);
  const index = Math.max(0, Math.min(pool.length - 1, Number.isFinite(rawIndex) ? rawIndex : 0));
  return { cue: pool[index]!, repeated: fresh.length === 0 };
}

export function setRadioAudioDirectorMounted(mounted: boolean) {
  directorMounted = mounted;
}

export function isRadioAudioDirectorMounted() {
  return directorMounted;
}

export function emitRadioCueLifecycle(event: RadioCueLifecycleEvent) {
  if (!inBrowser()) return;
  window.dispatchEvent(new CustomEvent<RadioCueLifecycleEvent>(RADIO_CUE_LIFECYCLE_EVENT, { detail: event }));
}

/**
 * Sends a cue to the mounted `RadioAudioDirector`. Dispatch is synchronous,
 * allowing a click handler to retain its browser user-activation privilege.
 */
export function requestRadioCue(request: RadioCueRequest): Promise<RadioCueOutcome> {
  const normalized = normalizeRadioCueRequest(request);
  if (!isApprovedRadioAudioUrl(normalized.audioUrl)) {
    const outcome: RadioCueOutcome = { status: "invalid", cueId: normalized.id, kind: normalized.kind, reason: "invalid_audio_url" };
    emitRadioCueLifecycle({ ...outcome, at: Date.now(), networkSlug: normalized.networkSlug, creatorSlug: normalized.creatorSlug, sourceContentId: normalized.sourceContentId });
    return Promise.resolve(outcome);
  }
  if (!inBrowser() || !directorMounted) {
    const outcome: RadioCueOutcome = { status: "unavailable", cueId: normalized.id, kind: normalized.kind, reason: "director_not_mounted" };
    if (inBrowser()) emitRadioCueLifecycle({ ...outcome, at: Date.now(), networkSlug: normalized.networkSlug, creatorSlug: normalized.creatorSlug, sourceContentId: normalized.sourceContentId });
    return Promise.resolve(outcome);
  }
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent<RadioCueRequestDetail>(RADIO_CUE_REQUEST_EVENT, { detail: { ...normalized, resolve } }));
  });
}

export const playRadioCue = requestRadioCue;

export function skipRadioCue(reason = "user_skip") {
  if (!inBrowser()) return;
  window.dispatchEvent(new CustomEvent<{ reason: string }>(RADIO_CUE_SKIP_EVENT, { detail: { reason } }));
}

/** Marks a direct visitor interaction for a `requiresUserGesture` cue. */
export function markRadioAudioUserGesture() {
  if (!inBrowser()) return;
  window.dispatchEvent(new Event(RADIO_USER_GESTURE_EVENT));
}

/** Convenience bridge for network pages that do not need to import the React director. */
export function dispatchNetworkLiveTakeover(event: RadioNetworkLiveTakeoverEvent) {
  if (!inBrowser()) return;
  window.dispatchEvent(new CustomEvent<RadioNetworkLiveTakeoverEvent>(RADIO_NETWORK_LIVE_TAKEOVER_EVENT, { detail: event }));
}

// Keep a small set of media elements alive so their recorded files stay warm
// across route changes. This is a browser cache only: it neither starts
// playback nor calls a provider/TTS service.
const warmedCueAudio = new Map<string, HTMLAudioElement>();

/** Preloads approved static recordings. It never starts playback or calls a provider. */
export function preloadRadioCues(cues: readonly Pick<RadioCue, "audioUrl">[]) {
  if (!inBrowser()) return;
  for (const cue of cues.slice(0, 8)) {
    if (!isApprovedRadioAudioUrl(cue.audioUrl)) continue;
    const source = cue.audioUrl.trim();
    if (warmedCueAudio.has(source)) continue;
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = source;
    warmedCueAudio.set(source, audio);
    // The catalog can contain rotating approved alternatives. Bound retained
    // elements without evicting the seven immutable fallback recordings.
    if (warmedCueAudio.size > 24) {
      const oldestRotatingCue = [...warmedCueAudio.keys()].find((url) => (
        url !== source && !url.startsWith("/audio/network-tunes/")
      ));
      if (oldestRotatingCue) warmedCueAudio.delete(oldestRotatingCue);
    }
  }
}
