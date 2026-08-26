import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping test runner requires explicit TypeScript suffixes.
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import * as postcardDrafts from "../lib/postcard-draft.ts";

const {
  POSTCARD_DRAFT_SCHEMA_VERSION,
  PostcardDraftSchema,
  createPostcardDraft,
  migratePostcardDraft,
  retargetPostcardDraft,
  restorePostcardDraft,
  serializePostcardDraft,
} = postcardDrafts;

const NOW = "2026-08-21T16:00:00.000Z";

test("creates complete recipient-scoped defaults for every template slot", () => {
  const draft = createPostcardDraft({
    recipientSlug: "adapt",
    designId: "adapt-contact-sheet",
    draftId: "draft-test",
    variationSeed: "variation-test",
    now: NOW,
  });

  assert.equal(draft.schemaVersion, POSTCARD_DRAFT_SCHEMA_VERSION);
  assert.equal(draft.mode, "quick");
  assert.equal(draft.photoSlots.length, 6);
  assert.deepEqual(draft.photoSlots.map((slot) => slot.position), [0, 1, 2, 3, 4, 5]);
  assert.equal(new Set(draft.photoSlots.map((slot) => slot.id)).size, 6);
  assert.ok(draft.photoSlots.every((slot) => slot.asset === null));
  assert.ok(draft.photoSlots.every((slot) => slot.focalPoint.x === 0.5 && slot.zoom === 1));
  assert.deepEqual(draft.remixLocks, {
    crop: false,
    colors: false,
    motifs: false,
    texture: false,
    edges: false,
    stamps: false,
    layout: false,
  });
  assert.equal(PostcardDraftSchema.safeParse(draft).success, true);
});

test("round-trips independent slot art and fine customization without losing state", () => {
  const draft = createPostcardDraft({
    recipientSlug: "jason",
    designId: "jason-side-quest",
    draftId: "draft-custom",
    variationSeed: "variation-custom",
    now: NOW,
  });
  draft.mode = "fine";
  draft.photoSlots[0]!.asset = {
    id: "upload-one",
    altText: "Jason celebrating",
    source: { kind: "managed", origin: "upload", assetId: "asset-one", previewUrl: "/uploads/one.jpg" },
  };
  draft.photoSlots[1]!.asset = {
    id: "moment-two",
    altText: "A stream moment",
    source: {
      kind: "core-moment",
      momentId: "twitch-123",
      platform: "twitch",
      imageUrl: "https://cdn.example.test/frame.jpg",
      sourceUrl: "https://twitch.tv/videos/123",
      attribution: "JasonTheWeen",
    },
  };
  Object.assign(draft.photoSlots[0]!, {
    crop: { x: 0.1, y: 0.2, width: 0.8, height: 0.7 },
    focalPoint: { x: 0.7, y: 0.4 },
    zoom: 1.8,
    rotationDeg: -4,
    flipHorizontal: true,
    mask: "shield",
    border: "neon",
    attachment: "tape",
    caption: "Quest cleared",
    subjectOverlap: true,
  });
  draft.photoSlots[0]!.adjustments = {
    exposure: 0.1,
    contrast: 0.2,
    warmth: -0.1,
    saturation: 0.3,
    filterId: "nms-prism",
    filterStrength: 0.75,
    duotone: { shadow: "#20184b", highlight: "#67f3ff" },
    backgroundRemoved: true,
  };
  draft.remixLocks = { crop: true, colors: true, motifs: false, texture: true, edges: false, stamps: true, layout: true };
  draft.visual.palette.primary = "#fff300";
  draft.visual.palette.sampleAccentFromSlotId = "slot-1";
  draft.visual.background = { type: "starburst", colors: ["#20184b", "#fff300"], angleDeg: 35 };
  draft.visual.motifIds = ["quest-stamp", "xp-marker"];
  draft.visual.texture = "halftone";
  draft.visual.edge = "inked";
  draft.visual.frame = "collector";
  draft.fields = {
    headline: "QUEST COMPLETE",
    caption: "The night we won",
    issueNumber: "NO. 07",
    date: "AUG 2026",
    score: "3-1",
    location: "Los Angeles",
    stats: [{ id: "aura", label: "Aura", value: "99" }],
  };
  draft.writing.purpose = "memory";
  draft.writing.message = "Still the best stream of the summer.";
  draft.memory.favoriteMoment = "The comeback in the final round.";
  draft.collectible = {
    setId: "nms-season-one",
    releaseId: "quest-drop",
    variantId: "prism",
    serial: { sequence: 7, editionSize: 100, issuedAt: NOW, proofId: "proof-007", authority: "server" },
  };

  const serialized = serializePostcardDraft(draft);
  const restored = migratePostcardDraft(serialized);
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.sourceVersion, POSTCARD_DRAFT_SCHEMA_VERSION);
  assert.deepEqual(restored.draft, draft);
  assert.notEqual(restored.draft.photoSlots[0]!.asset?.id, restored.draft.photoSlots[1]!.asset?.id);
});

