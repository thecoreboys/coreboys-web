/**
 * Client-safe DJ Cora cue manifest.
 *
 * This file deliberately contains no database access and no provider/TTS
 * integration. A tune-in needs to begin inside the visitor's navigation
 * gesture, so the current approved station IDs are always available
 * synchronously. The server-side catalog can add pre-rendered alternatives
 * later; callers can pass those cached assets to the same selector.
 */

export const RADIO_NETWORK_SLUGS = [
  "core",
  "adapt",
  "ron",
  "lacy",
  "marlon",
  "jason",
  "silky",
] as const;

export type RadioNetworkSlug = (typeof RADIO_NETWORK_SLUGS)[number];
export type RadioCueKind = "tune_in" | "live_takeover" | "intermission" | "outro";

/** A ready-to-play, already-rendered audio asset. */
export type RadioCueAsset = {
  id: string;
  poolKey: string;
  kind: RadioCueKind;
  networkSlug: RadioNetworkSlug | null;
  title: string;
  /** A local public path or an approved HTTPS CDN URL. Never a TTS request. */
  audioUrl: string;
  transcript: string | null;
  spokenTemplate: string | null;
  fallback: boolean;
};

type StaticTuneDefinition = {
  id: string;
  title: string;
  audioUrl: string;
};

/**
 * The original seven network recordings. These are the immutable fallback
 * assets, so a cold navigation never waits on an API response. Add alternate
 * recordings through the protected radio catalog; they are fetched ahead of
 * time by the player and supplied to `selectNetworkTuneAsset` as `candidates`.
 */
export const STATIC_NETWORK_TUNE_ASSETS: Readonly<Record<RadioNetworkSlug, readonly StaticTuneDefinition[]>> = {
  core: [{ id: "c0000000-0000-4000-8000-000000000001", title: "CORE 24/7 station tune", audioUrl: "/audio/network-tunes/core-247.mp3" }],
  adapt: [{ id: "c0000000-0000-4000-8000-000000000002", title: "Flock station tune", audioUrl: "/audio/network-tunes/flock.mp3" }],
  ron: [{ id: "c0000000-0000-4000-8000-000000000003", title: "Stable station tune", audioUrl: "/audio/network-tunes/stable.mp3" }],
  lacy: [{ id: "c0000000-0000-4000-8000-000000000004", title: "Thugs station tune", audioUrl: "/audio/network-tunes/thugs.mp3" }],
  marlon: [{ id: "c0000000-0000-4000-8000-000000000005", title: "M3 station tune", audioUrl: "/audio/network-tunes/m3.mp3" }],
  jason: [{ id: "c0000000-0000-4000-8000-000000000006", title: "NMS station tune", audioUrl: "/audio/network-tunes/nms.mp3" }],
  silky: [{ id: "c0000000-0000-4000-8000-000000000007", title: "SLG station tune", audioUrl: "/audio/network-tunes/slg.mp3" }],
};

/**
 * A short-lived client manifest warmed once by `RadioAudioSystem`.  It is a
 * selection cache only: it can contain approved, already-recorded assets but
 * never a prompt, credential, or generated response. Keeping it in this
 * module lets a route click choose a variant synchronously while it still has
 * the browser's user-activation privilege.
 */
let hydratedPublicRadioAssets: RadioCueAsset[] = [];

export function isRadioNetworkSlug(value: string | null | undefined): value is RadioNetworkSlug {
  return typeof value === "string" && (RADIO_NETWORK_SLUGS as readonly string[]).includes(value);
}

