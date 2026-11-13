import type { RoomLayoutPreset } from "@/lib/watch/room-layout";

export const MULTIVIEW_REMOTE_API = "/api/watch/multiview-remote";
export const MULTIVIEW_REMOTE_PATH = "/multiview/remote";
export const MULTIVIEW_LAUNCH_PATH = "/multiview?remote=1";
export const MULTIVIEW_REMOTE_MOBILE = "(max-width: 1023px), (pointer: coarse) and (hover: none)";
export const MULTIVIEW_REMOTE_LEASE_SECONDS = 75;

/** Playback controls a phone may send besides switching the main source. */
export const REMOTE_CONTROLS = ["main-sound-on", "main-sound-off", "mute-all", "maximize", "restore", "theater"] as const;
/** Control commands share the command column with source keys under this prefix. */
export const REMOTE_CONTROL_PREFIX = "control:";
export const REMOTE_LAYOUTS = [
  "theater-first", "solo", "split", "quad", "main-three", "three-two", "portrait-wall", "chat-first", "freeform",
] as const satisfies readonly RoomLayoutPreset[];

export type RemotePlatform = "twitch" | "youtube";
export type RemoteDevice = "mac" | "windows" | "computer";
export type RemoteSource = {
  member: string;
  platform: RemotePlatform;
  videoId?: string;
};
export type RemoteControl = (typeof REMOTE_CONTROLS)[number];
export type RemoteLayout = (typeof REMOTE_LAYOUTS)[number];
/** What the computer reports so the phone mirrors it instead of firing blind. */
export type RemoteHostState = {
  /** The main view is playing with sound. */
  mainAudible: boolean;
  /** Every view playing with sound, including ones that are not remote sources. */
  audibleCount: number;
  /** Source keys of audible views the phone knows about. */
  audible: string[];
  /** The main view fills the stage. */
  maximized: boolean;
  layout: RemoteLayout;
};
export type RemoteCommand = {
  revision: number;
  /** Source key for a main-source switch; null for playback controls. */
  source: string | null;
  control: RemoteControl | null;
  status: "pending" | "applied" | "unavailable";
};
export type RemoteSession = {
  id: string;
  device: RemoteDevice;
  sources: RemoteSource[];
  main: string | null;
  command: RemoteCommand | null;
  /** Null until the host reports state (older host tabs, or before the state migration). */
  state: RemoteHostState | null;
};
export type RemoteChatMessage = {
  id: string;
  author: string;
  text: string;
  time: number;
};

export function remoteSourceKey(source: RemoteSource) {
  return `${source.member}:${source.platform}`;
}

export function remoteControlFromCommand(value: string | null): RemoteControl | null {
  if (!value?.startsWith(REMOTE_CONTROL_PREFIX)) return null;
  const control = value.slice(REMOTE_CONTROL_PREFIX.length);
  return (REMOTE_CONTROLS as readonly string[]).includes(control) ? control as RemoteControl : null;
}

/** Whether the host's reported state shows a control command took effect. */
export function remoteControlSatisfied(control: RemoteControl, state: RemoteHostState | null) {
  if (!state) return false;
  switch (control) {
    case "main-sound-on": return state.mainAudible;
    case "main-sound-off": return !state.mainAudible;
    case "mute-all": return state.audibleCount === 0;
    case "maximize": return state.maximized;
    case "restore": return !state.maximized;
    case "theater": return state.layout === "theater-first";
  }
}

export function remoteDeviceName(device: RemoteDevice) {
  if (device === "mac") return "Mac";
  if (device === "windows") return "Windows PC";
  return "Computer";
}
