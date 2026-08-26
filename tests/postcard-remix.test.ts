import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping test runner requires explicit TypeScript suffixes.
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import * as postcardDrafts from "../lib/postcard-draft.ts";
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import * as postcardIdentities from "../lib/postcard-identities.ts";
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import * as postcardRemixes from "../lib/postcard-remix.ts";

const { PostcardDraftSchema, createPostcardDraft } = postcardDrafts;
const { postcardIdentityFor } = postcardIdentities;
const {
  POSTCARD_REMIX_COUNT,
  PostcardRemixAlternativeSchema,
  applyPostcardRemix,
  generatePostcardRemixes,
} = postcardRemixes;

const NOW = "2026-08-21T16:00:00.000Z";

function completeDraft() {
  const draft = createPostcardDraft({
    recipientSlug: "adapt",
    designId: "adapt-contact-sheet",
    draftId: "draft-remix",
    variationSeed: "remix-seed",
    now: NOW,
  });
  draft.mode = "fine";
  draft.photoSlots.forEach((slot, index) => {
    slot.asset = {
      id: `image-${index + 1}`,
      altText: `Memory ${index + 1}`,
      source: { kind: "managed", origin: "upload", assetId: `asset-${index + 1}`, previewUrl: null },
    };
    slot.caption = `Caption ${index + 1}`;
    slot.adjustments.exposure = index / 10;
  });
  draft.fields.caption = "A template field that must not be remixed";
  draft.writing.message = "A message that must not be remixed.";
  draft.memory.favoriteMoment = "A memory answer that must not be remixed.";
  draft.collectible.setId = "flock-archive-set";
  return draft;
}

function cropSlice(draft: ReturnType<typeof completeDraft>) {
  return draft.photoSlots.map((slot) => ({
    crop: slot.crop,
    focalPoint: slot.focalPoint,
    zoom: slot.zoom,
    rotationDeg: slot.rotationDeg,
    flipHorizontal: slot.flipHorizontal,
    flipVertical: slot.flipVertical,
  }));
}

function lockSlice(draft: ReturnType<typeof completeDraft>, lock: string): unknown {
  switch (lock) {
    case "crop": return cropSlice(draft);
    case "colors": return { palettePresetId: draft.visual.palettePresetId, palette: draft.visual.palette, background: draft.visual.background };
    case "motifs": return draft.visual.motifIds;
    case "texture": return { texture: draft.visual.texture, effects: draft.visual.effects };
    case "edges": return {
      edge: draft.visual.edge,
      frame: draft.visual.frame,
      slots: draft.photoSlots.map((slot) => ({ mask: slot.mask, border: slot.border })),
    };
    case "stamps": return draft.visual.stamp;
    case "layout": return {
      layoutVariant: draft.visual.layoutVariant,
      attachments: draft.photoSlots.map((slot) => slot.attachment),
    };
    default: throw new RangeError(`Unknown lock ${lock}`);
  }
}

test("generates exactly six deterministic, distinct, schema-valid alternatives", () => {
  const draft = completeDraft();
  const originalJson = JSON.stringify(draft);
  const first = generatePostcardRemixes(draft);
  const again = generatePostcardRemixes(draft);

  assert.equal(first.length, POSTCARD_REMIX_COUNT);
  assert.deepEqual(first, again);
  assert.equal(JSON.stringify(draft), originalJson, "generation must not mutate its input");
  assert.equal(new Set(first.map((alternative) => alternative.id)).size, POSTCARD_REMIX_COUNT);
  assert.equal(new Set(first.map((alternative) => JSON.stringify(alternative.preview.visual))).size, POSTCARD_REMIX_COUNT);
  assert.deepEqual(first.map((alternative) => alternative.index), [0, 1, 2, 3, 4, 5]);

  for (const alternative of first) {
    assert.equal(PostcardRemixAlternativeSchema.safeParse(alternative).success, true);
    assert.equal(PostcardDraftSchema.safeParse(alternative.preview).success, true);
    assert.deepEqual(alternative.changed, ["crop", "colors", "motifs", "texture", "edges", "stamps", "layout"]);
    assert.deepEqual(alternative.preview.fields, draft.fields);
    assert.deepEqual(alternative.preview.writing, draft.writing);
    assert.deepEqual(alternative.preview.memory, draft.memory);
    assert.deepEqual(alternative.preview.collectible, draft.collectible);
    assert.deepEqual(
      alternative.preview.photoSlots.map((slot) => slot.asset),
      draft.photoSlots.map((slot) => slot.asset),
    );
    assert.deepEqual(
      alternative.preview.photoSlots.map((slot) => ({ id: slot.id, position: slot.position, caption: slot.caption, adjustments: slot.adjustments, subjectOverlap: slot.subjectOverlap })),
      draft.photoSlots.map((slot) => ({ id: slot.id, position: slot.position, caption: slot.caption, adjustments: slot.adjustments, subjectOverlap: slot.subjectOverlap })),
    );
  }
});