function isPublicRadioAsset(value: unknown): value is RadioCueAsset {
  if (!value || typeof value !== "object") return false;
  const asset = value as Partial<RadioCueAsset>;
  return typeof asset.id === "string"
    && typeof asset.poolKey === "string"
    && (asset.kind === "tune_in" || asset.kind === "live_takeover" || asset.kind === "intermission" || asset.kind === "outro")
    && (asset.networkSlug === null || isRadioNetworkSlug(asset.networkSlug))
    && typeof asset.title === "string"
    && typeof asset.audioUrl === "string"
    && (asset.audioUrl.startsWith("/") || /^https:\/\//i.test(asset.audioUrl));
}

/**
 * Install one public, approved-only catalog response. The copy is bounded and
 * de-duplicated because it is used purely as a fast client selection cache.
 */
export function setHydratedPublicRadioAssets(assets: readonly RadioCueAsset[]) {
  const seen = new Set<string>();
  hydratedPublicRadioAssets = assets.flatMap((asset) => {
    if (!isPublicRadioAsset(asset) || seen.has(asset.id)) return [];
    seen.add(asset.id);
    return [{
      ...asset,
      id: asset.id.slice(0, 160),
      poolKey: asset.poolKey.slice(0, 160),
      title: asset.title.slice(0, 200),
      audioUrl: asset.audioUrl.slice(0, 1_500),
      transcript: typeof asset.transcript === "string" ? asset.transcript.slice(0, 4_000) : null,
      spokenTemplate: typeof asset.spokenTemplate === "string" ? asset.spokenTemplate.slice(0, 2_000) : null,
      fallback: Boolean(asset.fallback),
    }];
  }).slice(0, 96);
}

export function getHydratedPublicRadioAssets() {
  return [...hydratedPublicRadioAssets];
}

/** Convert the immutable local manifest into the API/client cue contract. */
export function networkTuneCandidates(networkSlug: RadioNetworkSlug): RadioCueAsset[] {
  const staticAssets: RadioCueAsset[] = STATIC_NETWORK_TUNE_ASSETS[networkSlug].map((asset) => ({
    id: asset.id,
    poolKey: `tune-in:${networkSlug}`,
    kind: "tune_in",
    networkSlug,
    title: asset.title,
    audioUrl: asset.audioUrl,
    transcript: null,
    spokenTemplate: null,
    fallback: true,
  }));
  const remote = hydratedPublicRadioAssets.filter((asset) => (
    asset.kind === "tune_in" && asset.networkSlug === networkSlug
  ));
  const seen = new Set<string>();
  return [...remote, ...staticAssets].filter((asset) => {
    if (seen.has(asset.id)) return false;
    seen.add(asset.id);
    return true;
  });
}

/**
 * Pick an approved asset without replaying the immediately previous one when
 * alternatives are available. `random` is injectable for deterministic tests.
 */
export function selectCueCandidate<T extends { id: string }>(
  candidates: readonly T[],
  options: {
    excludedIds?: readonly string[];
    random?: () => number;
  } = {},
): T | null {
  if (candidates.length === 0) return null;
  const excluded = new Set(options.excludedIds ?? []);
  const eligible = candidates.filter((candidate) => !excluded.has(candidate.id));
  const pool = eligible.length > 0 ? eligible : candidates;
  const random = options.random ?? Math.random;
  // Defensive clamping lets custom random functions never index outside the
  // array and makes the function safe for deterministic tests.
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)));
  return pool[index] ?? null;
}

/**
 * Synchronous first-tune selector used within a navigation click. Server
 * alternatives are optional: a failed/slow fetch always falls back to the
 * existing station recording instead of producing a loading state.
 */
export function selectNetworkTuneAsset(
  networkSlug: RadioNetworkSlug,
  options: {
    previousAssetId?: string | null;
    candidates?: readonly RadioCueAsset[];
    random?: () => number;
  } = {},
): RadioCueAsset {
  const supplied = (options.candidates ?? []).filter((candidate) => (
    candidate.kind === "tune_in"
    && candidate.networkSlug === networkSlug
    && Boolean(candidate.audioUrl)
  ));
  const candidates = supplied.length > 0 ? supplied : networkTuneCandidates(networkSlug);
  // `networkTuneCandidates` guarantees a fallback; retain the assertion here
  // so callers receive a stable synchronous return type.
  return selectCueCandidate(candidates, {
    excludedIds: options.previousAssetId ? [options.previousAssetId] : [],
    random: options.random,
  }) ?? networkTuneCandidates(networkSlug)[0]!;
}
