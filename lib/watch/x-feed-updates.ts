import type { WatchHomeXPost } from "./x-posts";

/** Snowflakes are larger than JS's safe integers; compare them losslessly. */
export function newestXPostId(posts: readonly Pick<WatchHomeXPost, "statusId">[]): string | null {
  return posts.reduce<string | null>((latest, post) => {
    if (!/^\d{5,25}$/.test(post.statusId)) return latest;
    return latest === null || BigInt(post.statusId) > BigInt(latest) ? post.statusId : latest;
  }, null);
}

export function advanceXPostWatermark(previous: string | null, posts: readonly Pick<WatchHomeXPost, "statusId">[]): string | null {
  return newestXPostId([...posts, ...(previous ? [{ statusId: previous }] : [])]);
}

/** Older imported posts and reshuffled feed windows aren't new notifications. */
export function countNewXPosts(
  posts: readonly (Pick<WatchHomeXPost, "statusId"> & Partial<Pick<WatchHomeXPost, "publishedAt">>)[],
  after: string | null,
  emptyBaselineAt?: number,
): number {
  if (after !== null && !/^\d{5,25}$/.test(after)) return 0;
  return new Set(posts.filter((post) => /^\d{5,25}$/.test(post.statusId)
    && (after !== null ? BigInt(post.statusId) > BigInt(after)
      : emptyBaselineAt !== undefined && Date.parse(post.publishedAt ?? "") >= emptyBaselineAt)
  ).map((post) => post.statusId)).size;
}
