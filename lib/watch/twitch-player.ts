export type TwitchPlayerInstance = {
  addEventListener: (name: string, callback: () => void) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlaybackStats?: () => { fps?: number; playbackRate?: number; bufferSize?: number };
  isPaused?: () => boolean;
  setMuted?: (muted: boolean) => void;
  setVolume?: (volume: number) => void;
  play?: () => void;
  pause?: () => void;
  seek?: (seconds: number) => void;
  destroy?: () => void;
};

export type TwitchPlayerApi = {
  Player: {
    new (id: string, options: Record<string, unknown>): TwitchPlayerInstance;
    READY: string;
    PLAYING: string;
    PAUSE: string;
    ENDED: string;
    OFFLINE: string;
    PLAYBACK_BLOCKED: string;
  };
};

let pending: Promise<TwitchPlayerApi> | null = null;

/** Share the SDK across route changes and independently mounted players. */
export function loadTwitchPlayer(): Promise<TwitchPlayerApi> {
  if (pending) return pending;
  const request = new Promise<TwitchPlayerApi>((resolve, reject) => {
    const readApi = () => (window as typeof window & { Twitch?: TwitchPlayerApi }).Twitch;
    const known = readApi();
    if (known?.Player) return resolve(known);
    const src = "https://player.twitch.tv/js/embed/v1.js";
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    const script = existing ?? document.createElement("script");
    let poll = 0;
    let timeout = 0;
    const cleanup = () => {
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      script.removeEventListener("load", done);
      script.removeEventListener("error", fail);
    };
    const done = () => {
      const api = readApi();
      if (!api?.Player) return;
      cleanup();
      resolve(api);
    };
    const fail = () => {
      cleanup();
      if (!readApi()?.Player) script.remove();
      reject(new Error("twitch_player_unavailable"));
    };
    script.addEventListener("load", done);
    script.addEventListener("error", fail);
    // A different surface may have attached the script before this mount;
    // its load event may already have fired by the time we subscribe.
    poll = window.setInterval(done, 100);
    timeout = window.setTimeout(fail, 12_000);
    if (!existing) {
      script.src = src;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  pending = request;
  void request.catch(() => { if (pending === request) pending = null; });
  return request;
}
