import assert from "node:assert/strict";
import test from "node:test";
import {
  PostcardAcknowledgementSchema,
  PostcardDropCreateSchema,
  PostcardPackAssetMetadataSchema,
  PostcardPackConfigSchema,
  PostcardSharingChoiceSchema,
} from "../lib/postcard-pack-schema";

const palette = {
  id: "core-night",
  label: "CORE Night",
  background: "#09090B",
  surface: "#18181B",
  ink: "#FFFFFF",
  mutedInk: "#A1A1AA",
  primary: "#DB0368",
  secondary: "#22D3EE",
  highlight: "#FDE047",
};

const motif = {
  id: "live-dot",
  label: "Live dot",
  kind: "badge",
  mark: "LIVE",
  placements: ["top-right"],
};

const design = {
  id: "opening-night",
  label: "Opening Night",
  description: "A creator-approved broadcast card.",
  composition: "lower-third",
  photoSlots: 1,
  fields: [{
    key: "headline",
    label: "Headline",
    kind: "text",
    required: true,
    maxLength: 80,
    defaultValue: "Opening night",
  }],
  paletteIds: ["core-night"],
  motifIds: ["live-dot"],
  assetIds: [],
  backgroundStyle: "solid",
  edgeTreatments: ["clean"],
  frameStyles: ["collector"],
  attachmentStyles: ["none"],
};

const config = {
  schemaVersion: 1,
  title: "Opening Night",
  description: "A seasonal creator pack.",
  palettes: [palette],
  motifs: [motif],
  prompts: [],
  phrases: [],
  designs: [design],
};

test("postcard pack schema accepts a bounded data-only catalog", () => {
  const parsed = PostcardPackConfigSchema.safeParse(config);
  assert.equal(parsed.success, true);
});

test("postcard pack schema rejects markup, unknown properties, and dangling references", () => {
  assert.equal(PostcardPackConfigSchema.safeParse({
    ...config,
    title: "<script>alert(1)</script>",
  }).success, false);
  assert.equal(PostcardPackConfigSchema.safeParse({
    ...config,
    arbitraryCss: "body { display: none }",
  }).success, false);
  assert.equal(PostcardPackConfigSchema.safeParse({
    ...config,
    designs: [{ ...design, paletteIds: ["missing"] }],
  }).success, false);
  assert.equal(PostcardPackConfigSchema.safeParse({
    ...config,
    designs: [{ ...design, motifIds: ["missing"] }],
  }).success, false);
});

test("postcard pack schema rejects duplicate ids and duplicate design controls", () => {
  assert.equal(PostcardPackConfigSchema.safeParse({
    ...config,
    palettes: [palette, palette],
  }).success, false);
  assert.equal(PostcardPackConfigSchema.safeParse({
    ...config,
    designs: [{ ...design, fields: [design.fields[0], design.fields[0]] }],
  }).success, false);
  assert.equal(PostcardPackConfigSchema.safeParse({
    ...config,
    designs: [{ ...design, edgeTreatments: ["clean", "clean"] }],
  }).success, false);
});

test("editable field defaults cannot exceed their declared limit", () => {
  assert.equal(PostcardPackConfigSchema.safeParse({
    ...config,
    designs: [{
      ...design,
      fields: [{ ...design.fields[0], maxLength: 5, defaultValue: "too long" }],
    }],
  }).success, false);
});

test("asset metadata requires an explicit rights attestation", () => {
  const base = {
    packId: "11111111-1111-4111-8111-111111111111",
    memberSlug: "jason",
    kind: "sticker",
    rightsSource: "official",
  };
  assert.equal(PostcardPackAssetMetadataSchema.safeParse({
    ...base,
    rightsAttested: true,
  }).success, true);
  assert.equal(PostcardPackAssetMetadataSchema.safeParse({
    ...base,
    rightsAttested: false,
  }).success, false);
});

test("drop windows and sharing choices fail closed", () => {
  const drop = {
    packId: "11111111-1111-4111-8111-111111111111",
    revisionId: "22222222-2222-4222-8222-222222222222",
    memberSlug: "jason",
    code: "opening-night",
    title: "Opening Night",
    startsAt: "2026-08-21T20:00:00.000Z",
    endsAt: "2026-08-22T20:00:00.000Z",
  };
  assert.equal(PostcardDropCreateSchema.safeParse(drop).success, true);
  assert.equal(PostcardDropCreateSchema.safeParse({
    ...drop,
    endsAt: "2026-08-20T20:00:00.000Z",
  }).success, false);

  assert.equal(PostcardSharingChoiceSchema.safeParse({
    visibility: "private",
    showSender: false,
    showMessage: false,
    showArtwork: false,
    policyVersion: "postcard-sharing-v1",
  }).success, true);
  assert.equal(PostcardSharingChoiceSchema.safeParse({
    visibility: "private",
    showSender: false,
    showMessage: true,
    showArtwork: false,
    policyVersion: "postcard-sharing-v1",
  }).success, false);
  assert.equal(PostcardSharingChoiceSchema.safeParse({
    visibility: "anonymous",
    showSender: true,
    showMessage: true,
    showArtwork: false,
    policyVersion: "postcard-sharing-v1",
  }).success, false);
});

test("recipient acknowledgements are a bounded enum", () => {
  assert.equal(PostcardAcknowledgementSchema.safeParse({ reaction: "heart" }).success, true);
  assert.equal(PostcardAcknowledgementSchema.safeParse({ reaction: "custom-html" }).success, false);
  assert.equal(PostcardAcknowledgementSchema.safeParse({ reaction: "heart", note: "extra" }).success, false);
});
