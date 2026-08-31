import assert from "node:assert/strict";
import test from "node:test";
import { itemToPlayable } from "../lib/watch/playable";
import { selectWatchHomeXPosts } from "../lib/watch/x-posts";
import type { WatchCatalog, WatchItem } from "../lib/watch/types";

function xItem(input: Partial<WatchItem> & Pick<WatchItem, "id" | "memberSlug" | "title">): WatchItem {
  const statusId = input.id.match(/\d{5,}/)?.[0] ?? "10000";
  return {
    id: input.id,
    kind: input.kind ?? "post",
    platform: "x",
    title: input.title,
    subtitle: input.subtitle ?? "Member",
    poster: input.poster ?? "/members/member/portrait.jpg",
    backdrop: input.backdrop ?? "/members/member/portrait.jpg",
    memberSlug: input.memberSlug,
    memberLabel: input.memberLabel ?? input.memberSlug ?? "CORE",
    accountLabel: input.accountLabel ?? `@${input.memberSlug ?? "thecoreboys"}`,
    accent: input.accent ?? "#db0368",
    href: input.href ?? `https://x.com/${input.memberSlug ?? "thecoreboys"}/status/${statusId}`,
    sourceUrl: input.sourceUrl ?? `https://x.com/${input.memberSlug ?? "thecoreboys"}/status/${statusId}`,
    publishedAt: input.publishedAt ?? "2026-08-20T12:00:00.000Z",
    mediaUrl: input.mediaUrl,
    format: input.format,
    orientation: input.orientation,
    width: input.width,
    height: input.height,
    x: input.x,
  };
}

function catalog(items: WatchItem[]): Pick<WatchCatalog, "byMember" | "byPlatform"> {
  return {
    byMember: ["adapt", "ron", "lacy", "marlon", "jason", "silky"].map((slug) => ({
      slug,
      label: slug[0]!.toUpperCase() + slug.slice(1),
      accent: "#123456",
      portrait: `/members/${slug}.jpg`,
      comm: "CORE",
      items: [],
    })),
    byPlatform: {
      twitch: [],
      youtube: [],
      tiktok: [],
      instagram: [],
      x: items,
      house: [],
    },
  };
}

test("Watch-home X selector includes all six CORE members when each has a post", () => {
  const slugs = ["adapt", "ron", "lacy", "marlon", "jason", "silky"];
  const posts = selectWatchHomeXPosts(catalog(slugs.flatMap((slug, index) => [
    xItem({
      id: `x-${60000 + index}`,
      memberSlug: slug,
      title: `${slug} latest`,
      publishedAt: `2026-08-${String(20 - index).padStart(2, "0")}T12:00:00Z`,
    }),
    xItem({
      id: `x-${70000 + index}`,
      memberSlug: slug,
      title: `${slug} older`,
      publishedAt: `2026-07-${String(20 - index).padStart(2, "0")}T12:00:00Z`,
    }),
  ])), { limit: 6, perMember: 2 });

  assert.deepEqual(new Set(posts.map((post) => post.author.slug)), new Set(slugs));
});

test("Watch-home X selector first round can cover CORE and every member", () => {
  const slugs = ["adapt", "ron", "lacy", "marlon", "jason", "silky"];
  const items = [
    xItem({
      id: "x-99000",
      memberSlug: null,
      title: "Official CORE update",
      sourceUrl: "https://x.com/thecoreboys/status/99000",
      publishedAt: "2026-08-20T18:00:00Z",
    }),
    ...slugs.map((slug, index) => xItem({
      id: `x-${99100 + index}`,
      memberSlug: slug,
      title: `${slug} update`,
      publishedAt: `2026-08-20T${String(17 - index).padStart(2, "0")}:00:00Z`,
    })),
  ];

  const posts = selectWatchHomeXPosts(catalog(items), { limit: 7, perMember: 1 });

  assert.equal(posts.length, 7);
  assert.deepEqual(new Set(posts.map((post) => post.author.slug)), new Set(["core", ...slugs]));
});

test("Watch-home X selector balances configured members before adding extra posts", () => {
  const posts = selectWatchHomeXPosts(catalog([
    xItem({ id: "x-90003", memberSlug: "marlon", title: "Newest Marlon", publishedAt: "2026-08-20T15:00:00Z" }),
    xItem({ id: "x-90002", memberSlug: "marlon", title: "More Marlon", publishedAt: "2026-08-20T14:00:00Z" }),
    xItem({ id: "x-90001", memberSlug: "marlon", title: "Old Marlon", publishedAt: "2026-08-20T13:00:00Z" }),
    xItem({ id: "x-80001", memberSlug: "lacy", title: "Lacy post", publishedAt: "2026-08-19T13:00:00Z" }),
    xItem({ id: "x-70001", memberSlug: "silky", title: "Silky post", publishedAt: "2026-08-18T13:00:00Z" }),
  ]), { limit: 3, perMember: 3 });

  assert.deepEqual(new Set(posts.map((post) => post.author.slug)), new Set(["marlon", "lacy", "silky"]));
  assert.deepEqual(posts.map((post) => post.statusId), ["90003", "80001", "70001"]);
});

