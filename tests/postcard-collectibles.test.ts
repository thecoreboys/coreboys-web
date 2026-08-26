import assert from "node:assert/strict";
import test from "node:test";
import {
  PostcardCollectibleBundleMetadataSchema,
  PostcardCollectibleCheckoutSelectionSchema,
  PostcardCollectibleIssueRequestSchema,
  PostcardCollectibleSelectionSchema,
  PostcardCollectibleSetDefinitionSchema,
} from "../lib/postcard-collectibles";

const release = {
  code: "opening-night",
  title: "Opening Night",
  description: "The first approved release in the house set.",
  packRevisionId: "11111111-1111-4111-8111-111111111111",
  designId: "holo-mvp",
  serialPrefix: "CORE",
  maxSupply: 500,
  setPosition: 1,
  requiredForCompletion: true,
  availableFrom: "2026-08-21T20:00:00.000Z",
  availableUntil: "2026-08-22T20:00:00.000Z",
  variants: [
    { code: "standard", title: "Standard", maxSupply: 400, sortOrder: 0 },
    { code: "prismatic", title: "Prismatic", maxSupply: 100, sortOrder: 1 },
  ],
};

const set = {
  memberSlug: "core",
  code: "house-one",
  title: "House One",
  description: "A sealed collection of approved house releases.",
  releases: [release],
};

test("collectible set schema accepts bounded approved-catalog data", () => {
  assert.equal(PostcardCollectibleSetDefinitionSchema.safeParse(set).success, true);
});

test("collectible definitions reject markup, unknown fields, and fake supply", () => {
  assert.equal(PostcardCollectibleSetDefinitionSchema.safeParse({
    ...set,
    title: "<script>fake</script>",
  }).success, false);
  assert.equal(PostcardCollectibleSetDefinitionSchema.safeParse({
    ...set,
    privateArtworkHtml: "<img src=x>",
  }).success, false);
  assert.equal(PostcardCollectibleSetDefinitionSchema.safeParse({
    ...set,
    releases: [{ ...release, maxSupply: 0 }],
  }).success, false);
  assert.equal(PostcardCollectibleSetDefinitionSchema.safeParse({
    ...set,
    releases: [{
      ...release,
      variants: [{ ...release.variants[0], maxSupply: 501 }],
    }],
  }).success, false);
});

test("collectible set and variant identities cannot collide", () => {
  assert.equal(PostcardCollectibleSetDefinitionSchema.safeParse({
    ...set,
    releases: [release, { ...release, setPosition: 2 }],
  }).success, false);
  assert.equal(PostcardCollectibleSetDefinitionSchema.safeParse({
    ...set,
    releases: [release, { ...release, code: "second", setPosition: 1 }],
  }).success, false);
  assert.equal(PostcardCollectibleSetDefinitionSchema.safeParse({
    ...set,
    releases: [{
      ...release,
      variants: [release.variants[0], release.variants[0]],
    }],
  }).success, false);
});

test("release windows and set completion requirements fail closed", () => {
  assert.equal(PostcardCollectibleSetDefinitionSchema.safeParse({
    ...set,
    releases: [{
      ...release,
      availableUntil: "2026-08-20T20:00:00.000Z",
    }],
  }).success, false);
  assert.equal(PostcardCollectibleSetDefinitionSchema.safeParse({
    ...set,
    releases: [{ ...release, requiredForCompletion: false }],
  }).success, false);
});

test("bundle metadata describes exactly one supported inventory shape", () => {
  assert.equal(PostcardCollectibleBundleMetadataSchema.safeParse({
    mode: "single",
    sendQuantity: 1,
    keepQuantity: 0,
    inventoryQuantity: 1,
  }).success, true);
  assert.equal(PostcardCollectibleBundleMetadataSchema.safeParse({
    mode: "send_one_keep_one",
    sendQuantity: 1,
    keepQuantity: 1,
    inventoryQuantity: 2,
  }).success, true);
  assert.equal(PostcardCollectibleBundleMetadataSchema.safeParse({
    mode: "send_one_keep_one",
    sendQuantity: 1,
    keepQuantity: 1,
    inventoryQuantity: 1,
  }).success, false);
});

test("selection and issuance inputs are strict server identifiers", () => {
  const releaseId = "11111111-1111-4111-8111-111111111111";
  const variantId = "22222222-2222-4222-8222-222222222222";
  const bundle = {
    mode: "single" as const,
    sendQuantity: 1 as const,
    keepQuantity: 0 as const,
    inventoryQuantity: 1 as const,
  };
  assert.equal(PostcardCollectibleSelectionSchema.safeParse({
    releaseId,
    variantId,
    bundle,
  }).success, true);
  assert.equal(PostcardCollectibleCheckoutSelectionSchema.safeParse({
    releaseId,
    variantId,
    bundle,
  }).success, true);
  assert.equal(PostcardCollectibleCheckoutSelectionSchema.safeParse({
    releaseId,
    variantId,
    bundle: {
      mode: "send_one_keep_one",
      sendQuantity: 1,
      keepQuantity: 1,
      inventoryQuantity: 2,
    },
  }).success, false);
  assert.equal(PostcardCollectibleSelectionSchema.safeParse({
    releaseId,
    variantId,
    bundle,
    serialNumber: 1,
  }).success, false);
  assert.equal(PostcardCollectibleIssueRequestSchema.safeParse({
    orderId: "33333333-3333-4333-8333-333333333333",
    ownerUserId: "44444444-4444-4444-8444-444444444444",
  }).success, true);
  assert.equal(PostcardCollectibleIssueRequestSchema.safeParse({
    orderId: "not-an-order",
    ownerUserId: "44444444-4444-4444-8444-444444444444",
  }).success, false);
});
