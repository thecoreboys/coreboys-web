import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPublicPatreonApiUrl,
  parsePublicPatreonApiPage,
  safePublicPatreonHref,
  safePublicPatreonThumbnail,
} from "../lib/watch/patreon-api";

const EXPECTED_FIELDS = [
  "title",
  "published_at",
  "patreon_url",
  "post_type",
  "thumbnail",
  "current_user_can_view",
  "upgrade_url",
].join(",");

function lockedVideo(id: number, overrides: Record<string, unknown> = {}) {
  return {
    type: "post",
    id: String(id),
    attributes: {
      title: `Exclusive ${id}`,
      published_at: `2026-08-${String(id).padStart(2, "0")}T12:00:00.000Z`,
      patreon_url: `https://www.patreon.com/CORE/posts/exclusive-${id}-${id}`,
      post_type: "video_external_file",
      thumbnail: { default_large: { url: `https://image.mux.com/playback-${id}/thumbnail.jpg` } },
      current_user_can_view: false,
      upgrade_url: "https://www.patreon.com/join/CORE",
      content: "protected content must never leave the parser",
      media_url: "https://example.test/protected.mp4",
      ...overrides,
    },
  };
}

test("public catalog URL requests only the fixed signed-out video metadata projection", () => {
  const url = new URL(buildPublicPatreonApiUrl("opaque-cursor"));

  assert.equal(url.origin + url.pathname, "https://www.patreon.com/api/posts");
  assert.equal(url.searchParams.get("filter[campaign_id]"), "15944831");
  assert.equal(url.searchParams.get("filter[contains_exclusive_posts]"), "true");
  assert.equal(url.searchParams.get("filter[is_draft]"), "false");
  assert.equal(url.searchParams.get("filter[include_lives]"), "true");
  assert.equal(url.searchParams.get("filter[include_drops]"), "true");
  assert.equal(url.searchParams.get("filter[media_types]"), "video");
  assert.equal(url.searchParams.get("fields[post]"), EXPECTED_FIELDS);
  assert.equal(url.searchParams.get("page[count]"), "100");
  assert.equal(url.searchParams.get("page[cursor]"), "opaque-cursor");
  assert.equal(url.searchParams.get("sort"), "-published_at");
  assert.equal(url.searchParams.get("json-api-use-default-includes"), "false");
  assert.equal(url.searchParams.get("json-api-version"), "1.0");
  assert.equal(url.searchParams.has("include"), false);
  assert.doesNotMatch(url.search, /content|media_url|media\[/i);
});

test("projects every locked video in an eight-post public page without protected fields", () => {
  const data = Array.from({ length: 8 }, (_, index) => lockedVideo(index + 1));
  const page = parsePublicPatreonApiPage({ data, meta: { pagination: { cursors: { next: null } } } });

  assert.ok(page);
  assert.equal(page.posts.length, 8);
  assert.equal(page.nextUrl, null);
  assert.deepEqual(page.posts.map((post) => post.id), Array.from({ length: 8 }, (_, index) => `patreon-${index + 1}`));
  for (const post of page.posts) {
    assert.equal(post.kind, "post");
    assert.equal(post.locked, true);
    assert.equal(post.label, "Exclusive video");
    assert.deepEqual(
      Object.keys(post).sort(),
      ["href", "id", "kind", "label", "locked", "publishedAt", "thumbnailUrl", "title"].sort(),
    );
    assert.equal("content" in post, false);
    assert.equal("media_url" in post, false);
    assert.equal("upgrade_url" in post, false);
  }
});

test("rejects unlocked, non-video, benefit, and unsafe-link records while dropping unsafe thumbnails", () => {
  const page = parsePublicPatreonApiPage({
    data: [
      lockedVideo(1, { current_user_can_view: true }),
      lockedVideo(2, { post_type: "image_file" }),
      { ...lockedVideo(3), type: "benefit" },
      lockedVideo(4, { patreon_url: "https://evil.example/posts/stolen" }),
      lockedVideo(5, { thumbnail: { url: "https://evil.example/preview.jpg" } }),
      lockedVideo(6, { patreon_url: "javascript:alert(1)" }),
    ],
  });

  assert.ok(page);
  assert.deepEqual(page.posts.map((post) => post.id), ["patreon-5"]);
  assert.equal(page.posts[0]?.thumbnailUrl, null);
  assert.equal(safePublicPatreonHref("https://patreon.example/posts/fake"), null);
  assert.equal(safePublicPatreonThumbnail("http://image.mux.com/id/thumbnail.jpg"), null);
});

test("rebuilds pagination from an allowlisted same-host cursor and strips injected query fields", () => {
  const currentUrl = buildPublicPatreonApiUrl();
  const linked = parsePublicPatreonApiPage(
    {
      data: [],
      links: {
        next: "https://www.patreon.com/api/posts?page%5Bcursor%5D=next-123&fields%5Bpost%5D=content,media_url&filter%5Bis_draft%5D=true",
      },
    },
    currentUrl,
  );
  assert.ok(linked?.nextUrl);
  const next = new URL(linked.nextUrl);
  assert.equal(next.searchParams.get("page[cursor]"), "next-123");
  assert.equal(next.searchParams.get("fields[post]"), EXPECTED_FIELDS);
  assert.equal(next.searchParams.get("filter[is_draft]"), "false");
  assert.doesNotMatch(next.search, /content|media_url/i);

  const hostile = parsePublicPatreonApiPage({
    data: [],
    links: { next: "https://evil.example/api/posts?page%5Bcursor%5D=stolen" },
    meta: { pagination: { cursors: { next: "safe-meta-cursor" } } },
  });
  assert.ok(hostile?.nextUrl);
  assert.equal(new URL(hostile.nextUrl).searchParams.get("page[cursor]"), "safe-meta-cursor");
  assert.equal(new URL(hostile.nextUrl).hostname, "www.patreon.com");
});

test("rejects malformed JSON:API page roots", () => {
  assert.equal(parsePublicPatreonApiPage(null), null);
  assert.equal(parsePublicPatreonApiPage({ data: {} }), null);
});