test("Watch-home X selector collapses multi-media variants into one status card", () => {
  const posts = selectWatchHomeXPosts(catalog([
    xItem({
      id: "x-123456-media-a",
      memberSlug: "marlon",
      title: "House day · 1/2",
      kind: "tour",
      format: "photo",
      poster: "https://pbs.twimg.com/media/a.jpg",
      sourceUrl: "https://x.com/Mar3lg/status/123456/photo/1",
    }),
    xItem({
      id: "x-123456-media-b",
      memberSlug: "marlon",
      title: "House day · 2/2",
      kind: "tour",
      format: "photo",
      poster: "https://pbs.twimg.com/media/b.jpg",
      sourceUrl: "https://twitter.com/Mar3lg/status/123456/photo/2?utm_source=share",
    }),
  ]));

  assert.equal(posts.length, 1);
  assert.equal(posts[0]?.id, "x-123456");
  assert.equal(posts[0]?.text, "House day");
  assert.equal(posts[0]?.sourceUrl, "https://x.com/Mar3lg/status/123456");
  assert.equal(posts[0]?.media.length, 2);
});

test("Watch-home X selector deduplicates a status repeated across ingestion scopes", () => {
  const posts = selectWatchHomeXPosts(catalog([
    xItem({ id: "x-81234-a", memberSlug: "adapt", title: "Same status", sourceUrl: "https://x.com/FaZeAdapt/status/81234" }),
    xItem({ id: "x-81234-b", memberSlug: "adapt", title: "Same status", href: "https://twitter.com/FaZeAdapt/status/81234?utm_source=legacy", sourceUrl: "https://twitter.com/FaZeAdapt/status/81234?utm_source=legacy" }),
  ]), { limit: 48, perMember: 8 });

  assert.deepEqual(posts.map((post) => post.statusId), ["81234"]);
});

test("Watch-home X selector includes the official CORE account and excludes unknown or unsafe posts", () => {
  const items = [
    xItem({ id: "x-space-99999", memberSlug: "marlon", title: "Space", kind: "live", format: "live", sourceUrl: "https://x.com/i/spaces/99999" }),
    xItem({ id: "x-22222", memberSlug: null, title: "CORE org post" }),
    xItem({ id: "x-22223", memberSlug: null, title: "Unconfigured org post", sourceUrl: "https://x.com/otheraccount/status/22223" }),
    xItem({ id: "x-33333", memberSlug: "unknown", title: "Unknown" }),
    xItem({ id: "x-44444", memberSlug: "lacy", title: "Unsafe", sourceUrl: "javascript:alert(1)", href: "javascript:alert(1)" }),
    xItem({ id: "x-55555", memberSlug: "lacy", title: "Safe post", sourceUrl: "https://x.com/LacyHimself/status/55555" }),
  ];

  const posts = selectWatchHomeXPosts(catalog(items));
  assert.deepEqual(posts.map((post) => post.statusId), ["22222", "55555"]);
  assert.equal(posts[0]?.author.slug, "core");
  assert.equal(posts[0]?.author.handle, "@thecoreboys");
  assert.ok(posts.every((post) => post.sourceUrl.startsWith("https://x.com/")));
});

test("Watch-home X selector emits plain serializable text with no HTML field", () => {
  const [post] = selectWatchHomeXPosts(catalog([
    xItem({
      id: "x-67890",
      memberSlug: "silky",
      title: "Hello\u202E <script>alert('x')</script>\nCORE",
      accountLabel: "Silky · @SilkySzn",
      sourceUrl: "https://x.com/SilkySzn/status/67890",
    }),
  ]));

  assert.ok(post);
  assert.equal(post.author.handle, "@SilkySzn");
  assert.equal(post.text.includes("\u202E"), false);
  assert.equal("html" in post, false);
  assert.doesNotThrow(() => JSON.stringify(post));
});

test("text-only X posts stay external instead of becoming empty player items", () => {
  const item = xItem({
    id: "x-77889",
    memberSlug: "jason",
    title: "A text update from the house",
    sourceUrl: "https://x.com/jasontheween/status/77889",
  });

  assert.equal(itemToPlayable(item), null);
});

