export const MULTIVIEW_REMOTE_API = "/api/watch/multiview-remote";
export const MULTIVIEW_REMOTE_PATH = "/multiview/remote";
export const MULTIVIEW_LAUNCH_PATH = "/multiview?remote=1";
export const MULTIVIEW_REMOTE_MOBILE = "(max-width: 1023px), (pointer: coarse) and (hover: none)";
export const MULTIVIEW_REMOTE_LEASE_SECONDS = 75;

export type RemotePlatform = "twitch" | "youtube";
export type RemoteDevice = "mac" | "windows" | "computer";
export type RemoteSource = {
  member: string;
  platform: RemotePlatform;
  videoId?: string;
};
export type RemoteCommand = {
  revision: number;
  source: string;
  status: "pending" | "applied" | "unavailable";
};
export type RemoteSession = {
  id: string;
  device: RemoteDevice;
  sources: RemoteSource[];
  main: string | null;
  command: RemoteCommand | null;
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

export function remoteDeviceName(device: RemoteDevice) {
  if (device === "mac") return "Mac";
  if (device === "windows") return "Windows PC";
  return "Computer";
}