test("rejects unsafe cross-field combinations and malformed image sources", () => {
  const mismatch = createPostcardDraft({ recipientSlug: "jason", designId: "jason-rookie", now: NOW });
  const mismatchValue = { ...mismatch, designId: "ron-breaking-live" };
  assert.equal(PostcardDraftSchema.safeParse(mismatchValue).success, false);

  const wrongSlotCount = structuredClone(createPostcardDraft({ recipientSlug: "adapt", designId: "adapt-contact-sheet", now: NOW }));
  wrongSlotCount.photoSlots.pop();
  assert.equal(PostcardDraftSchema.safeParse(wrongSlotCount).success, false);

  const invalidCrop = structuredClone(createPostcardDraft({ now: NOW }));
  invalidCrop.photoSlots[0]!.crop = { x: 0.8, y: 0, width: 0.5, height: 1 };
  assert.equal(PostcardDraftSchema.safeParse(invalidCrop).success, false);

  const badUrl = structuredClone(createPostcardDraft({ now: NOW }));
  badUrl.photoSlots[0]!.asset = {
    id: "bad-url",
    altText: "",
    source: { kind: "managed", origin: "upload", assetId: "managed-one", previewUrl: "javascript:alert(1)" },
  };
  assert.equal(PostcardDraftSchema.safeParse(badUrl).success, false);

  const falseSerial = structuredClone(createPostcardDraft({ now: NOW }));
  falseSerial.collectible.serial = {
    sequence: 101,
    editionSize: 100,
    issuedAt: NOW,
    proofId: "proof-overflow",
    authority: "server",
  };
  assert.equal(PostcardDraftSchema.safeParse(falseSerial).success, false);
});

test("migrates the legacy studio payload and restores its primary artwork", () => {
  const legacy = {
    recipientSlug: "jason",
    designId: "jason-side-quest",
    message: "Remember this one?",
    senderName: "CORE fan",
    variationSeed: "legacy-seed",
    imageDataUrl: "data:image/jpeg;base64,/9j/2Q==",
  };
  const result = migratePostcardDraft(legacy);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.sourceVersion, 0);
  assert.equal(result.draft.writing.message, legacy.message);
  assert.equal(result.draft.writing.senderName, legacy.senderName);
  assert.equal(result.draft.variationSeed, legacy.variationSeed);
  assert.equal(result.draft.photoSlots.length, 2);
  assert.equal(result.draft.photoSlots[0]!.asset?.source.kind, "embedded");
  assert.equal(result.draft.photoSlots[1]!.asset, null);
  assert.match(result.warnings[0]!, /Migrated legacy/);
});

