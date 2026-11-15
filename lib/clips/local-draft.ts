export const CLIP_DRAFT_STORAGE_KEY = "coreboys-clip-drafts:v1";

export type ClipPlatform = "twitch" | "youtube" | "tiktok" | "instagram";

/** A supported media URL must use an actual provider host, not a lookalike. */
export function detectClipPlatform(value: string): {
  source: ClipPlatform | null;
  externalId: string | null;
} {
  const unknown = { source: null, externalId: null };
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return unknown;
    const host = url.hostname.toLowerCase();
    const isHost = (domain: string) => host === domain || host.endsWith(`.${domain}`);
    if (host === "clips.twitch.tv") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? { source: "twitch", externalId: id } : unknown;
    }
    if (isHost("twitch.tv")) {
      const id = url.pathname.match(/^\/[^/]+\/clip\/([^/]+)/)?.[1];
      return id ? { source: "twitch", externalId: id } : unknown;
    }
    if (isHost("youtube.com") || host === "youtu.be") {
      const id = host === "youtu.be"
        ? url.pathname.split("/").filter(Boolean)[0]
        : url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1] ?? url.searchParams.get("v");
      return id ? { source: "youtube", externalId: id } : unknown;
    }
    if (isHost("tiktok.com")) {
      const id = url.pathname.match(/\/video\/(\d+)/)?.[1];
      if (id) return { source: "tiktok", externalId: id };
      if ((host === "vm.tiktok.com" || host === "vt.tiktok.com") && url.pathname !== "/") {
        return { source: "tiktok", externalId: null };
      }
    }
    if (isHost("instagram.com")) {
      const id = url.pathname.match(/^\/(?:reel|reels|p)\/([^/]+)/)?.[1];
      return id ? { source: "instagram", externalId: id } : unknown;
    }
  } catch {
    // A partially typed URL has not identified a supported clip yet.
  }
  return unknown;
}

/** Throws on unavailable storage or malformed existing data; never reports a false save. */
export function saveLocalClipDraft(
  storage: Pick<Storage, "getItem" | "setItem">,
  draft: { id: string; status: "draft" },
) {
  const raw = storage.getItem(CLIP_DRAFT_STORAGE_KEY);
  const existing: unknown = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(existing)) throw new Error("The saved draft data could not be read.");
  storage.setItem(CLIP_DRAFT_STORAGE_KEY, JSON.stringify([draft, ...existing]));
}
