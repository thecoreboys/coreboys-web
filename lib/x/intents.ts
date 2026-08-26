import type { XActionKind } from "./types";

const ID = /^\d{5,25}$/;
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

export function xWebIntentUrl(input: {
  action: Extract<XActionKind, "like" | "repost" | "reply" | "follow">;
  postId?: string;
  handle?: string;
  text?: string;
}): string | null {
  const base = new URL("https://twitter.com/intent/tweet");
  if (input.action === "follow") {
    const handle = (input.handle ?? "").replace(/^@/, "");
    if (!HANDLE.test(handle)) return null;
    base.pathname = "/intent/follow";
    base.searchParams.set("screen_name", handle);
    return base.toString();
  }
  const postId = input.postId ?? "";
  if (!ID.test(postId)) return null;
  if (input.action === "like") base.pathname = "/intent/like";
  if (input.action === "repost") base.pathname = "/intent/retweet";
  if (input.action === "reply") {
    base.pathname = "/intent/tweet";
    base.searchParams.set("in_reply_to", postId);
    if (input.text?.trim()) base.searchParams.set("text", input.text.trim().slice(0, 280));
    return base.toString();
  }
  base.searchParams.set("tweet_id", postId);
  return base.toString();
}
