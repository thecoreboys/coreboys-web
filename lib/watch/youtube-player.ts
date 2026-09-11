export type YouTubePlayerCommand = {
  func: string;
  args: unknown[];
};

/** Reconnect after load: an iframe can finish booting after React's first effect. */
export function listenToYouTube(source: Pick<Window, "postMessage">, id: string) {
  source.postMessage(JSON.stringify({ event: "listening", id, channel: "widget" }), "*");
  for (const name of ["onReady", "onStateChange", "onError", "onApiChange"]) {
    source.postMessage(JSON.stringify({ event: "command", func: "addEventListener", args: [name], id, channel: "widget" }), "*");
  }
}

export function youtubePlaybackSample(message: Record<string, unknown>): Record<string, unknown> | null {
  if (message.event === "onStateChange" && typeof message.info === "number") {
    return { playerState: message.info };
  }
  if ((message.event === "initialDelivery" || message.event === "infoDelivery")
    && message.info && typeof message.info === "object") {
    return message.info as Record<string, unknown>;
  }
  return null;
}

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
