export type DevicePerformanceProfile = "conserve" | "standard" | "enhanced";

type NavigatorLike = {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
  gpuWeak?: boolean;
};

/** Choose a conservative playback profile without fingerprinting or network calls. */
export function devicePerformanceProfile(navigatorLike: NavigatorLike | null | undefined): DevicePerformanceProfile {
  if (!navigatorLike) return "standard";
  if (navigatorLike.connection?.saveData === true) return "conserve";
  const cores = navigatorLike.hardwareConcurrency ?? 8;
  const memory = navigatorLike.deviceMemory ?? 8;
  const slowNetwork = ["slow-2g", "2g"].includes(navigatorLike.connection?.effectiveType ?? "");
  if (slowNetwork || cores <= 4 || memory <= 4 || navigatorLike.gpuWeak === true) return "conserve";
  if (cores >= 12 && memory >= 8) return "enhanced";
  return "standard";
}

/** Read only a coarse local GPU capability; no renderer string leaves the browser. */
export function detectWeakGpu(): boolean {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  const gl = (canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
  if (!gl) return true;
  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  return !Number.isFinite(maxTextureSize) || maxTextureSize < 4096;
}
