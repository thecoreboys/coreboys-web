import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping test runner requires explicit TypeScript suffixes.
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import * as postcardDrafts from "../lib/postcard-draft.ts";
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import * as postcardScenes from "../lib/postcard-scene.ts";

const { createPostcardDraft } = postcardDrafts;
const { resolvePostcardScene } = postcardScenes;
const NOW = "2026-08-21T16:00:00.000Z";

test("resolves a valid draft into its recipient-scoped canonical scene", () => {
  const draft = createPostcardDraft({
    recipientSlug: "jason",
    designId: "jason-side-quest",
    draftId: "draft-scene-default",
    variationSeed: "scene-default",
    now: NOW,
  });

  const scene = resolvePostcardScene(draft);
  assert.ok(scene);
  assert.equal(scene.identity.slug, "jason");
  assert.equal(scene.design.id, "jason-side-quest");
  assert.equal(scene.photos.length, draft.photoSlots.length);
  assert.ok(scene.photos.every((photo) => photo.src === scene.identity.media.portrait));
  assert.equal(scene.fields.headline, draft.fields.headline);
  assert.deepEqual(scene.creatorFields, []);
  assert.equal(scene.writing.message, "");
});

test("resolves independent slot assets, bounded transforms, and visible overrides", () => {
  const draft = createPostcardDraft({
    recipientSlug: "jason",
    designId: "jason-side-quest",
    draftId: "draft-scene-custom",
    variationSeed: "scene-custom",
    now: NOW,
  });
  draft.photoSlots[0]!.asset = {
    id: "slot-one-art",
    altText: "First custom photo",
    source: { kind: "managed", origin: "upload", assetId: "asset-one", previewUrl: "/uploads/one.webp" },
  };
  draft.photoSlots[1]!.asset = {
    id: "slot-two-art",
    altText: "Second custom photo",
    source: {
      kind: "core-moment",
      momentId: "moment-two",
      platform: "twitch",
      imageUrl: "https://cdn.example.test/two.webp",
      sourceUrl: "https://twitch.tv/videos/2",
      attribution: "JasonTheWeen",
    },
  };
  Object.assign(draft.photoSlots[0]!, {
    crop: { x: 0.1, y: 0.15, width: 0.7, height: 0.75 },
    focalPoint: { x: 0.75, y: 0.25 },
    zoom: 1.8,
    rotationDeg: -7,
    flipHorizontal: true,
    mask: "shield",
    border: "neon",
    attachment: "tape",
    caption: "Quest cleared",
    subjectOverlap: true,
  });
  draft.photoSlots[0]!.adjustments = {
    exposure: 0.2,
    contrast: 0.3,
    warmth: -0.2,
    saturation: 0.4,
    filterId: "creator-prism",
    filterStrength: 0.7,
    duotone: { shadow: "#20184b", highlight: "#67f3ff" },
    backgroundRemoved: false,
  };
  draft.visual.background = { type: "starburst", colors: ["#20184b", "#fff300"], angleDeg: 30 };
  draft.visual.palette.primary = "#fff300";
  draft.visual.texture = "halftone";
  draft.visual.edge = "deckled";
  draft.visual.frame = "collector";
  draft.visual.effects.grain = 0.6;
  draft.visual.effects.registrationOffset = 0.4;
  draft.fields.headline = "ONE OF ONE";
  draft.fields.caption = "Paris night stream";
  draft.fields.score = "99";
  draft.fields.stats = [{ id: "wins", label: "Wins", value: "12" }];
  draft.creatorFields.values["quest-objective"] = "Complete the final side mission";
  draft.creatorFields.values["quest-reward"] = "+500 Aura";
  draft.creatorFields.values["quest-xp"] = "2,500 XP";
  draft.writing.message = "Thanks for the stream.";
  draft.writing.greeting = "Yo Jason,";
  draft.writing.signoff = "Keep cooking";
  draft.writing.lettering = "typewriter";
  draft.writing.paper = "lined";

  const scene = resolvePostcardScene(draft);
  assert.ok(scene);
  assert.equal(scene.photos[0]!.src, "/uploads/one.webp");
  assert.equal(scene.photos[1]!.src, "https://cdn.example.test/two.webp");
  assert.equal(scene.photos[0]!.objectPosition, "75% 25%");
  assert.match(scene.photos[0]!.transform, /^scale\([\d.]+\) rotate\(-7deg\) scaleX\(-1\) scaleY\(1\)$/);
  assert.match(scene.photos[0]!.adjustmentFilter, /^brightness\([\d.]+\) contrast\([\d.]+\) saturate\([\d.]+\) sepia\([\d.]+\) hue-rotate\(-?\d+(?:\.\d+)?deg\)$/);
  assert.ok(scene.photos[0]!.clipPath?.startsWith("polygon("));
  assert.equal(scene.photos[0]!.caption, "Quest cleared");
  assert.equal(scene.photos[0]!.subjectOverlap, true);
  assert.equal(scene.photos[0]!.duotone?.highlight, "#67f3ff");
  assert.match(scene.design.background, /^repeating-conic-gradient/);
  assert.equal(scene.design.accent, "#fff300");
  assert.equal(scene.design.headline, "ONE OF ONE");
  assert.equal(scene.visual.texture, "halftone");
  assert.ok(scene.visual.cardClipPath);
  assert.match(scene.visual.cardBorder ?? "", /double/);
  assert.match(scene.visual.registrationTransform ?? "", /^translate\(/);
  assert.equal(scene.fields.score, "99");
  assert.deepEqual(scene.creatorFields.map((field) => [field.id, field.value, field.group]), [
    ["quest-objective", "Complete the final side mission", "headline"],
    ["quest-reward", "+500 Aura", "detail"],
    ["quest-xp", "2,500 XP", "badge"],
  ]);
  assert.equal(scene.writing.paper, "lined");
});

test("fails closed when draft identity and design no longer validate", () => {
  const draft = createPostcardDraft({
    recipientSlug: "ron",
    draftId: "draft-scene-invalid",
    variationSeed: "scene-invalid",
    now: NOW,
  });
  draft.designId = "jason-side-quest";
  assert.equal(resolvePostcardScene(draft), null);
});
