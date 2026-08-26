import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createPostcardDraft } from "../lib/postcard-draft";
import {
  applyFanPostcardPackAsset,
  applyFanPostcardPackDesign,
  applyFanPostcardPackMotif,
  applyFanPostcardPackPalette,
  applyFanPostcardPhrase,
  projectFanPostcardPackCatalog,
  type FanPostcardAssetSource,
  type FanPostcardDropSource,
  type FanPostcardPackSource,
} from "../lib/postcard-fan-packs";
import {
  authorizeManagedPostcardAssetRecord,
  materializeManagedPostcardAssetSource,
  type ManagedPostcardAssetAuthorityRecord,
} from "../lib/postcard-managed-assets";
import { PostcardStudioActionSchema } from "../lib/postcard-studio-schema";
import { isMissingPostcardStudioSchema } from "../lib/postcard-fan-pack-store";

const PACK_ID = "11111111-1111-4111-8111-111111111111";
const REVISION_ID = "22222222-2222-4222-8222-222222222222";
const ASSET_ID = "33333333-3333-4333-8333-333333333333";
const DROP_ID = "44444444-4444-4444-8444-444444444444";
const NOW = "2026-08-21T16:00:00.000Z";

const config = {
  schemaVersion: 1,
  title: "NMS Night Shift",
  description: "Published by Jason's team.",
  palettes: [{
    id: "nms-night",
    label: "NMS Night",
    background: "#111111",
    surface: "#222222",
    ink: "#ffffff",
    mutedInk: "#aaaaaa",
    primary: "#fff300",
    secondary: "#7657ff",
    highlight: "#67f3ff",
  }],
  motifs: [{
    id: "quest-clear",
    label: "Quest clear",
    kind: "sticker",
    mark: "QUEST CLEAR",
    assetId: ASSET_ID,
    placements: ["top-right"],
  }],
  prompts: [{ id: "best-run", label: "Best run", question: "What was the best run?", placeholder: "That stream when…" }],
  phrases: [{ id: "gg", label: "GG", text: "GG — that stream was unreal.", category: "celebration" }],
  designs: [{
    id: "night-mvp",
    label: "Night MVP",
    description: "A creator-approved MVP card.",
    composition: "holographic-mvp",
    photoSlots: 1,
    fields: [{ key: "headline", label: "Headline", kind: "text", required: true, maxLength: 80, defaultValue: "NIGHT MVP" }],
    paletteIds: ["nms-night"],
    motifIds: ["quest-clear"],
    assetIds: [ASSET_ID],
    backgroundStyle: "radial",
    gradientDirection: 35,
    edgeTreatments: ["rounded"],
    frameStyles: ["collector"],
    attachmentStyles: ["photo-corners"],
  }],
} as const;

function packSource(overrides: Partial<FanPostcardPackSource> = {}): FanPostcardPackSource {
  return {
    packId: PACK_ID,
    revisionId: REVISION_ID,
    publishedRevisionId: REVISION_ID,
    memberSlug: "jason",
    packState: "active",
    revisionState: "published",
    slug: "nms-night-shift",
    title: "NMS Night Shift",
    description: "A creator pack.",
    contentHash: "a".repeat(64),
    publishedAt: "2026-08-20T12:00:00.000Z",
    config,
    ...overrides,
  };
}

function dropSource(overrides: Partial<FanPostcardDropSource> = {}): FanPostcardDropSource {
  return {
    id: DROP_ID,
    packId: PACK_ID,
    revisionId: REVISION_ID,
    memberSlug: "jason",
    code: "night-shift",
    title: "Night Shift",
    description: null,
    state: "scheduled",
    startsAt: "2026-08-21T15:00:00.000Z",
    endsAt: "2026-08-21T17:00:00.000Z",
    ...overrides,
  };
}

function assetSource(overrides: Partial<FanPostcardAssetSource> = {}): FanPostcardAssetSource {
  return {
    id: ASSET_ID,
    packId: PACK_ID,
    memberSlug: "jason",
    kind: "sticker",
    publicUrl: "https://media.thecoreboys.com/postcards/nms-night.webp",
    mime: "image/webp",
    width: 1200,
    height: 900,
    attribution: "NMS Studio",
    moderationState: "approved",
    rightsAttested: true,
    rightsSource: "original",
    ...overrides,
  };
}

