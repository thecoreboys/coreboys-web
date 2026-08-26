import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import * as postcardDrafts from "../lib/postcard-draft.ts";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import * as postcards from "../lib/postcard.ts";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import * as printMail from "../lib/print-mail.ts";

const { POSTCARD_DRAFT_SCHEMA_VERSION, createPostcardDraft } = postcardDrafts;
const { collectPostcardDraftModerationText, validatePostcardDraftBridge } = postcards;
const { createPostcardCreativeSnapshot, renderPostcardCreative } = printMail;

const NOW = "2026-08-21T16:00:00.000Z";

function richDraft() {
  const draft = createPostcardDraft({
    recipientSlug: "jason",
    designId: "jason-side-quest",
    draftId: "checkout-rich-draft",
    variationSeed: "checkout-rich-seed",
    now: NOW,
    message: "The final round was legendary.",
    senderName: "@corefan",
  });
  draft.photoSlots[0]!.asset = {
    id: "first-upload",
    altText: "First winner photo",
    source: { kind: "embedded", origin: "upload", dataUrl: "data:image/jpeg;base64,/9j/2Q==" },
  };
  draft.photoSlots[1]!.asset = {
    id: "second-upload",
    altText: "Second winner photo",
    source: { kind: "embedded", origin: "camera", dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==" },
  };
  Object.assign(draft.photoSlots[0]!, {
    focalPoint: { x: 0.75, y: 0.2 },
    zoom: 1.6,
    rotationDeg: -5,
    flipHorizontal: true,
    mask: "shield",
    border: "double",
    attachment: "tape",
    caption: "Quest cleared",
  });
  draft.photoSlots[0]!.adjustments.exposure = 0.2;
  draft.photoSlots[0]!.adjustments.contrast = 0.3;
  draft.fields.headline = "ONE & ONLY";
  draft.fields.location = "Los Angeles";
  draft.fields.stats = [{ id: "aura", label: "Aura", value: "99" }];
  draft.creatorFields.values["quest-objective"] = "Complete the final side mission";
  draft.creatorFields.values["quest-reward"] = "+500 Aura";
  draft.creatorFields.values["core-era"] = "The first house era";
  draft.writing.greeting = "Yo Jason,";
  draft.writing.signoff = "Keep cooking";
  draft.writing.featuredQuote = "We really did that";
  draft.writing.whyMomentMattered = "Everybody was together.";
  draft.writing.secondaryLanguage = "spanish";
  draft.writing.secondaryMessage = "Gracias por todo.";
  draft.writing.groupSigners = ["Ava", "Noah"];
  draft.writing.contentWarnings = ["other"];
  draft.writing.lettering = "typewriter";
  draft.writing.paper = "lined";
  return draft;
}

test("rich checkout fields must agree and client-issued serials fail closed", () => {
  const draft = richDraft();
  const input = {
    recipientSlug: draft.recipientSlug,
    designId: draft.designId,
    message: draft.writing.message,
    senderName: draft.writing.senderName,
    variationSeed: draft.variationSeed,
  };
  assert.deepEqual(validatePostcardDraftBridge(input, draft), { ok: true });
  assert.equal(validatePostcardDraftBridge({ ...input, recipientSlug: "ron" }, draft).ok, false);
  assert.equal(validatePostcardDraftBridge({ ...input, designId: "jason-rookie" }, draft).ok, false);
  assert.equal(validatePostcardDraftBridge({ ...input, message: "Different copy" }, draft).ok, false);
  assert.equal(validatePostcardDraftBridge({ ...input, senderName: "Someone else" }, draft).ok, false);
  assert.equal(validatePostcardDraftBridge({ ...input, variationSeed: "different-seed" }, draft).ok, false);

  draft.collectible.serial = {
    sequence: 7,
    editionSize: 100,
    issuedAt: NOW,
    proofId: "forged-proof",
    authority: "server",
  };
  const serialResult = validatePostcardDraftBridge(input, draft);
  assert.equal(serialResult.ok, false);
  if (!serialResult.ok) assert.match(serialResult.error, /issued only after checkout/);
});

test("moderation includes every current editable copy surface", () => {
  const draft = richDraft();
  draft.fields.caption = "Summer finale";
  draft.memory.favoriteMoment = "The comeback";
  draft.memory.insideJoke = "Secret side quest";
  const text = collectPostcardDraftModerationText(draft).join("\n");
  for (const expected of [
    draft.writing.message,
    draft.writing.greeting,
    draft.writing.signoff,
    draft.writing.featuredQuote,
    draft.writing.whyMomentMattered,
    draft.writing.secondaryMessage,
    "Ava",
    "other",
    draft.fields.headline,
    draft.fields.caption,
    "Aura",
    "99",
    "Complete the final side mission",
    "+500 Aura",
    "The first house era",
    "The comeback",
    "Secret side quest",
    "Quest cleared",
    "First winner photo",
  ]) assert.ok(text.includes(expected), `moderation must include ${expected}`);
});

test("canonical print uses distinct slot art and draft front/back overrides", () => {
  const draft = richDraft();
  const input = {
    id: "order-rich-draft",
    recipientSlug: draft.recipientSlug,
    designId: draft.designId,
    message: draft.writing.message,
    senderName: draft.writing.senderName,
    variationSeed: draft.variationSeed,
    draft,
  };
  const rendered = renderPostcardCreative(input);
  assert.ok(rendered.front.includes(`data-draft-schema="${POSTCARD_DRAFT_SCHEMA_VERSION}"`));
  assert.ok(rendered.front.includes("data:image/jpeg;base64,/9j/2Q=="));
  assert.ok(rendered.front.includes("data:image/jpeg;base64,/9j/4AAQSkZJRg=="));
  assert.ok(rendered.front.includes("object-position:75% 20%"));
  assert.ok(rendered.front.includes("rotate(-5deg) scaleX(-1)"));
  assert.ok(rendered.front.includes("clip-path:polygon("));
  assert.ok(rendered.front.includes("border:.055in double"));
  assert.ok(rendered.front.includes("Quest cleared"));
  assert.ok(rendered.front.includes("ONE &amp; ONLY"));
  assert.ok(rendered.front.includes("Los Angeles"));
  assert.ok(rendered.front.includes("Aura: 99"));
  assert.ok(rendered.front.includes("data-creator-fields=\"jason\""));
  assert.ok(rendered.front.includes("data-creator-design=\"jason-side-quest\""));
  assert.ok(rendered.front.includes("Complete the final side mission"));
  assert.ok(rendered.front.includes("+500 Aura"));
  assert.ok(rendered.front.includes("The first house era"));
  assert.ok(rendered.back.includes("Yo Jason,"));
  assert.ok(rendered.back.includes("Keep cooking"));
  assert.ok(rendered.back.includes("We really did that"));
  assert.ok(rendered.back.includes("SPANISH: Gracias por todo."));
  assert.ok(rendered.back.includes("With Ava · Noah"));
  assert.ok(rendered.back.includes("Note: other"));
  assert.ok(rendered.back.includes("repeating-linear-gradient"));
  assert.ok(rendered.back.includes("var(--numeric)"));

  const first = createPostcardCreativeSnapshot(input);
  const second = createPostcardCreativeSnapshot(input);
  assert.deepEqual(second, first);
  assert.match(first.creativeHash, /^[0-9a-f]{64}$/);
});

test("scrapbook print preserves every independently uploaded slot", () => {
  const draft = createPostcardDraft({
    recipientSlug: "adapt",
    designId: "adapt-og-stack",
    draftId: "checkout-scrapbook-slots",
    variationSeed: "checkout-scrapbook-seed",
    now: NOW,
    message: "Three different archive moments.",
    senderName: "@flockfan",
  });
  const sources = [
    "data:image/jpeg;base64,/9j/2Q==",
    "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
    "data:image/jpeg;base64,/9j/7gABAgMEBQ==",
  ];
  for (const [index, source] of sources.entries()) {
    draft.photoSlots[index]!.asset = {
      id: `archive-upload-${index + 1}`,
      altText: `Archive photo ${index + 1}`,
      source: { kind: "embedded", origin: "upload", dataUrl: source },
    };
  }

  const rendered = renderPostcardCreative({
    id: "order-scrapbook-slots",
    recipientSlug: draft.recipientSlug,
    designId: draft.designId,
    message: draft.writing.message,
    senderName: draft.writing.senderName,
    variationSeed: draft.variationSeed,
    draft,
  });
  for (const source of sources) {
    assert.equal(rendered.front.split(source).length - 1, 1, `${source} must render in exactly one slot`);
  }
});
