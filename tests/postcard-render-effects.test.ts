import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import { MAIL_MEMBERS_BY_SLUG } from "../lib/fan-mail.ts";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import { createPostcardDraft, type PostcardDraft } from "../lib/postcard-draft.ts";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import { renderPostcardCreative } from "../lib/print-mail.ts";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import { postcardEffectStyleTokens, resolvePostcardScene } from "../lib/postcard-scene.ts";

// The application uses Next's automatic JSX runtime. The direct TSX import in
// this Node render test needs the classic global that tsx's preserve mode emits.
(globalThis as typeof globalThis & { React: typeof React }).React = React;

const EFFECT_INPUT = {
  id: "order_effect_parity",
  recipientSlug: "jason",
  message: "Thanks for the stream.",
  designId: "jason-side-quest",
  variationSeed: "effect-parity",
  returnAddress: {
    name: "Test Fan",
    line1: "123 Main St",
    city: "Los Angeles",
    state: "CA",
    zip: "90001",
  },
} as const;

function effectDraft(): PostcardDraft {
  return createPostcardDraft({
    recipientSlug: EFFECT_INPUT.recipientSlug,
    designId: EFFECT_INPUT.designId,
    variationSeed: EFFECT_INPUT.variationSeed,
    message: EFFECT_INPUT.message,
  });
}

async function renderPair(draft: PostcardDraft): Promise<{ preview: string; print: string }> {
  const { PostcardFrontFace } = await import("../components/fan-mail/PostcardFaces");
  const preview = renderToStaticMarkup(React.createElement(PostcardFrontFace, {
    recipient: MAIL_MEMBERS_BY_SLUG.jason!,
    designId: draft.designId,
    variationSeed: draft.variationSeed,
    draft,
  }));
  const print = renderPostcardCreative({ ...EFFECT_INPUT, draft }).front;
  return { preview, print };
}

test("every global effect slider resolves once and changes preview and physical HTML", async () => {
  const controls = [
    ["grain", "grain", "grainOpacity"],
    ["halftoneDotSize", "halftone", "halftoneDotSizePx"],
    ["scanlineDensity", "scanlines", "scanlinePeriodPx"],
    ["signalDistortion", "signal", "signalDistortionPx"],
    ["colorSeparation", "color-separation", "colorSeparationPx"],
    ["inkBleed", "ink-bleed", "inkBleedPx"],
    ["registrationOffset", "registration", "registrationOffsetPx"],
  ] as const;

  for (const [draftKey, marker, sceneKey] of controls) {
    const low = effectDraft();
    const high = effectDraft();
    if (draftKey === "grain") {
      low.visual.texture = "none";
      high.visual.texture = "none";
    }
    low.visual.effects[draftKey] = 0.15;
    high.visual.effects[draftKey] = 0.9;

    const lowScene = resolvePostcardScene(low);
    const highScene = resolvePostcardScene(high);
    assert.ok(lowScene && highScene);
    const lowValue = lowScene.visual.effects[sceneKey];
    const highValue = highScene.visual.effects[sceneKey];
    assert.notEqual(highValue, lowValue, `${draftKey} must change its canonical scene value`);

    const lowPair = await renderPair(low);
    const highPair = await renderPair(high);
    const lowData = `data-postcard-effect-${marker}=\"${lowValue}\"`;
    const highData = `data-postcard-effect-${marker}=\"${highValue}\"`;
    assert.ok(lowPair.preview.includes(lowData), `${draftKey} preview must use the canonical value`);
    assert.ok(lowPair.print.includes(lowData), `${draftKey} print must use the canonical value`);
    assert.ok(highPair.preview.includes(highData), `${draftKey} preview must update`);
    assert.ok(highPair.print.includes(highData), `${draftKey} print must update`);
    if (marker === "ink-bleed") {
      const shadow = postcardEffectStyleTokens(highScene).inkBleedShadow;
      assert.ok(shadow);
      assert.ok(highPair.preview.includes(`text-shadow:${shadow}`), "ink bleed must affect preview text");
      assert.ok(highPair.print.includes(`text-shadow:${shadow}`), "ink bleed must affect printed text");
    } else {
      const layer = `data-postcard-effect-layer=\"${marker === "signal" ? "signal-distortion" : marker}\"`;
      assert.ok(highPair.preview.includes(layer), `${draftKey} preview must contain a visual layer`);
      assert.ok(highPair.print.includes(layer), `${draftKey} print must contain a visual layer`);
    }
    assert.notEqual(lowPair.preview, highPair.preview, `${draftKey} must alter preview markup`);
    assert.notEqual(lowPair.print, highPair.print, `${draftKey} must alter physical markup`);
  }
});

test("per-photo duotone colors render in both preview and physical proof", async () => {
  const first = effectDraft();
  const second = effectDraft();
  first.photoSlots[0]!.adjustments.filterStrength = 0.7;
  first.photoSlots[0]!.adjustments.duotone = { shadow: "#20184b", highlight: "#67f3ff" };
  second.photoSlots[0]!.adjustments.filterStrength = 0.7;
  second.photoSlots[0]!.adjustments.duotone = { shadow: "#310606", highlight: "#ffe45c" };

  const firstPair = await renderPair(first);
  const secondPair = await renderPair(second);
  for (const output of [firstPair.preview, firstPair.print]) {
    assert.ok(output.includes('data-postcard-effect-layer="duotone"'));
    assert.ok(output.includes("#20184b"));
    assert.ok(output.includes("#67f3ff"));
    assert.ok(output.includes("opacity:0.7"));
  }
  assert.notEqual(firstPair.preview, secondPair.preview);
  assert.notEqual(firstPair.print, secondPair.print);
});
