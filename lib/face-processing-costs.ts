/** Cheap defaults; work is explicit and bounded before any worker is started. */
export const FACE_DEFAULT_SAMPLING_FPS = 0.5;
export const FACE_MAX_SCAN_FRAMES = 1800;
export const FACE_MAX_SCAN_INTERVAL_MS = 2 * 60 * 60 * 1000;
export const FACE_PROCESSING_VERSION = "archive-review-v2";
// The pinned fixed encoder version; changing it invalidates enrollment reuse.
export const FACE_ENROLLMENT_MODEL_VERSION = "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79";
export const VIDEO_FINGERPRINT_ALGORITHM = "sha256-chunks-v1-4mib";

export function faceScanFrameCount(startMs: number, endMs: number, fps = FACE_DEFAULT_SAMPLING_FPS) {
  return Math.ceil((endMs - startMs) / Math.max(200,Math.round(1000/fps)));
}
