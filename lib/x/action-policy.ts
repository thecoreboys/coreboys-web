import type { XActionKind } from "./types";

export const X_ACTION_SCOPE: Readonly<Record<XActionKind, string>> = {
  like: "like.write",
  unlike: "like.write",
  repost: "tweet.write",
  unrepost: "tweet.write",
  reply: "tweet.write",
  follow: "follows.write",
  unfollow: "follows.write",
};

export const X_ACTION_RATE_LIMIT: Readonly<Record<XActionKind, number>> = {
  like: 10,
  unlike: 10,
  repost: 6,
  unrepost: 6,
  reply: 3,
  follow: 5,
  unfollow: 5,
};

export function xActionTarget(input: {
  action: XActionKind;
  postId?: string | null;
  targetUserId?: string | null;
}): string | null {
  return input.action === "follow" || input.action === "unfollow"
    ? input.targetUserId ?? null
    : input.postId ?? null;
}

export function xActionRequestIsValid(input: {
  action: XActionKind;
  postId?: string | null;
  targetUserId?: string | null;
  text?: string | null;
}): boolean {
  const target = xActionTarget(input);
  if (!target || !/^\d{5,25}$/.test(target)) return false;
  if (input.action === "reply") {
    const text = input.text?.trim() ?? "";
    return text.length >= 1 && text.length <= 280;
  }
  return !input.text?.trim();
}
