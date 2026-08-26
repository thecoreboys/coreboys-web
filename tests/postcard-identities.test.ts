import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
// Node's type-stripping test runner requires explicit TypeScript suffixes.
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { MAIL_MEMBERS } from "../lib/fan-mail.ts";
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { MEMBERS_BY_SLUG } from "../lib/members.ts";
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import * as postcardIdentities from "../lib/postcard-identities.ts";

const {
  POSTCARD_IDENTITIES,
  POSTCARD_IDENTITIES_BY_SLUG,
  createSeededPostcardVariation,
  designById,
  hashPostcardSeed,
  pickSeededPostcardValue,
  postcardDesignsFor,
  postcardIdentityFor,
  seededPostcardVariation,
} = postcardIdentities;

test("defines one complete and structurally distinct identity per mail recipient", () => {
  assert.deepEqual(
    POSTCARD_IDENTITIES.map((identity) => identity.slug),
    MAIL_MEMBERS.map((member) => member.slug),
  );
  assert.equal(Object.keys(POSTCARD_IDENTITIES_BY_SLUG).length, MAIL_MEMBERS.length);
  assert.equal(
    new Set(POSTCARD_IDENTITIES.map((identity) => identity.archetype)).size,
    POSTCARD_IDENTITIES.length,
  );

  const allDesignIds = POSTCARD_IDENTITIES.flatMap((identity) =>
    identity.frontDesigns.map((design) => design.id));
  assert.equal(new Set(allDesignIds).size, allDesignIds.length);

  for (const identity of POSTCARD_IDENTITIES) {
    const mailMember = MAIL_MEMBERS.find((member) => member.slug === identity.slug);
    assert.equal(mailMember?.mailRecipient, MEMBERS_BY_SLUG[identity.slug]?.poBox?.recipient);
    assert.equal(identity.frontDesigns.length, 4);
    assert.ok(identity.frontDesigns.every((design) => design.id.startsWith(`${identity.slug}-`)));
    assert.equal(new Set(identity.frontDesigns.map((design) => design.composition)).size, 4);
    assert.ok(identity.motifs.length >= 5);
    assert.ok(identity.copy.prompts.length >= 4);
    assert.equal(identity.copy.tone.length, 3);
    assert.ok(identity.typography.display.family.length > 0);
    assert.ok(!identity.typography.print.displayFamily.includes("var("));
    assert.ok(identity.paper.weightGsm >= 300);
    assert.ok(identity.paper.weightGsm <= 325);
    assert.ok(identity.back.decoration.length > 20);
    assert.equal(identity.postage.decorativeOnly, true);
    assert.equal(identity.postage.placementZone, "front");
    assert.ok(identity.postage.stamp.label.length > 0);
    assert.ok(identity.postage.postmark.topText.length > 0);
    for (const design of identity.frontDesigns) {
      assert.match(design.print.background, /^#[0-9a-f]{6}$/i);
      assert.match(design.print.ink, /^#[0-9a-f]{6}$/i);
      assert.match(design.print.accent, /^#[0-9a-f]{6}$/i);
    }
  }
});

test("references an existing portrait and community logo for every identity", () => {
  for (const identity of POSTCARD_IDENTITIES) {
    assert.ok(identity.media.portrait.startsWith(`/members/${identity.slug}/`));
    assert.equal(identity.media.communityLogo, `/comms/${identity.slug}.png`);
    assert.ok(existsSync(resolve(process.cwd(), "public", identity.media.portrait.slice(1))));
    assert.ok(existsSync(resolve(process.cwd(), "public", identity.media.communityLogo.slice(1))));
  }
});

test("scopes design lookup to the recipient and preserves a safe fallback", () => {
  const jason = postcardIdentityFor("jason");
  assert.ok(jason);
  assert.equal(postcardDesignsFor("jason"), jason.frontDesigns);
  assert.deepEqual(postcardDesignsFor("not-a-member"), []);
  assert.equal(designById("jason-holo-mvp", "jason").id, "jason-holo-mvp");
  assert.equal(designById("ron-overtime").id, "ron-overtime");
  assert.equal(designById("ron-overtime", "jason").id, "jason-rookie");
  assert.equal(designById("missing-design").id, "ron-breaking-live");
  assert.equal(postcardIdentityFor("silky"), null);
});

test("creates deterministic, valid, recipient-specific variations", () => {
  for (const identity of POSTCARD_IDENTITIES) {
    const selectedDesign = identity.frontDesigns[2]!;
    const first = createSeededPostcardVariation(identity, "order_01JABC123", selectedDesign.id);
    const again = createSeededPostcardVariation(identity.slug, "order_01JABC123", selectedDesign.id);
    const seedFirstAlias = seededPostcardVariation("order_01JABC123", identity.slug, selectedDesign.id);
    assert.deepEqual(first, again);
    assert.deepEqual(first, seedFirstAlias);
    assert.equal(first.catalogVersion, identity.catalogVersion);
    assert.equal(first.algorithmVersion, 1);
    assert.equal(first.designId, selectedDesign.id);
    assert.equal(new Set(first.motifIds).size, 2);
    assert.ok(first.motifIds.every((motifId) => identity.motifs.some((motif) => motif.id === motifId)));
    assert.ok(identity.variation.layoutVariants.includes(first.layoutVariant));
    assert.ok(identity.variation.attachmentStyles.includes(first.attachmentStyle));
    assert.ok(identity.variation.edgeTreatments.includes(first.edgeTreatment));
    assert.ok(identity.postage.postmark.positions.includes(first.postmarkPosition));
    assert.ok(first.stampRotationDeg >= identity.postage.stamp.rotationRangeDeg[0]);
    assert.ok(first.stampRotationDeg <= identity.postage.stamp.rotationRangeDeg[1]);
    assert.ok(first.imageScale >= identity.variation.imageScaleRange[0]);
    assert.ok(first.imageScale <= identity.variation.imageScaleRange[1]);
  }
});

test("produces useful variety without coupling fields to call order", () => {
  for (const identity of POSTCARD_IDENTITIES) {
    const samples = Array.from({ length: 64 }, (_, index) =>
      createSeededPostcardVariation(identity, `draft-${index}`, identity.frontDesigns[1]!.id));
    assert.deepEqual(new Set(samples.map((sample) => sample.designId)), new Set([identity.frontDesigns[1]!.id]));
    assert.ok(new Set(samples.map((sample) => sample.layoutVariant)).size >= 2);
    assert.ok(new Set(samples.map((sample) => JSON.stringify(sample))).size >= 56);
  }

  const before = createSeededPostcardVariation("adapt", "same-seed");
  hashPostcardSeed("unrelated work", "new-future-channel");
  const after = createSeededPostcardVariation("adapt", "same-seed");
  assert.deepEqual(after, before);
});

test("seed helpers reject unsafe inputs and empty catalogs", () => {
  assert.equal(hashPostcardSeed(-0), hashPostcardSeed(0));
  assert.throws(() => hashPostcardSeed(Number.NaN), TypeError);
  assert.throws(() => pickSeededPostcardValue([], "seed", "empty"), RangeError);
});