test("migrates every V1 creator control out of the capped generic stats list", () => {
  const current = createPostcardDraft({
    recipientSlug: "jason",
    designId: "jason-stat-leader",
    draftId: "draft-v1-creator-fields",
    variationSeed: "variation-v1-creator-fields",
    now: NOW,
  });
  const creatorEntries = [
    ["card-class", "MVP"],
    ["serial-prefix", "NMS"],
    ["ability", "Aura Overdrive"],
    ["matchup", "Jason vs. Ron"],
    ["strengths", "Clutch · IRL"],
    ["weaknesses", "Side quests"],
    ["special-trait", "Achievement unlocked"],
    ["rating-clutch", "99"],
    ["rating-chaos", "98"],
    ["rating-aura", "97"],
    ["rating-comedy", "96"],
    ["rating-irl", "95"],
  ] as const;
  const v1 = {
    ...structuredClone(current),
    schemaVersion: 1,
    fields: {
      ...current.fields,
      stats: [
        ...creatorEntries.map(([id, value]) => ({ id, label: id, value })),
        { id: "fan-stat", label: "Fan stat", value: "100" },
      ],
    },
  } as Record<string, unknown>;
  delete v1.creatorFields;

  const migrated = migratePostcardDraft(v1);
  assert.equal(migrated.ok, true);
  if (!migrated.ok) return;
  assert.equal(migrated.sourceVersion, 1);
  assert.equal(migrated.draft.schemaVersion, POSTCARD_DRAFT_SCHEMA_VERSION);
  assert.deepEqual(migrated.draft.fields.stats, [{ id: "fan-stat", label: "Fan stat", value: "100" }]);
  assert.equal(Object.keys(migrated.draft.creatorFields.values).length, creatorEntries.length);
  for (const [id, value] of creatorEntries) {
    assert.equal(migrated.draft.creatorFields.values[id], value);
  }
  assert.match(migrated.warnings.join(" "), /V1 to V2/);
});

test("creator fields are bounded to the exact recipient, template, and approved options", () => {
  const draft = createPostcardDraft({ recipientSlug: "ron", designId: "ron-breaking-live", now: NOW });
  draft.creatorFields.values["ticker"] = "BREAKING · WE ARE LIVE";
  assert.equal(PostcardDraftSchema.safeParse(draft).success, true);

  const wrongTemplate = structuredClone(draft);
  wrongTemplate.creatorFields.values["hero-replay"] = "Feed A";
  assert.equal(PostcardDraftSchema.safeParse(wrongTemplate).success, false);

  const wrongRecipient = structuredClone(draft);
  wrongRecipient.creatorFields.values["masthead"] = "THE THUGS TIMES";
  assert.equal(PostcardDraftSchema.safeParse(wrongRecipient).success, false);

  const unapprovedOption = structuredClone(draft);
  unapprovedOption.creatorFields.values["broadcast-mode"] = "Injected mode";
  assert.equal(PostcardDraftSchema.safeParse(unapprovedOption).success, false);
});

test("retargets to an exact slot count while preserving compatible creative work", () => {
  const original = createPostcardDraft({
    recipientSlug: "jason",
    designId: "jason-rookie",
    draftId: "draft-retarget",
    variationSeed: "variation-retarget",
    now: NOW,
  });
  original.mode = "fine";
  original.revision = 4;
  original.photoSlots[0]!.asset = {
    id: "hero-image",
    altText: "The winning moment",
    source: { kind: "managed", origin: "upload", assetId: "asset-hero", previewUrl: "/uploads/hero.jpg" },
  };
  original.photoSlots[0]!.focalPoint = { x: 0.75, y: 0.25 };
  original.photoSlots[0]!.zoom = 2;
  original.visual.palette.primary = "#fff300";
  original.visual.palette.sampleAccentFromSlotId = original.photoSlots[0]!.id;
  original.visual.texture = "grain";
  original.visual.layoutVariant = "split-stats";
  original.fields.caption = "Template-specific caption";
  original.writing.message = "Keep this message.";
  original.memory.favoriteMoment = "Keep this memory.";
  original.collectible = {
    setId: "old-set",
    releaseId: "old-release",
    variantId: "old-variant",
    serial: { sequence: 2, editionSize: 10, issuedAt: NOW, proofId: "old-proof", authority: "server" },
  };

  const updatedAt = "2026-08-21T17:00:00.000Z";
  const retargeted = retargetPostcardDraft(original, {
    designId: "jason-side-quest",
    now: updatedAt,
  });

  assert.equal(retargeted.id, original.id);
  assert.equal(retargeted.createdAt, original.createdAt);
  assert.equal(retargeted.updatedAt, updatedAt);
  assert.equal(retargeted.revision, 5);
  assert.equal(retargeted.mode, "fine");
  assert.equal(retargeted.photoSlots.length, 2);
  assert.deepEqual(retargeted.photoSlots[0], original.photoSlots[0]);
  assert.equal(retargeted.photoSlots[1]!.asset, null);
  assert.deepEqual(retargeted.photoSlots[1]!.focalPoint, { x: 0.5, y: 0.5 });
  assert.equal(retargeted.writing.message, "Keep this message.");
  assert.equal(retargeted.memory.favoriteMoment, "Keep this memory.");
  assert.equal(retargeted.visual.palette.primary, "#fff300");
  assert.equal(retargeted.visual.texture, "grain");
  assert.equal(retargeted.visual.layoutVariant, null);
  assert.equal(retargeted.fields.headline, "QUEST COMPLETE");
  assert.equal(retargeted.fields.caption, "");
  assert.deepEqual(retargeted.collectible, { setId: null, releaseId: null, variantId: null, serial: null });
  assert.equal(PostcardDraftSchema.safeParse(retargeted).success, true);
});

