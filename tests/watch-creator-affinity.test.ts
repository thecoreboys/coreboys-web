import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's type-stripping test runner requires the TS suffix.
import { buildCreatorAffinity, rankByCreatorAffinity, rankCreatorSlugs } from "../lib/watch/creator-affinity.ts";
import type { WatchItem } from "../lib/watch/types";

function item(id: string, memberSlug: string): WatchItem {
  return {
    id,
    kind: "youtube",
    platform: "youtube",
    title: id,
    poster: "/poster.jpg",
    backdrop: "/poster.jpg",
    memberSlug,
    memberLabel: memberSlug,
    accent: "#fff",
    href: `/theater?kind=youtube&id=${id}`,
    format: "long",
  };
}

test("ranks signed-in creators from watch time, completion, and likes", () => {
  const adapt = item("adapt-video", "adapt");
  const jason = item("jason-video", "jason");
  const silky = item("silky-video", "silky");
  const profile = buildCreatorAffinity([adapt, jason, silky], {
    enabled: true,
    now: Date.parse("2026-08-20T12:00:00.000Z"),
    progress: {
      "adapt-video": { seconds: 3_600, progress: 1, completed: true, updatedAt: "2026-08-20T11:00:00.000Z" },
      "jason-video": { seconds: 180, progress: 0.2, updatedAt: "2026-08-20T11:00:00.000Z" },
    },
    feedback: {
      "silky-video": { value: "like", updatedAt: "2026-08-20T11:00:00.000Z" },
    },
  });

  assert.equal(profile.personalized, true);
  assert.deepEqual(profile.orderedCreators, ["adapt", "silky", "jason"]);
  assert.deepEqual(
    rankByCreatorAffinity([jason, adapt, silky], profile.scores).map((entry) => entry.memberSlug),
    ["adapt", "silky", "jason"],
  );
});

test("keeps anonymous ordering unchanged", () => {
  const input = [item("jason-video", "jason"), item("adapt-video", "adapt")];
  const profile = buildCreatorAffinity(input, {
    enabled: false,
    progress: { "adapt-video": { seconds: 99_999, completed: true } },
  });

  assert.equal(profile.personalized, false);
  assert.deepEqual(rankCreatorSlugs(["jason", "adapt"], profile.scores), ["jason", "adapt"]);
});

test("counts an aliased progress mark only once", () => {
  const first = item("first", "adapt");
  const duplicate = item("duplicate", "adapt");
  const profile = buildCreatorAffinity([first, duplicate], {
    enabled: true,
    progress: { shared: { seconds: 300, progress: 0.5 } },
    itemReferences: () => ["shared"],
  });
  const single = buildCreatorAffinity([first], {
    enabled: true,
    progress: { shared: { seconds: 300, progress: 0.5 } },
    itemReferences: () => ["shared"],
  });

  assert.equal(profile.scores.get("adapt"), single.scores.get("adapt"));
});

test("recent habits can overtake much older watch history", () => {
  const adapt = item("adapt-recent", "adapt");
  const jason = item("jason-old", "jason");
  const profile = buildCreatorAffinity([jason, adapt], {
    enabled: true,
    now: Date.parse("2026-08-20T12:00:00.000Z"),
    progress: {
      "adapt-recent": { seconds: 600, updatedAt: "2026-08-20T11:00:00.000Z" },
      "jason-old": { seconds: 3_600, updatedAt: "2025-08-20T11:00:00.000Z" },
    },
  });

  assert.deepEqual(profile.orderedCreators, ["adapt", "jason"]);
});

test("an explicit photo Like contributes to its creator", () => {
  const photo = { ...item("silky-photo", "silky"), format: "photo" as const };
  const profile = buildCreatorAffinity([photo], {
    enabled: true,
    feedback: {
      "silky-photo": { value: "like", updatedAt: "2026-08-20T11:00:00.000Z" },
    },
  });

  assert.equal(profile.personalized, true);
  assert.equal(profile.orderedCreators[0], "silky");
});
