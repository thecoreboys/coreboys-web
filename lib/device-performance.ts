export type DevicePerformanceProfile = "conserve" | "standard" | "enhanced";

type NavigatorLike = {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

/** Choose a conservative playback profile without fingerprinting or network calls. */
export function devicePerformanceProfile(navigatorLike: NavigatorLike | null | undefined): DevicePerformanceProfile {
  if (!navigatorLike) return "standard";
  if (navigatorLike.connection?.saveData === true) return "conserve";
  const cores = navigatorLike.hardwareConcurrency ?? 8;
  const memory = navigatorLike.deviceMemory ?? 8;
  const slowNetwork = ["slow-2g", "2g"].includes(navigatorLike.connection?.effectiveType ?? "");
  if (slowNetwork || cores <= 4 || memory <= 4) return "conserve";
  if (cores >= 12 && memory >= 8) return "enhanced";
  return "standard";
}