test("retargeting another recipient resets creator-owned references and dropped-slot links", () => {
  const original = createPostcardDraft({
    recipientSlug: "adapt",
    designId: "adapt-contact-sheet",
    draftId: "draft-cross-recipient",
    variationSeed: "variation-cross-recipient",
    now: NOW,
  });
  original.photoSlots.forEach((slot, index) => {
    slot.asset = {
      id: `image-${index + 1}`,
      altText: `Image ${index + 1}`,
      source: { kind: "managed", origin: "upload", assetId: `asset-${index + 1}`, previewUrl: null },
    };
  });
  original.visual.palettePresetId = "flock-archive";
  original.visual.palette.primary = "#ed2d25";
  original.visual.palette.sampleAccentFromSlotId = "slot-6";
  original.visual.motifIds = ["unknown-flock-motif"];
  original.visual.layoutVariant = "unknown-flock-layout";
  original.visual.stamp.styleId = "flock-library-stamp";
  original.writing.message = "The message crosses communities.";

  const retargeted = retargetPostcardDraft(original, {
    recipientSlug: "ron",
    designId: "ron-breaking-live",
    now: "2026-08-21T18:00:00.000Z",
  });
  assert.equal(retargeted.photoSlots.length, 1);
  assert.equal(retargeted.photoSlots[0]!.asset?.id, "image-1");
  assert.equal(retargeted.visual.palette.primary, "#ed2d25");
  assert.equal(retargeted.visual.palette.sampleAccentFromSlotId, null);
  assert.equal(retargeted.visual.palettePresetId, null);
  assert.deepEqual(retargeted.visual.motifIds, []);
  assert.equal(retargeted.visual.layoutVariant, null);
  assert.equal(retargeted.visual.stamp.styleId, null);
  assert.equal(retargeted.writing.message, original.writing.message);

  assert.throws(
    () => retargetPostcardDraft(original, { recipientSlug: "ron", designId: "jason-rookie" }),
    /does not belong/,
  );
});

test("fails closed for future versions and can explicitly default corrupted persistence", () => {
  const future = migratePostcardDraft({ schemaVersion: 99, recipientSlug: "ron" });
  assert.equal(future.ok, false);
  if (!future.ok) assert.match(future.error, /Unsupported postcard draft version/);

  const malformed = migratePostcardDraft("{ definitely not json }");
  assert.equal(malformed.ok, false);
  assert.doesNotThrow(() => migratePostcardDraft({
    recipientSlug: "ron",
    designId: "ron-breaking-live",
    message: "x".repeat(10_000),
  }));
  assert.equal(migratePostcardDraft({
    recipientSlug: "ron",
    designId: "ron-breaking-live",
    message: "x".repeat(10_000),
  }).ok, false);

  const restored = restorePostcardDraft("{ definitely not json }", {
    recipientSlug: "lacy",
    designId: "lacy-classifieds",
    draftId: "safe-fallback",
    variationSeed: "fallback-seed",
    now: NOW,
  });
  assert.equal(restored.status, "defaulted");
  assert.equal(restored.draft.recipientSlug, "lacy");
  assert.equal(restored.draft.photoSlots.length, 6);
  assert.ok(restored.warnings.length > 0);
  assert.equal(PostcardDraftSchema.safeParse(restored.draft).success, true);
});