test("Watch-home X selector keeps only valid dates and honors per-member bounds", () => {
  const posts = selectWatchHomeXPosts(catalog([
    xItem({ id: "x-10001", memberSlug: "marlon", title: "One", publishedAt: "2026-08-20T10:00:00Z" }),
    xItem({ id: "x-10002", memberSlug: "marlon", title: "Two", publishedAt: "2026-08-20T11:00:00Z" }),
    xItem({ id: "x-10003", memberSlug: "marlon", title: "Bad date", publishedAt: "not-a-date" }),
  ]), { limit: 48, perMember: 1 });

  assert.deepEqual(posts.map((post) => post.statusId), ["10002"]);
  assert.deepEqual(selectWatchHomeXPosts(catalog([]), { limit: 0 }), []);
});

test("Watch-home X DTO preserves complete cached text and normalizes official entities", () => {
  const urlToken = "https://t.co/core";
  const raw = `Opening line 🎬\n\n${"full text ".repeat(70)}\u202E@SilkySzn #CORE ${urlToken}`;
  const mentionStart = raw.indexOf("@SilkySzn");
  const hashtagStart = raw.indexOf("#CORE");
  const urlStart = raw.indexOf(urlToken);
  const [post] = selectWatchHomeXPosts(catalog([
    xItem({
      id: "x-987654",
      memberSlug: "silky",
      title: "truncated fallback",
      sourceUrl: "https://x.com/SilkySzn/status/987654",
      x: {
        statusId: "987654",
        statusUrl: "https://x.com/SilkySzn/status/987654",
        authorId: "42",
        authorHandle: "@SilkySzn",
        authorName: "Silky",
        authorProfileUrl: "https://x.com/SilkySzn",
        authorAvatarUrl: "https://pbs.twimg.com/profile_images/silky.jpg",
        verified: true,
        noteText: raw,
        noteEntities: {
          mentions: [{ start: mentionStart, end: mentionStart + "@SilkySzn".length, username: "SilkySzn" }],
          hashtags: [{ start: hashtagStart, end: hashtagStart + "#CORE".length, tag: "CORE" }],
          urls: [{ start: urlStart, end: urlStart + urlToken.length, url: urlToken, expanded_url: "https://example.com/core" }],
        },
      },
    }),
  ]));

  assert.ok(post);
  assert.equal(post.text, raw.replace("\u202E", ""));
  assert.ok(post.text.length > 500);
  assert.ok(post.text.includes("\n\n"));
  assert.deepEqual(post.entities.map(({ kind, href }) => ({ kind, href })), [
    { kind: "mention", href: "https://x.com/SilkySzn" },
    { kind: "hashtag", href: "https://x.com/hashtag/CORE" },
    { kind: "url", href: "https://example.com/core" },
  ]);
  assert.deepEqual(post.author, {
    slug: "silky",
    label: "Silky",
    handle: "@SilkySzn",
    portrait: "https://pbs.twimg.com/profile_images/silky.jpg",
    profileUrl: "https://x.com/SilkySzn",
    accent: "#123456",
    verified: true,
  });
});

test("Watch-home X DTO carries snapshot rich-link and quoted-post previews", () => {
  const token = "https://t.co/rich";
  const [post] = selectWatchHomeXPosts(catalog([
    xItem({
      id: "x-765432",
      memberSlug: "lacy",
      title: `A useful link ${token}`,
      sourceUrl: "https://x.com/LacyHimself/status/765432",
      x: {
        statusId: "765432",
        statusUrl: "https://x.com/LacyHimself/status/765432",
        authorId: "7",
        authorHandle: "@LacyHimself",
        authorProfileUrl: "https://x.com/LacyHimself",
        noteText: `A useful link ${token}`,
        noteEntities: {
          urls: [{
            start: 14,
            end: 14 + token.length,
            url: token,
            unwound_url: "https://example.com/the-story",
            display_url: "example.com/the-story",
            title: "The Story Behind the Stream",
            description: "A short explainer that makes the destination clear.",
            images: [{ url: "https://example.com/preview.jpg" }],
          }],
        },
        quote: {
          statusId: "765400",
          statusUrl: "https://x.com/Someone/status/765400",
          text: "The original post, ready to read before leaving CORE.",
          authorName: "Someone",
          authorHandle: "@Someone",
          authorProfileUrl: "https://x.com/Someone",
        },
      },
    }),
  ]));

  assert.deepEqual(post?.entities[0], {
    kind: "url",
    start: 14,
    end: 14 + token.length,
    href: "https://example.com/the-story",
    label: "example.com/the-story",
    title: "The Story Behind the Stream",
    description: "A short explainer that makes the destination clear.",
    imageUrl: "https://example.com/preview.jpg",
  });
  assert.deepEqual(post?.quote, {
    statusId: "765400",
    statusUrl: "https://x.com/Someone/status/765400",
    text: "The original post, ready to read before leaving CORE.",
    authorName: "Someone",
    authorHandle: "@Someone",
    authorProfileUrl: "https://x.com/Someone",
    authorAvatarUrl: undefined,
    media: [],
    entities: [],
  });
});
