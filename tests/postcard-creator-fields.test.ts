import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import * as postcardDrafts from "../lib/postcard-draft.ts";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import * as postcardScenes from "../lib/postcard-scene.ts";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import * as printMail from "../lib/print-mail.ts";

const { createPostcardDraft } = postcardDrafts;
const { resolvePostcardScene } = postcardScenes;
const { renderPostcardCreative } = printMail;

const NOW = "2026-08-21T16:00:00.000Z";

const CASES = [
  { recipientSlug: "ron", designId: "ron-breaking-live", fieldId: "ticker", value: "BREAKING · CHAT IS MOVING" },
  { recipientSlug: "jason", designId: "jason-side-quest", fieldId: "quest-objective", value: "Complete the final side mission" },
  { recipientSlug: "lacy", designId: "lacy-front-page", fieldId: "masthead", value: "THE THUGS TIMES" },
  { recipientSlug: "marlon", designId: "marlon-icon-issue", fieldId: "cover-line-1", value: "THE NEW STANDARD" },
  { recipientSlug: "adapt", designId: "adapt-tour-notes", fieldId: "map-pins", value: "LA → PARIS → LONDON" },
] as const;

test("every recipient's template-scoped fields resolve for preview and physical print", () => {
  for (const entry of CASES) {
    const draft = createPostcardDraft({
      recipientSlug: entry.recipientSlug,
      designId: entry.designId,
      draftId: `draft-${entry.recipientSlug}-creator-field`,
      variationSeed: `variation-${entry.recipientSlug}-creator-field`,
      now: NOW,
      message: `A note for ${entry.recipientSlug}.`,
    });
    draft.creatorFields.values[entry.fieldId] = entry.value;

    const scene = resolvePostcardScene(draft);
    assert.ok(scene, `${entry.recipientSlug} should resolve a preview scene`);
    assert.deepEqual(scene.creatorFields.map((field) => [field.id, field.value]), [[entry.fieldId, entry.value]]);
    assert.deepEqual(scene.fields.stats, [], "creator controls must not consume generic stats");

    const rendered = renderPostcardCreative({
      id: `order-${entry.recipientSlug}-creator-field`,
      recipientSlug: entry.recipientSlug,
      designId: entry.designId,
      message: draft.writing.message,
      senderName: draft.writing.senderName,
      variationSeed: draft.variationSeed,
      draft,
    });
    assert.ok(rendered.front.includes(`data-creator-fields="${entry.recipientSlug}"`));
    assert.ok(rendered.front.includes(`data-creator-design="${entry.designId}"`));
    assert.ok(rendered.front.includes(entry.value));
  }
});

test("more than eight template controls survive one current-draft round trip", () => {
  const draft = createPostcardDraft({
    recipientSlug: "jason",
    designId: "jason-stat-leader",
    draftId: "draft-many-creator-fields",
    variationSeed: "variation-many-creator-fields",
    now: NOW,
  });
  Object.assign(draft.creatorFields.values, {
    "card-class": "MVP",
    "serial-prefix": "NMS",
    ability: "Aura Overdrive",
    matchup: "Jason vs. Ron",
    strengths: "Clutch · IRL",
    weaknesses: "Side quests",
    "special-trait": "Achievement unlocked",
    "rating-clutch": "99",
    "rating-chaos": "98",
    "rating-aura": "97",
    "rating-comedy": "96",
    "rating-irl": "95",
  });

  const parsed = postcardDrafts.PostcardDraftSchema.parse(JSON.parse(JSON.stringify(draft)));
  assert.equal(Object.keys(parsed.creatorFields.values).length, 12);
  assert.equal(parsed.fields.stats.length, 0);
});