test("all seven locks preserve their owned fields and fully locked trays preserve the draft", () => {
  const lockNames = ["crop", "colors", "motifs", "texture", "edges", "stamps", "layout"] as const;

  for (const lock of lockNames) {
    const draft = completeDraft();
    draft.remixLocks[lock] = true;
    const alternatives = generatePostcardRemixes(draft);
    for (const alternative of alternatives) {
      assert.deepEqual(lockSlice(alternative.preview, lock), lockSlice(draft, lock), `${lock} lock drifted`);
      assert.ok(!alternative.changed.includes(lock));
    }
  }

  const fullyLocked = completeDraft();
  for (const lock of lockNames) fullyLocked.remixLocks[lock] = true;
  const alternatives = generatePostcardRemixes(fullyLocked);
  assert.equal(alternatives.length, 6);
  for (const alternative of alternatives) {
    assert.deepEqual(alternative.preview, fullyLocked);
    assert.deepEqual(alternative.changed, []);
  }
});

test("remixes use only the selected creator's layouts, motifs, and bounded values", () => {
  const draft = completeDraft();
  const identity = postcardIdentityFor(draft.recipientSlug);
  assert.ok(identity);
  if (!identity) return;

  for (const { preview } of generatePostcardRemixes(draft, { seed: "alternate-tray" })) {
    assert.ok(identity.variation.layoutVariants.includes(preview.visual.layoutVariant!));
    assert.ok(preview.visual.motifIds.every((motifId) => identity.motifs.some((motif) => motif.id === motifId)));
    assert.equal(preview.visual.stamp.styleId, identity.postage.stamp.treatment);
    assert.ok(identity.postage.postmark.positions.includes(preview.visual.stamp.position as never));
    for (const effect of Object.values(preview.visual.effects)) {
      assert.ok(effect >= 0 && effect <= 1);
    }
    for (const slot of preview.photoSlots) {
      assert.ok(slot.crop.x >= 0 && slot.crop.y >= 0);
      assert.ok(slot.crop.x + slot.crop.width <= 1.000001);
      assert.ok(slot.crop.y + slot.crop.height <= 1.000001);
      assert.ok(slot.focalPoint.x >= 0 && slot.focalPoint.x <= 1);
      assert.ok(slot.focalPoint.y >= 0 && slot.focalPoint.y <= 1);
      assert.ok(slot.zoom >= 1 && slot.zoom <= 5);
    }
  }
});

test("applies an authentic alternative, advances revision, and rejects stale or modified previews", () => {
  const draft = completeDraft();
  draft.revision = 3;
  const tray = generatePostcardRemixes(draft, { seed: "apply-tray" });
  const alternative = tray[2];
  const appliedAt = "2026-08-21T18:30:00.000Z";
  const applied = applyPostcardRemix(draft, alternative, { now: appliedAt });

  assert.equal(applied.id, draft.id);
  assert.equal(applied.revision, 4);
  assert.equal(applied.createdAt, draft.createdAt);
  assert.equal(applied.updatedAt, appliedAt);
  assert.deepEqual(applied.visual, alternative.preview.visual);
  assert.deepEqual(applied.photoSlots, alternative.preview.photoSlots);
  assert.deepEqual(applied.writing, draft.writing);

  const modified = structuredClone(alternative);
  modified.preview.fields.headline = "TAMPERED";
  assert.throws(() => applyPostcardRemix(draft, modified, { now: appliedAt }), /modified/);
  assert.throws(() => applyPostcardRemix(applied, alternative, { now: appliedAt }), /stale/);

  const otherTray = generatePostcardRemixes(draft, { seed: "another-safe-seed" });
  assert.notDeepEqual(otherTray.map((item) => item.id), tray.map((item) => item.id));
});
