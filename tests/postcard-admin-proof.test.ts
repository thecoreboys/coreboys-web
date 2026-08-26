import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import * as adminProofs from "../lib/postcard-admin-proof.ts";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import * as postcardDrafts from "../lib/postcard-draft.ts";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import * as printMail from "../lib/print-mail.ts";

const {
  describePostcardReviewAssets,
  readPostcardReviewAsset,
  verifyPersistedPostcardProof,
} = adminProofs;
const { createPostcardDraft } = postcardDrafts;
const { createPostcardCreativeSnapshot } = printMail;

function purchasedDraft() {
  const draft = createPostcardDraft({
    recipientSlug: "jason",
    designId: "jason-side-quest",
    draftId: "admin-proof-draft",
    variationSeed: "admin-proof-seed",
    now: "2026-08-21T18:00:00.000Z",
    message: "Thanks for the side quests.",
    senderName: "CORE fan",
  });
  draft.photoSlots[0]!.asset = {
    id: "photo-one",
    altText: "First quest photo",
    source: {
      kind: "embedded",
      origin: "upload",
      dataUrl: "data:image/jpeg;base64,b25l",
    },
  };
  draft.photoSlots[0]!.caption = "First checkpoint";
  draft.photoSlots[1]!.asset = {
    id: "photo-two",
    altText: "Second quest photo",
    source: {
      kind: "embedded",
      origin: "camera",
      dataUrl: "data:image/webp;base64,dHdv",
    },
  };
  draft.writing.signatureDataUrl = "data:image/png;base64,c2ln";
  draft.writing.savedSignatureLabel = "My marker signature";
  return draft;
}

function proofRecord() {
  const draft = purchasedDraft();
  const snapshot = createPostcardCreativeSnapshot({
    id: "admin-proof-order",
    recipientSlug: draft.recipientSlug,
    designId: draft.designId,
    variationSeed: draft.variationSeed,
    message: draft.writing.message,
    senderName: draft.writing.senderName,
    draft,
  });
  return {
    recipientSlug: draft.recipientSlug,
    designId: draft.designId,
    snapshotVersion: snapshot.snapshotVersion,
    identityId: snapshot.identityId,
    identityVersion: snapshot.identityVersion,
    archetypeId: snapshot.archetypeId,
    templateId: snapshot.templateId,
    rendererVersion: snapshot.rendererVersion,
    variationAlgorithmVersion: snapshot.variationAlgorithmVersion,
    resolvedVariation: snapshot.resolvedVariation,
    creativeFrontHtml: snapshot.frontHtml,
    creativeBackHtml: snapshot.backHtml,
    creativeHash: snapshot.creativeHash,
  };
}

test("admin proof verification returns the byte-exact purchased front and back", () => {
  const record = proofRecord();
  const result = verifyPersistedPostcardProof(record);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.proof.snapshot.frontHtml, record.creativeFrontHtml);
  assert.equal(result.proof.snapshot.backHtml, record.creativeBackHtml);
  assert.equal(result.proof.hash, record.creativeHash);
});

test("admin proof verification fails closed for tampering and order mismatch", () => {
  const record = proofRecord();
  const tampered = verifyPersistedPostcardProof({
    ...record,
    creativeFrontHtml: `${record.creativeFrontHtml}\n<!-- changed -->`,
  });
  assert.equal(tampered.ok, false);
  if (!tampered.ok) assert.match(tampered.error, /integrity check/);

  const wrongOrder = verifyPersistedPostcardProof({ ...record, recipientSlug: "ron" });
  assert.equal(wrongOrder.ok, false);
  if (!wrongOrder.ok) assert.match(wrongOrder.error, /does not match/);
});

test("review inventory lists every photo and private signature without returning payloads", () => {
  const draft = purchasedDraft();
  const record = { draftCreative: draft, imageUrl: null, assetCount: 2 };
  const inventory = describePostcardReviewAssets(record);
  assert.equal(inventory.complete, true);
  assert.deepEqual(
    inventory.assets.map((asset: { key: string }) => asset.key),
    ["slot-0", "slot-1", "signature"],
  );
  assert.equal(inventory.assets[0]!.caption, "First checkpoint");
  assert.equal(inventory.assets[2]!.label, "My marker signature");
  assert.equal(JSON.stringify(inventory).includes("data:image"), false);

  const first = readPostcardReviewAsset(record, "slot-0");
  assert.equal(first?.contentType, "image/jpeg");
  assert.equal(Buffer.from(first?.bytes ?? []).toString("utf8"), "one");
  const second = readPostcardReviewAsset(record, "slot-1");
  assert.equal(second?.contentType, "image/webp");
  assert.equal(Buffer.from(second?.bytes ?? []).toString("utf8"), "two");
  const signature = readPostcardReviewAsset(record, "signature");
  assert.equal(signature?.contentType, "image/png");
  assert.equal(Buffer.from(signature?.bytes ?? []).toString("utf8"), "sig");
});

test("legacy first-image review remains available and count mismatches are visible", () => {
  const legacy = {
    draftCreative: null,
    imageUrl: "data:image/png;base64,bGVnYWN5",
    assetCount: 1,
  };
  assert.equal(describePostcardReviewAssets(legacy).complete, true);
  assert.equal(
    Buffer.from(readPostcardReviewAsset(legacy, "slot-0")?.bytes ?? []).toString("utf8"),
    "legacy",
  );
  assert.equal(
    describePostcardReviewAssets({ ...legacy, assetCount: 2 }).complete,
    false,
  );
});
