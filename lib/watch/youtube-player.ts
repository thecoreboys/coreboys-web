export type YouTubePlayerCommand = {
  func: string;
  args: unknown[];
};

/**
 * Commands used by the existing postMessage-based YouTube iframe bridge.
 * Loading/unloading the captions module changes captions without navigating
 * the iframe, so playback time and telemetry stay attached to one player.
 */
export function youtubeCaptionCommands(
  enabled: boolean,
  options: { moduleReady?: boolean } = {},
): YouTubePlayerCommand[] {
  if (!enabled) {
    return [
      { func: "setOption", args: ["captions", "track", {}] },
      { func: "unloadModule", args: ["captions"] },
    ];
  }

  return [
    ...(options.moduleReady ? [] : [{ func: "loadModule", args: ["captions"] }]),
    { func: "setOption", args: ["captions", "track", { languageCode: "en" }] },
    { func: "setOption", args: ["captions", "reload", true] },
  ];
}
