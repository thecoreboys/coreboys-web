import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import { MAIL_MEMBERS_BY_SLUG } from "../lib/fan-mail.ts";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import { POSTCARD_IDENTITIES } from "../lib/postcard-identities.ts";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import { resolvePostcardProviderMode } from "../lib/postcard-mode.ts";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import { validatePostcardInput, validatePostcardSchedule } from "../lib/postcard.ts";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import { createPostcardDraft } from "../lib/postcard-draft.ts";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import * as printMail from "../lib/print-mail.ts";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import { MAX_POSTCARD_SIGNATURE_BYTES, normalizePostcardImage, normalizePostcardSignature } from "../lib/postcard-image.ts";

const {
  LOB_POSTAL_CLEAR_ZONE,
  createPostcardCreativeSnapshot,
  renderPostcardCreative,
  sendPostcard,
} = printMail;

const baseInput = {
  id: "order_01J_SAFE",
  recipientSlug: "ron",
  message: "Thanks for the streams!",
  designId: "ron-breaking-live",
  variationSeed: "seed_01J_SAFE",
  returnAddress: {
    name: "Test Fan",
    line1: "123 Main St",
    city: "Los Angeles",
    state: "CA",
    zip: "90001",
  },
};

test("provider mode matrix fails closed for partial, mixed, and unknown keys", () => {
  assert.deepEqual(resolvePostcardProviderMode({}), { ok: true, mode: "sandbox" });
  assert.equal(resolvePostcardProviderMode({ NODE_ENV: "production" }).ok, false);
  assert.deepEqual(
    resolvePostcardProviderMode({
      STRIPE_SECRET_KEY: "sk_test_example",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_example",
      STRIPE_WEBHOOK_SECRET: "whsec_example",
      LOB_API_KEY: "test_example",
    }),
    { ok: true, mode: "test" },
  );
  assert.deepEqual(
    resolvePostcardProviderMode({
      STRIPE_SECRET_KEY: "sk_live_example",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_example",
      STRIPE_WEBHOOK_SECRET: "whsec_example",
      LOB_API_KEY: "live_example",
    }),
    { ok: true, mode: "live" },
  );
  for (const environment of [
    { STRIPE_SECRET_KEY: "sk_live_example" },
    { LOB_API_KEY: "live_example" },
    { STRIPE_SECRET_KEY: "sk_test_example", LOB_API_KEY: "live_example" },
    { STRIPE_SECRET_KEY: "sk_live_example", LOB_API_KEY: "test_example" },
    { STRIPE_SECRET_KEY: "garbage", LOB_API_KEY: "live_example" },
    { STRIPE_SECRET_KEY: "sk_live_example", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_example", STRIPE_WEBHOOK_SECRET: "whsec_example", LOB_API_KEY: "live_example" },
    { STRIPE_SECRET_KEY: "sk_live_example", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_example", LOB_API_KEY: "live_example" },
  ]) {
    assert.equal(resolvePostcardProviderMode(environment).ok, false);
  }
});

test("scheduled mail accepts only future calendar days within 180 days", () => {
  const now = new Date("2026-08-21T23:00:00.000Z");
  assert.equal(validatePostcardSchedule(null, now).ok, true);
  assert.equal(validatePostcardSchedule("2026-08-21T23:30:00.000Z", now).ok, false);
  assert.equal(validatePostcardSchedule("2026-08-22T00:00:00.000Z", now).ok, true);
  assert.equal(validatePostcardSchedule("2027-02-17T00:00:00.000Z", now).ok, true);
  assert.equal(validatePostcardSchedule("2027-02-18T00:00:00.000Z", now).ok, false);
});

test("validation scopes templates and accepts only matching raster upload data", () => {
  assert.equal(validatePostcardInput(baseInput).ok, true);
  assert.equal(validatePostcardInput({ ...baseInput, message: Array(11).fill("line").join("\n") }).ok, false);
  assert.equal(validatePostcardInput({ ...baseInput, designId: "jason-rookie" }).ok, false);
  assert.equal(validatePostcardInput({ ...baseInput, imageDataUrl: "https://example.com/art.jpg" }).ok, false);
  assert.equal(
    validatePostcardInput({ ...baseInput, imageDataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" }).ok,
    false,
  );
  assert.equal(
    validatePostcardInput({ ...baseInput, imageDataUrl: "data:image/png;base64,/9j/4AAQSkZJRg==" }).ok,
    false,
  );
  assert.equal(
    validatePostcardInput({
      ...baseInput,
      returnAddress: { line1: "123 Main", city: "Los Angeles", state: "California", zip: "nope" },
    }).ok,
    false,
  );
});

test("uploaded art is decoded, metadata-stripped, and normalized to a bounded JPEG", async () => {
  const source = await sharp({
    create: { width: 32, height: 48, channels: 3, background: "#db0368" },
  }).png().withMetadata({ orientation: 6 }).toBuffer();
  const normalized = await normalizePostcardImage(`data:image/png;base64,${source.toString("base64")}`);
  assert.ok(normalized?.startsWith("data:image/jpeg;base64,"));
  const output = Buffer.from(normalized!.split(",")[1]!, "base64");
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, 48);
  assert.equal(metadata.height, 32);
  assert.equal(metadata.exif, undefined);
  assert.ok(output.length <= 650_000);
});

test("background-removed art and private signatures preserve bounded alpha", async () => {
  const transparent = await sharp({
    create: { width: 600, height: 160, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: Buffer.from('<svg width="600" height="160"><path d="M20 100 Q180 10 320 100 T580 70" fill="none" stroke="#141414" stroke-width="8"/></svg>') }])
    .png()
    .withMetadata({ density: 144 })
    .toBuffer();
  const dataUrl = `data:image/png;base64,${transparent.toString("base64")}`;

  const art = await normalizePostcardImage(dataUrl, { preserveAlpha: true });
  assert.ok(art?.startsWith("data:image/png;base64,"));
  const artMetadata = await sharp(Buffer.from(art!.split(",")[1]!, "base64")).metadata();
  assert.equal(artMetadata.hasAlpha, true);
  assert.equal(artMetadata.exif, undefined);

  const signature = await normalizePostcardSignature(dataUrl);
  assert.ok(signature?.startsWith("data:image/png;base64,"));
  const signatureBytes = Buffer.from(signature!.split(",")[1]!, "base64");
  const signatureMetadata = await sharp(signatureBytes).metadata();
  assert.equal(signatureMetadata.format, "png");
  assert.equal(signatureMetadata.hasAlpha, true);
  assert.ok((signatureMetadata.width ?? 0) <= 800);
  assert.ok((signatureMetadata.height ?? 0) <= 240);
  assert.equal(signatureMetadata.exif, undefined);
  assert.ok(signatureBytes.length <= MAX_POSTCARD_SIGNATURE_BYTES);

  const signedDraft = createPostcardDraft({
    recipientSlug: "ron",
    designId: baseInput.designId,
    variationSeed: baseInput.variationSeed,
    message: baseInput.message,
  });
  signedDraft.writing.signatureDataUrl = signature;
  const signed = renderPostcardCreative({ ...baseInput, id: "order_signed", draft: signedDraft });
  assert.ok(signed.back.includes('class="private-signature"'));
  assert.ok(signed.back.includes(signature!));

  await assert.rejects(
    () => normalizePostcardSignature(`data:image/png;base64,${Buffer.from("not a png").toString("base64")}`),
    /does not match PNG/,
  );
});

test("all creator archetypes render deterministically with the exact postal clear zone", () => {
  const frontDocuments = new Set<string>();
  for (const identity of POSTCARD_IDENTITIES) {
    const input = {
      ...baseInput,
      id: `order_${identity.slug}`,
      recipientSlug: identity.slug,
      designId: identity.frontDesigns[2]!.id,
      variationSeed: `seed_${identity.slug}`,
      message: `A safe note for ${identity.creatorName} <script>alert(1)</script>`,
    };
    const first = renderPostcardCreative(input);
    const second = renderPostcardCreative(input);
    assert.deepEqual(second, first);
    assert.equal(first.identityId, identity.slug);
    assert.equal(first.templateId, input.designId);
    assert.match(first.front, new RegExp(`data-archetype="${identity.archetype}"`));
    assert.ok(!first.back.includes("<script>alert(1)</script>"));
    assert.ok(first.back.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
    assert.ok(first.back.includes(`left:${LOB_POSTAL_CLEAR_ZONE.leftIn}in`));
    assert.ok(first.back.includes(`top:${LOB_POSTAL_CLEAR_ZONE.topIn}in`));
    assert.ok(first.back.includes(`width:${LOB_POSTAL_CLEAR_ZONE.widthIn}in`));
    assert.ok(first.back.includes(`height:${LOB_POSTAL_CLEAR_ZONE.heightIn}in`));
    assert.ok(first.back.includes(`Prepared for ${MAIL_MEMBERS_BY_SLUG[identity.slug]!.mailRecipient}`));
    frontDocuments.add(first.front);
  }
  assert.equal(frontDocuments.size, POSTCARD_IDENTITIES.length);
});

test("all twenty templates honor their composition and declared photo-slot count", () => {
  const anatomyMarker: Record<string, string> = {
    "lower-third": '<section class="lower">',
    "full-frame-alert": '<section class="alert-copy">',
    "night-vision-monitor": '<section class="monitor">',
    "split-screen-recap": '<section class="replay-grid">',
    "rookie-card": '<figure class="rookie-photo">',
    "stat-leader": '<figure class="stat-photo">',
    "quest-card": '<section class="quest-copy">',
    "holographic-mvp": '<section class="holo-frame">',
    "banner-headline": '<div class="lead">',
    "sports-extra": '<div class="sports-grid">',
    "classified-collage": '<div class="classified-grid">',
    "late-edition-photo": '<small>PHOTO DESK EXCLUSIVE',
    "cover-story": '<div class="volume">',
    "street-style-cover": '<p class="vertical">',
    "match-day-editorial": '<b>QUIET ANALYSIS</b>',
    "noir-profile": '<small>M3 / NOIR PROFILE</small>',
    "polaroid-stack": '<span class="field">FLOCK FIELD NOTES</span>',
    "contact-sheet": '<div class="contact-grid">',
    "tour-notes": '<svg class="route"',
    "archive-folder": '<section class="folder">',
  };

  for (const identity of POSTCARD_IDENTITIES) {
    for (const design of identity.frontDesigns) {
      const rendered = renderPostcardCreative({
        ...baseInput,
        id: `order_${design.id}`,
        recipientSlug: identity.slug,
        designId: design.id,
        variationSeed: `seed_${design.id.replaceAll("-", "_")}`,
      });
      assert.ok(rendered.front.includes(`data-composition="${design.composition}"`));
      assert.ok(rendered.front.includes(`data-print-layout="${design.composition}"`));
      assert.ok(rendered.front.includes(`data-photo-slots="${design.photoSlots}"`));
      assert.ok(
        rendered.front.includes(anatomyMarker[design.composition]!),
        `${design.id} must render the dedicated ${design.composition} print anatomy`,
      );
      assert.ok(!rendered.front.includes("photo-slot-deck"));
      assert.ok(!rendered.front.includes("composition-detail"));
      const portraitUrl = `https://media.thecoreboys.com${identity.media.portrait}`;
      assert.equal(rendered.front.split(portraitUrl).length - 1, design.photoSlots);
    }
  }
});

test("multi-slot print crops match the deterministic screen crop sequence", () => {
  const rendered = renderPostcardCreative({
    ...baseInput,
    id: "order_replay_crop_parity",
    designId: "ron-instant-replay",
    variationSeed: "seed_replay_crop_parity",
  });
  const crops = ["50% 34%", "30% 42%", "72% 38%", "46% 68%", "78% 66%", "24% 70%"];
  for (let index = 0; index < 4; index += 1) {
    const expected = crops[(rendered.variation.seedHash + index * 5) % crops.length]!;
    assert.ok(rendered.front.includes(`object-position:${expected}`));
  }
});

test("stored creative snapshots are verified and cannot silently drift", () => {
  const rendered = renderPostcardCreative(baseInput);
  const identity = POSTCARD_IDENTITIES[0]!;
  const stored = {
    identityId: rendered.identityId,
    identityVersion: rendered.variation.catalogVersion,
    archetypeId: rendered.archetypeId,
    templateId: rendered.templateId,
    rendererVersion: 1,
    variationAlgorithmVersion: rendered.variation.algorithmVersion,
    resolvedVariation: rendered.variation,
  };
  assert.deepEqual(renderPostcardCreative(baseInput, stored), rendered);
  const jsonbStyleVariation = Object.fromEntries(
    Object.entries(rendered.variation).reverse(),
  ) as typeof rendered.variation;
  assert.deepEqual(
    renderPostcardCreative(baseInput, { ...stored, resolvedVariation: jsonbStyleVariation }),
    rendered,
  );
  assert.throws(
    () => renderPostcardCreative(baseInput, { ...stored, identityId: identity.slug === "ron" ? "jason" : "ron" }),
    /refusing to alter paid mail/,
  );
  assert.throws(
    () => renderPostcardCreative(baseInput, { ...stored, rendererVersion: 999 }),
    /refusing to alter paid mail/,
  );
});

test("paid creative snapshots are byte-stable and reject tampering", async () => {
  const first = createPostcardCreativeSnapshot(baseInput);
  const second = createPostcardCreativeSnapshot(baseInput);
  assert.deepEqual(second, first);
  assert.match(first.creativeHash, /^[0-9a-f]{64}$/);

  await assert.rejects(
    () => sendPostcard(baseInput, "sandbox", {
      ...first,
      frontHtml: `${first.frontHtml}\n<!-- changed after checkout -->`,
    }),
    /hash did not verify/,
  );
});

test("Lob request contains operational mail fields and order idempotency", { concurrency: false }, async () => {
  const previousStripe = process.env.STRIPE_SECRET_KEY;
  const previousPublishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const previousWebhook = process.env.STRIPE_WEBHOOK_SECRET;
  const previousLob = process.env.LOB_API_KEY;
  const previousScheduled = process.env.LOB_SCHEDULED_MAIL_ENABLED;
  const previousFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;
  process.env.STRIPE_SECRET_KEY = "sk_test_example";
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_example";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_example";
  process.env.LOB_API_KEY = "test_example";
  globalThis.fetch = async (_input, init) => {
    capturedInit = init;
    return new Response(JSON.stringify({ id: "psc_test_123", url: "https://example.invalid/proof" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const creative = createPostcardCreativeSnapshot(baseInput);
    const result = await sendPostcard(baseInput, "test", creative);
    assert.equal(result.id, "psc_test_123");
    assert.equal(result.mode, "test");
    assert.equal(result.live, false);
    assert.equal(result.status, "proof");
    assert.equal(new Headers(capturedInit?.headers).get("Idempotency-Key"), baseInput.id);
    const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
    assert.equal(body.mail_type, "usps_first_class");
    assert.equal(body.use_type, "operational");
    assert.equal(body.size, "4x6");
    assert.equal("send_date" in body, false);
    assert.equal((body.to as Record<string, unknown>).name, "StableRonaldo");
    assert.ok(String(body.front).includes('data-archetype="broadcast-freeze-frame"'));

    process.env.LOB_SCHEDULED_MAIL_ENABLED = "true";
    const scheduledFor = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString();
    const draft = createPostcardDraft({
      recipientSlug: "ron",
      designId: baseInput.designId,
      variationSeed: baseInput.variationSeed,
      message: baseInput.message,
    });
    draft.writing.scheduledFor = scheduledFor;
    const scheduledInput = { ...baseInput, id: "order_scheduled", draft };
    const scheduledCreative = createPostcardCreativeSnapshot(scheduledInput);
    await sendPostcard(scheduledInput, "test", scheduledCreative);
    const scheduledBody = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
    assert.equal(scheduledBody.send_date, scheduledFor.slice(0, 10));
  } finally {
    if (previousStripe === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousStripe;
    if (previousPublishable === undefined) delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = previousPublishable;
    if (previousWebhook === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previousWebhook;
    if (previousLob === undefined) delete process.env.LOB_API_KEY;
    else process.env.LOB_API_KEY = previousLob;
    if (previousScheduled === undefined) delete process.env.LOB_SCHEDULED_MAIL_ENABLED;
    else process.env.LOB_SCHEDULED_MAIL_ENABLED = previousScheduled;
    globalThis.fetch = previousFetch;
  }
});
