import "server-only";
import { getUnavailableContentKeys } from "@/lib/content-availability";
import { contentIdentityKeys, isContentUnavailable, type ContentIdentityInput } from "@/lib/content-identity";
import { query } from "@/lib/db";

const localClipId = (ref: string | undefined) => ref?.match(/^(?:[a-z]+:)?clip-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1]?.toLowerCase();

/** Local editorial clip UUIDs must resolve to the upstream identity first. */
export async function getUnavailableReferenceKeys(items: readonly ContentIdentityInput[]): Promise<Set<string>> {
  const clipIds = [...new Set(items.flatMap((item) => localClipId(item.id) ?? []))];
  const clips = clipIds.length ? await query<{ id: string; source: string; external_id: string; url: string }>(
    "SELECT id::text,source,external_id,url FROM clips WHERE id=ANY($1::uuid[])", [clipIds]) : { rows: [] };
  const byId = new Map(clips.rows.map((clip) => [clip.id, { provider: clip.source,
    providerId: clip.source === "twitch" && /clips\.twitch\.tv|\/clip\//.test(clip.url)
      ? `clip:${clip.external_id}` : clip.external_id, sourceUrl: clip.url } satisfies ContentIdentityInput]));
  const keys = await getUnavailableContentKeys([...items, ...byId.values()]);
  for (const item of items) {
    const source = byId.get(localClipId(item.id) ?? "");
    if (source && isContentUnavailable(source, keys)) {
      for (const alias of contentIdentityKeys(item)) keys.add(alias);
    }
  }
  return keys;
}

/** Saved references are checked against local tombstones, never provider APIs. */
export async function filterAvailableReferences(references: readonly string[]): Promise<string[]> {
  const unavailable = await getUnavailableReferenceKeys(references.map((id) => ({ id })));
  return references.filter((id) => !isContentUnavailable({ id }, unavailable));
}

export async function filterAvailableQueuePayload(payload: unknown): Promise<unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const queue = payload as Record<string, unknown>;
  if (!Array.isArray(queue.itemIds)) return payload;
  const refs = queue.itemIds.filter((id): id is string => typeof id === "string");
  return { ...queue, itemIds: await filterAvailableReferences(refs) };
}
