/** Only a successful exact-ID lookup is authoritative; discovery lists are not. */
export function unavailableYouTubeObjects(requested: readonly string[], body: unknown): Array<{ id: string; reason: "private" | "deleted" | "not_found" }> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const response = body as { error?: unknown; items?: unknown };
  if (response.error || !Array.isArray(response.items)) return [];
  const rows = response.items as Array<{ id?: unknown; status?: { privacyStatus?: string; uploadStatus?: string } }>;
  if (rows.some((item) => !item || typeof item !== "object" || typeof item.id !== "string")) return [];
  const ids = [...new Set(requested.filter((id) => /^[\w-]{11}$/.test(id)))];
  return ids.flatMap<{ id: string; reason: "private" | "deleted" | "not_found" }>((id) => {
    const item = rows.find((row) => row.id === id);
    if (!item) return [{ id, reason: "not_found" as const }];
    if (item.status?.uploadStatus === "deleted") return [{ id, reason: "deleted" as const }];
    return item.status?.privacyStatus === "private" ? [{ id, reason: "private" as const }] : [];
  });
}

/** Atom tombstones must identify both the removed video and its channel owner. */
export function youtubeAtomDeletions(raw: string): Array<{ videoId: string; channelId: string }> {
  const output: Array<{ videoId: string; channelId: string }> = [];
  const feedChannel = raw.match(/<yt:channelId>\s*([\w-]+)\s*<\/yt:channelId>/i)?.[1]
    ?? raw.match(/<id>\s*yt:channel:([\w-]+)\s*<\/id>/i)?.[1];
  for (const match of raw.matchAll(/<(?:[\w-]+:)?deleted-entry\b([^>]*)(?:\/>|>([\s\S]*?)<\/(?:[\w-]+:)?deleted-entry>)/gi)) {
    const videoId = /\bref\s*=\s*["']yt:video:([\w-]{11})["']/i.exec(match[1] ?? "")?.[1];
    const channelId = /<(?:[\w-]+:)?uri>\s*https:\/\/www\.youtube\.com\/channel\/([\w-]+)\s*<\/(?:[\w-]+:)?uri>/i.exec(match[2] ?? "")?.[1] ?? feedChannel;
    if (videoId && channelId && (!feedChannel || channelId === feedChannel)) output.push({ videoId, channelId });
    if (output.length >= 200) break;
  }
  return output;
}