test("fan pack projection exposes only recipient-scoped published packs and approved referenced assets", () => {
  const catalog = projectFanPostcardPackCatalog("jason", [
    packSource(),
    packSource({ packId: "55555555-5555-4555-8555-555555555555", memberSlug: "ron" }),
    packSource({ packId: "66666666-6666-4666-8666-666666666666", packState: "draft" }),
    packSource({ packId: "77777777-7777-4777-8777-777777777777", revisionState: "approved" }),
  ], [dropSource()], [
    assetSource(),
    assetSource({ id: "88888888-8888-4888-8888-888888888888", memberSlug: "ron" }),
    assetSource({ id: "99999999-9999-4999-8999-999999999999", moderationState: "quarantined" }),
  ], NOW);
  assert.equal(catalog.packs.length, 1);
  assert.equal(catalog.packs[0]?.recipientSlug, "jason");
  assert.deepEqual(catalog.packs[0]?.assets.map((asset) => asset.id), [ASSET_ID]);
  assert.equal(catalog.packs[0]?.designs[0]?.baseDesignId, "jason-holo-mvp");
});

test("fan pack projection includes only scheduled drops inside their current window", () => {
  const catalog = projectFanPostcardPackCatalog("jason", [packSource()], [
    dropSource(),
    dropSource({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", startsAt: "2026-08-21T17:01:00.000Z" }),
    dropSource({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", startsAt: "2026-08-20T12:00:00.000Z", endsAt: "2026-08-21T15:59:59.000Z" }),
    dropSource({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", state: "cancelled" }),
    dropSource({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", memberSlug: "ron" }),
  ], [assetSource()], NOW);
  assert.deepEqual(catalog.packs[0]?.activeDrops.map((drop) => drop.id), [DROP_ID]);
});

test("applying a published pack materializes safe palette, fields, marks, phrases, and approved artwork", () => {
  const pack = projectFanPostcardPackCatalog("jason", [packSource()], [dropSource()], [assetSource()], NOW).packs[0]!;
  const initial = createPostcardDraft({ recipientSlug: "jason", designId: "jason-rookie", now: NOW });
  const designed = applyFanPostcardPackDesign(initial, pack, "night-mvp");
  assert.equal(designed.designId, "jason-holo-mvp");
  assert.equal(designed.fields.headline, "NIGHT MVP");
  assert.equal(designed.visual.palette.primary, "#fff300");
  assert.equal(designed.visual.background.type, "radial-gradient");
  assert.equal(designed.visual.edge, "rounded");
  assert.equal(designed.photoSlots[0]?.attachment, "photo-corners");
  const recolored = applyFanPostcardPackPalette(designed, pack, "night-mvp", "nms-night");
  assert.equal(recolored.visual.palette.highlight, "#67f3ff");

  const marked = applyFanPostcardPackMotif(recolored, pack, "night-mvp", "quest-clear");
  assert.match(marked.fields.caption, /QUEST CLEAR/);
  const phrased = applyFanPostcardPhrase(marked, pack.phrases[0]);
  assert.match(phrased.writing.message, /GG/);
  assert.equal(phrased.writing.purpose, "congratulations");
  const withAsset = applyFanPostcardPackAsset(phrased, pack, "night-mvp", ASSET_ID, 0);
  assert.equal(withAsset.photoSlots[0]?.asset?.source.kind, "managed");
  assert.equal(withAsset.photoSlots[0]?.asset?.source.kind === "managed" ? withAsset.photoSlots[0].asset.source.assetId : null, ASSET_ID);
});

function authorityRecord(overrides: Partial<ManagedPostcardAssetAuthorityRecord> = {}): ManagedPostcardAssetAuthorityRecord {
  return {
    id: ASSET_ID,
    memberSlug: "jason",
    packId: PACK_ID,
    packState: "active",
    publishedRevisionId: REVISION_ID,
    revisionId: REVISION_ID,
    revisionState: "published",
    config,
    moderationState: "approved",
    rightsAttested: true,
    rightsSource: "original",
    publicUrl: "https://media.thecoreboys.com/postcards/nms-night.webp",
    mime: "image/webp",
    ...overrides,
  };
}

test("managed asset authority rejects cross-member, unapproved, retired, and unreferenced records", () => {
  const expected = { assetId: ASSET_ID, recipientSlug: "jason", designId: "jason-holo-mvp" };
  assert.ok(authorizeManagedPostcardAssetRecord(authorityRecord(), expected));
  assert.equal(authorizeManagedPostcardAssetRecord(authorityRecord({ memberSlug: "ron" }), expected), null);
  assert.equal(authorizeManagedPostcardAssetRecord(authorityRecord({ moderationState: "quarantined" }), expected), null);
  assert.equal(authorizeManagedPostcardAssetRecord(authorityRecord({ packState: "retired" }), expected), null);
  assert.equal(authorizeManagedPostcardAssetRecord(authorityRecord({ publicUrl: "javascript:alert(1)" }), expected), null);
  assert.equal(authorizeManagedPostcardAssetRecord(authorityRecord({ publicUrl: "https://unapproved.example/art.png" }), expected), null);
  assert.equal(authorizeManagedPostcardAssetRecord(authorityRecord(), { ...expected, designId: "jason-rookie" }), null);
});

test("managed checkout ignores a tampered preview URL and uses the server-authorized URL", async () => {
  let resolvedAssetId = "";
  let downloadedUrl = "";
  const result = await materializeManagedPostcardAssetSource({
    assetId: ASSET_ID,
    previewUrl: "https://evil.example/changed-after-preview.png",
  }, { recipientSlug: "jason", designId: "jason-holo-mvp" }, {
    resolve: async (assetId, recipientSlug, designId) => {
      resolvedAssetId = `${assetId}:${recipientSlug}:${designId}`;
      return { id: ASSET_ID, url: "https://media.thecoreboys.com/postcards/authority.png", mime: "image/png" };
    },
    download: async (asset) => {
      downloadedUrl = asset.url;
      return "data:image/png;base64,iVBORw0KGgo=";
    },
  });
  assert.equal(resolvedAssetId, `${ASSET_ID}:jason:jason-holo-mvp`);
  assert.equal(downloadedUrl, "https://media.thecoreboys.com/postcards/authority.png");
  assert.doesNotMatch(downloadedUrl, /evil\.example/);
  assert.match(result, /^data:image\/png;base64,/);
});

test("fan pack API and checkout both use server-scoped authority", () => {
  const api = readFileSync(join(process.cwd(), "app/api/postcard/packs/route.ts"), "utf8");
  const checkout = readFileSync(join(process.cwd(), "app/api/postcard/create-intent/route.ts"), "utf8");
  assert.match(api, /isPostcardPackRecipient/);
  assert.match(api, /loadFanPostcardPackCatalog\(recipientSlug\)/);
  assert.match(checkout, /materializeManagedPostcardAssetSource\(asset\.source/);
  assert.doesNotMatch(checkout, /submittedImage\s*=\s*asset\.source\.previewUrl/);
  assert.equal(isMissingPostcardStudioSchema({ code: "42P01" }), true);
  assert.equal(isMissingPostcardStudioSchema({ code: "42703" }), true);
  assert.equal(isMissingPostcardStudioSchema({ code: "28P01" }), false);
});

test("retirement uses the existing terminal pack state and cancels open drops", () => {
  assert.equal(PostcardStudioActionSchema.safeParse({ action: "retire_pack", packId: PACK_ID }).success, true);
  assert.equal(PostcardStudioActionSchema.safeParse({ action: "retire_pack", packId: PACK_ID, memberSlug: "jason" }).success, false);
  const store = readFileSync(join(process.cwd(), "lib/postcard-studio-store.ts"), "utf8");
  assert.match(store, /SET state = 'retired', published_revision_id = NULL/);
  assert.match(store, /SET state = 'cancelled',[\s\S]*state IN \('draft', 'scheduled'\)/);
});
