"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { cn } from "@/lib/utils";
import {
  POSTCARD_LIMITS,
  computePriceCents,
  formatPrice,
  type ReturnAddress,
} from "@/lib/postcard";
import {
  postcardDesignsFor,
  postcardIdentityFor,
  type PostcardArchetype,
} from "@/lib/postcard-identities";
import {
  retargetPostcardDraft,
  type PostcardDraft,
  type PostcardPhotoSlot,
} from "@/lib/postcard-draft";
import {
  FanPostcardPackCatalogSchema,
  applyFanPostcardPackAsset,
  applyFanPostcardPackDesign,
  applyFanPostcardPackMotif,
  applyFanPostcardPackPalette,
  applyFanPostcardPhrase,
  type FanPostcardPack,
  type FanPostcardPackCatalog,
} from "@/lib/postcard-fan-packs";
import { usePostcardDraftEditor } from "@/hooks/usePostcardDraftEditor";
import type { MailMember } from "@/lib/fan-mail";
import { PostcardPreview } from "./PostcardPreview";
import {
  PostcardEditorPanels,
  type PostcardMomentOption,
} from "./PostcardEditorPanels";
import {
  PostcardCheckout,
  clearPostcardCheckoutContext,
  isOrderId,
  isPaymentIntentClientSecret,
  readPostcardCheckoutContext,
} from "./PostcardCheckout";
import { PostcardCollectiblePicker } from "./PostcardCollectiblePicker";

type Step = "customize" | "pay" | "restoring" | "sent";
export type PostcardStudioProviderMode = "sandbox" | "test" | "live" | "unavailable";
type ActiveProviderMode = Exclude<PostcardStudioProviderMode, "unavailable">;

const PRINT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MESSAGE_LINES_ERROR = `Your message can have at most ${POSTCARD_LIMITS.messageLines} lines.`;
const POLLING_STOP_STATUSES = new Set([
  "review",
  "refunded",
  "proof",
  "printing",
  "mailed",
  "sent",
  "failed",
]);

type CreateIntentResponse =
  | { sandbox: true; orderId: string; statusToken: string; amountCents: number; status: string; providerMode?: "sandbox" }
  | { clientSecret: string; orderId: string; statusToken: string; amountCents: number; providerMode: "test" | "live" }
  | { error: string };

export function PostcardStudio({
  members,
  initialRecipient,
  providerMode,
  scheduledMailEnabled,
}: {
  members: readonly MailMember[];
  initialRecipient?: string;
  providerMode: PostcardStudioProviderMode;
  scheduledMailEnabled: boolean;
}) {
  const initialRecipientSlug =
    members.find((member) => member.slug === initialRecipient)?.slug ?? members[0]?.slug ?? "";
  const initialIdentitySlug = postcardIdentityFor(initialRecipientSlug)?.slug ?? "ron";
  const initialDesignId = postcardDesignsFor(initialIdentitySlug)[0]?.id ?? "";
  const editor = usePostcardDraftEditor({
    recipientSlug: initialIdentitySlug,
    designId: initialDesignId,
  });
  const { draft, commit: commitDraft } = editor;
  const recipientSlug = draft.recipientSlug;
  const designId = draft.designId;
  const message = draft.writing.message;
  const senderName = draft.writing.senderName;
  const variationSeed = draft.variationSeed;
  const imageDataUrl = firstEmbeddedImage(draft);
  const [step, setStep] = useState<Step>("customize");
  const [activePromptId, setActivePromptId] = useState<string | null>(null);
  const [showReturn, setShowReturn] = useState(false);
  const [ret, setRet] = useState<ReturnAddress>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [statusToken, setStatusToken] = useState<string | null>(null);
  const [checkoutAmountCents, setCheckoutAmountCents] = useState<number | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const [sandbox, setSandbox] = useState(false);
  const [fulfillmentStatus, setFulfillmentStatus] = useState<string | null>(null);
  const [orderProviderMode, setOrderProviderMode] = useState<ActiveProviderMode | null>(
    providerMode === "unavailable" ? null : providerMode,
  );
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [moments, setMoments] = useState<PostcardMomentOption[]>([]);
  const [packCatalog, setPackCatalog] = useState<FanPostcardPackCatalog | null>(null);
  const [activePackId, setActivePackId] = useState<string | null>(null);
  const [activePackDesignId, setActivePackDesignId] = useState<string | null>(null);
  const designSelectionsRef = useRef<Record<string, string>>(
    initialIdentitySlug && initialDesignId ? { [initialIdentitySlug]: initialDesignId } : {},
  );
  const selectRecipient = useCallback((slug: string) => {
    if (!members.some((member) => member.slug === slug)) return;
    const identitySlug = postcardIdentityFor(slug)?.slug;
    if (!identitySlug) return;
    const scopedDesigns = postcardDesignsFor(identitySlug);
    const remembered = designSelectionsRef.current[slug];
    const nextDesign = scopedDesigns.find((design) => design.id === remembered) ?? scopedDesigns[0];
    if (!nextDesign) return;
    commitDraft((current) => retargetPostcardDraft(current, {
      recipientSlug: identitySlug,
      designId: nextDesign.id,
    }));
  }, [commitDraft, members]);

  useEffect(() => {
    const requestedRecipient = new URLSearchParams(globalThis.location.search).get("recipient");
    if (requestedRecipient) selectRecipient(requestedRecipient);
  }, [selectRecipient]);

  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      void fetch("/api/postcard/moments", { signal: controller.signal })
        .then((response) => response.ok ? response.json() as Promise<{ moments?: PostcardMomentOption[] }> : null)
        .then((payload) => {
          if (payload?.moments) setMoments(payload.moments.slice(0, 60));
        })
        .catch(() => undefined);
    };
    if ("requestIdleCallback" in globalThis) {
      const handle = globalThis.requestIdleCallback(load, { timeout: 2_000 });
      return () => {
        controller.abort();
        globalThis.cancelIdleCallback(handle);
      };
    }
    const handle = globalThis.setTimeout(load, 500);
    return () => {
      controller.abort();
      globalThis.clearTimeout(handle);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setPackCatalog(null);
    setActivePackId(null);
    setActivePackDesignId(null);
    void fetch(`/api/postcard/packs?recipient=${encodeURIComponent(recipientSlug)}`, {
      signal: controller.signal,
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const parsed = FanPostcardPackCatalogSchema.safeParse(await response.json());
        return parsed.success && parsed.data.recipientSlug === recipientSlug ? parsed.data : null;
      })
      .then((catalog) => {
        if (!catalog || controller.signal.aborted) return;
        setPackCatalog(catalog);
        const firstPack = catalog.packs[0];
        setActivePackId(firstPack?.packId ?? null);
        setActivePackDesignId(firstPack?.designs[0]?.id ?? null);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [recipientSlug]);

  useEffect(() => {
    const returnUrl = new URL(globalThis.location.href);
    if (returnUrl.searchParams.get("checkout") !== "return") return;

    const returnedOrderId = returnUrl.searchParams.get("order") ?? "";
    const returnedClientSecret = returnUrl.searchParams.get("payment_intent_client_secret") ?? "";
    const context = readPostcardCheckoutContext();
    cleanCheckoutReturnUrl(returnUrl);

    if (
      !isOrderId(returnedOrderId)
      || !isPaymentIntentClientSecret(returnedClientSecret)
      || !context
      || context.orderId !== returnedOrderId
      || context.clientSecret !== returnedClientSecret
      || !members.some((member) => member.slug === context.recipientSlug)
    ) {
      clearPostcardCheckoutContext();
      setError("This payment return could not be restored securely. No postcard was submitted from this page.");
      return;
    }

    let cancelled = false;
    selectRecipient(context.recipientSlug);
    setOrderId(context.orderId);
    setStatusToken(context.statusToken);
    setClientSecret(context.clientSecret);
    setCheckoutAmountCents(context.amountCents);
    setCheckoutNotice(null);
    setStep("restoring");

    void pollPostcardStatus(context.orderId, context.statusToken, "created").then((result) => {
      if (cancelled) return;
      const restoredMode = result.providerMode
        ?? (providerMode === "unavailable" ? null : providerMode);
      setOrderProviderMode(restoredMode);
      setFulfillmentStatus(result.status);
      setProofUrl(
        result.status === "proof" && restoredMode === "test"
          ? safeProofUrl(result.proofUrl)
          : null,
      );

      if (isPaidOrLaterStatus(result.status)) {
        clearPostcardCheckoutContext(context.orderId);
        setStep("sent");
        return;
      }

      setCheckoutNotice(
        "Stripe has not confirmed a successful payment yet. Nothing has been printed or mailed.",
      );
      setStep("pay");
    });

    return () => {
      cancelled = true;
    };
  }, [members, providerMode, selectRecipient]);

  const recipient = useMemo(
    () => members.find((m) => m.slug === recipientSlug) ?? null,
    [members, recipientSlug],
  );
  const identity = useMemo(() => postcardIdentityFor(recipientSlug), [recipientSlug]);
  const designs = useMemo(() => postcardDesignsFor(recipientSlug), [recipientSlug]);
  const publishedPacks = packCatalog?.recipientSlug === recipientSlug ? packCatalog.packs : [];
  const activePack = publishedPacks.find((pack) => pack.packId === activePackId) ?? null;
  const activePackDesign = activePack?.designs.find((design) => design.id === activePackDesignId)
    ?? activePack?.designs[0]
    ?? null;
  const availablePrompts = useMemo(() => [
    ...(identity?.copy.prompts ?? []),
    ...(activePack?.prompts ?? []),
  ], [activePack?.prompts, identity?.copy.prompts]);
  const activePrompt = useMemo(
    () => availablePrompts.find((prompt) => prompt.id === activePromptId) ?? null,
    [activePromptId, availablePrompts],
  );
  const hasCustomArt = draft.photoSlots.some((slot) => Boolean(slot.asset))
    || Boolean(draft.writing.signatureDataUrl);
  const amountCents = computePriceCents(hasCustomArt);
  const remaining = POSTCARD_LIMITS.message - message.length;
  const messageLineCount = countMessageLines(message);

  useEffect(() => {
    designSelectionsRef.current[recipientSlug] = designId;
  }, [designId, recipientSlug]);

  useEffect(() => {
    setActivePromptId(null);
  }, [recipientSlug]);

  const onPickFile = useCallback(async (
    position: number,
    file: File,
    origin: "upload" | "clipboard" | "camera" = "upload",
  ) => {
    setError(null);
    if (!PRINT_IMAGE_TYPES.has(file.type)) {
      setError("Use a JPG, PNG, or WebP image.");
      return;
    }
    try {
      const dataUrl = await resizeToDataUrl(file, 1875, POSTCARD_LIMITS.imageBytes);
      commitDraft((current) => updateDraftSlot(current, position, (slot) => ({
        ...slot,
        asset: {
          id: createDraftAssetId(position),
          altText: `Custom photo ${position + 1}`,
          source: { kind: "embedded", origin, dataUrl },
        },
      })));
    } catch {
      setError("Couldn't read that image — try another.");
    }
  }, [commitDraft]);

  const onAutoRemoveBackground = useCallback(async (position: number) => {
    const slot = draft.photoSlots.find((candidate) => candidate.position === position);
    if (slot?.asset?.source.kind !== "embedded") return;
    setError(null);
    try {
      const processed = await makeAutomaticCutout(slot.asset.source.dataUrl);
      commitDraft((current) => updateDraftSlot(current, position, (currentSlot) => {
        if (currentSlot.asset?.source.kind !== "embedded") return currentSlot;
        return {
          ...currentSlot,
          asset: {
            ...currentSlot.asset,
            source: { ...currentSlot.asset.source, dataUrl: processed },
          },
          adjustments: { ...currentSlot.adjustments, backgroundRemoved: true },
        };
      }));
    } catch {
      setError("Background removal could not process that photo. Try a clearer subject or another image.");
    }
  }, [commitDraft, draft.photoSlots]);

  const onSampleAccent = useCallback(async (position: number) => {
    const slot = draft.photoSlots.find((candidate) => candidate.position === position);
    if (slot?.asset?.source.kind !== "embedded") return;
    try {
      const accent = await sampleImageAccent(slot.asset.source.dataUrl);
      commitDraft((current) => ({
        ...current,
        visual: {
          ...current.visual,
          palettePresetId: null,
          palette: {
            ...current.visual.palette,
            primary: accent,
            highlight: accent,
            sampleAccentFromSlotId: slot.id,
          },
        },
      }));
    } catch {
      setError("Couldn't sample a color from that photo.");
    }
  }, [commitDraft, draft.photoSlots]);

  const onSuggestFaceCrop = useCallback(async (position: number) => {
    const slot = draft.photoSlots.find((candidate) => candidate.position === position);
    const source = slot ? draftSlotPreview(slot) : null;
    if (!source) return;
    setError(null);
    try {
      const suggestion = await suggestFaceAwareCrop(source);
      commitDraft((current) => updateDraftSlot(current, position, (currentSlot) => ({
        ...currentSlot,
        focalPoint: suggestion.focalPoint,
        zoom: Math.max(currentSlot.zoom, suggestion.zoom),
      })));
    } catch {
      setError("A face-aware crop was not available for this photo. You can still set the focal point manually.");
    }
  }, [commitDraft, draft.photoSlots]);

  const onSuggestHorizon = useCallback(async (position: number) => {
    const slot = draft.photoSlots.find((candidate) => candidate.position === position);
    const source = slot ? draftSlotPreview(slot) : null;
    if (!source) return;
    setError(null);
    try {
      const rotationDeg = await suggestHorizonCorrection(source);
      commitDraft((current) => updateDraftSlot(current, position, (currentSlot) => ({
        ...currentSlot,
        rotationDeg,
      })));
    } catch {
      setError("A clear horizon was not found. Rotation remains available in Fine tune.");
    }
  }, [commitDraft, draft.photoSlots]);

  function selectPublishedPack(pack: FanPostcardPack) {
    if (pack.recipientSlug !== recipientSlug) return;
    setActivePackId(pack.packId);
    setActivePackDesignId(pack.designs[0]?.id ?? null);
    setActivePromptId(null);
  }

  function applyPublishedPackDesign(pack: FanPostcardPack, packDesignId: string) {
    try {
      const packDesign = pack.designs.find((candidate) => candidate.id === packDesignId);
      if (!packDesign) return;
      designSelectionsRef.current[recipientSlug] = packDesign.baseDesignId;
      commitDraft((current) => applyFanPostcardPackDesign(current, pack, packDesignId));
      setActivePackId(pack.packId);
      setActivePackDesignId(packDesignId);
      setError(null);
    } catch (packError) {
      setError(packError instanceof Error ? packError.message : "This creator design could not be applied.");
    }
  }

  function applyPublishedPackAsset(pack: FanPostcardPack, packDesignId: string, assetId: string, position: number) {
    try {
      commitDraft((current) => applyFanPostcardPackAsset(current, pack, packDesignId, assetId, position));
      setError(null);
    } catch (packError) {
      setError(packError instanceof Error ? packError.message : "This creator artwork could not be applied.");
    }
  }

  function applyPublishedPackMotif(pack: FanPostcardPack, packDesignId: string, motifId: string) {
    try {
      commitDraft((current) => applyFanPostcardPackMotif(current, pack, packDesignId, motifId));
      setError(null);
    } catch (packError) {
      setError(packError instanceof Error ? packError.message : "This creator mark could not be applied.");
    }
  }

  function applyPublishedPackPalette(pack: FanPostcardPack, packDesignId: string, paletteId: string) {
    try {
      commitDraft((current) => applyFanPostcardPackPalette(current, pack, packDesignId, paletteId));
      setError(null);
    } catch (packError) {
      setError(packError instanceof Error ? packError.message : "This creator palette could not be applied.");
    }
  }

  async function onContinue() {
    setError(null);
    const msg = message.trim();
    if (!recipient) return setError("Pick who you're sending to.");
    if (msg.length < 2) return setError("Write a message first.");
    if (msg.length > POSTCARD_LIMITS.message) return setError("Your message is a little too long.");
    if (countMessageLines(msg) > POSTCARD_LIMITS.messageLines) {
      return setError(`Your message can have at most ${POSTCARD_LIMITS.messageLines} lines.`);
    }
    if (providerMode === "unavailable") {
      return setError("Postcard checkout is currently unavailable. Your preview is still safe here.");
    }

    setBusy(true);
    try {
      const stableVariationSeed = variationSeed || createVariationSeed();
      const checkoutDraft: PostcardDraft = {
        ...draft,
        variationSeed: stableVariationSeed,
        writing: {
          ...draft.writing,
          message: msg,
          senderName: senderName.trim(),
        },
      };
      const res = await fetch("/api/postcard/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientSlug,
          message: msg,
          designId,
          imageDataUrl,
          senderName: senderName.trim() || undefined,
          returnAddress: hasReturn(ret) ? ret : null,
          variationSeed: stableVariationSeed,
          draft: checkoutDraft,
          collectibleSelection: checkoutDraft.collectible.releaseId && checkoutDraft.collectible.variantId
            ? {
                releaseId: checkoutDraft.collectible.releaseId,
                variantId: checkoutDraft.collectible.variantId,
                bundle: {
                  mode: "single",
                  sendQuantity: 1,
                  keepQuantity: 0,
                  inventoryQuantity: 1,
                },
              }
            : null,
        }),
      });
      const data = (await res.json()) as CreateIntentResponse;
      if (!res.ok || "error" in data) {
        setError(("error" in data && data.error) || "Something went wrong. Try again.");
        setBusy(false);
        return;
      }
      if ("sandbox" in data) {
        setOrderId(data.orderId);
        setStatusToken(data.statusToken);
        setCheckoutAmountCents(data.amountCents);
        setSandbox(true);
        setOrderProviderMode("sandbox");
        setFulfillmentStatus(data.status);
        setStep("sent");
        setBusy(false);
        return;
      }
      setClientSecret(data.clientSecret);
      setOrderId(data.orderId);
      setStatusToken(data.statusToken);
      setCheckoutAmountCents(data.amountCents);
      setOrderProviderMode(data.providerMode);
      setCheckoutNotice(null);
      setFulfillmentStatus("created");
      setStep("pay");
      setBusy(false);
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
    }
  }

  const onPaid = useCallback(async () => {
    if (!orderId || !statusToken) {
      setError("Payment succeeded, but the order context is missing. Keep your payment receipt for support.");
      setStep("customize");
      return;
    }
    const result = await pollPostcardStatus(orderId, statusToken, "paid");
    const resolvedMode = result.providerMode ?? orderProviderMode;
    setOrderProviderMode(resolvedMode);
    setFulfillmentStatus(result.status);
    setProofUrl(
      result.status === "proof" && resolvedMode === "test" ? safeProofUrl(result.proofUrl) : null,
    );
    setStep("sent");
  }, [orderId, orderProviderMode, statusToken]);

  function reset() {
    setStep("customize");
    setActivePromptId(null);
    editor.reset({ recipientSlug, designId });
    setClientSecret(null);
    setOrderId(null);
    setStatusToken(null);
    setCheckoutAmountCents(null);
    setCheckoutNotice(null);
    setSandbox(false);
    setFulfillmentStatus(null);
    setOrderProviderMode(providerMode === "unavailable" ? null : providerMode);
    setProofUrl(null);
    clearPostcardCheckoutContext();
    setError(null);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
      {/* LEFT — form / checkout / sent */}
      <div className="glass rounded-2xl p-5 ring-1 ring-secondary md:p-7">
        {step === "customize" && (
          <div className="flex flex-col gap-7">
            <ProviderModeNotice mode={providerMode} />

            {/* Recipient */}
            <Field label="Who's it for?">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {members.map((member) => {
                  const active = member.slug === recipientSlug;
                  const memberIdentity = postcardIdentityFor(member.slug);
                  return (
                    <button
                      key={member.slug}
                      type="button"
                      onClick={() => selectRecipient(member.slug)}
                      aria-pressed={active}
                      className={cn(
                        "relative flex min-w-0 items-center gap-2.5 overflow-hidden rounded-xl border px-2.5 py-2.5 text-left transition-all",
                        active
                          ? "shadow-sm"
                          : "border-secondary bg-primary text-secondary hover:-translate-y-0.5 hover:border-primary",
                      )}
                      style={active && memberIdentity ? {
                        background: memberIdentity.palette.background,
                        borderColor: memberIdentity.palette.primary,
                        color: memberIdentity.palette.ink,
                      } : undefined}
                    >
                      <span className="relative size-9 shrink-0">
                        {memberIdentity ? (
                          <>
                            <img
                              src={memberIdentity.media.portrait}
                              alt=""
                              className="size-9 rounded-full object-cover ring-1 ring-white/25"
                            />
                            <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full bg-black ring-1 ring-white/35">
                              <img
                                src={memberIdentity.media.communityLogo}
                                alt=""
                                className="size-3 object-contain"
                              />
                            </span>
                          </>
                        ) : (
                          <span className="grid size-9 place-items-center rounded-full bg-brand-solid/10 text-sm font-bold text-brand-secondary">
                            {member.initial}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{member.displayName}</span>
                        <span className={cn("block truncate text-[10px]", active ? "opacity-65" : "text-tertiary")}>
                          {memberIdentity?.communityName ?? "CORE"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>

            {publishedPacks.length > 0 ? (
              <PublishedPackPicker
                packs={publishedPacks}
                activePack={activePack}
                activeDesignId={activePackDesign?.id ?? null}
                photoSlotPositions={draft.photoSlots.map((slot) => slot.position)}
                onSelectPack={selectPublishedPack}
                onApplyDesign={applyPublishedPackDesign}
                onApplyAsset={applyPublishedPackAsset}
                onApplyMotif={applyPublishedPackMotif}
                onApplyPalette={applyPublishedPackPalette}
              />
            ) : null}

            {/* Design */}
            <Field label={identity ? `${identity.creatorName}'s postcard collection` : "Front design"} hint={`${designs.length} designs`}>
              {identity ? (
                <div
                  className="flex items-center gap-3 rounded-xl border p-3"
                  style={{
                    borderColor: `${identity.palette.primary}70`,
                    background: `linear-gradient(120deg, ${identity.palette.background}, ${identity.palette.surface})`,
                    color: identity.palette.ink,
                  }}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-black/75 p-1.5 ring-1 ring-white/15">
                    <img src={identity.media.communityLogo} alt="" className="size-full object-contain" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{archetypeLabel(identity.archetype)}</span>
                    <span className="mt-0.5 block text-xs opacity-65">
                      A creator-specific art direction, printed as a standard postcard. Texture,
                      tape, holo, and seal effects are printed graphics.
                    </span>
                  </span>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {designs.map((design) => (
                  <button
                    key={design.id}
                    type="button"
                    onClick={() => {
                      designSelectionsRef.current[recipientSlug] = design.id;
                      commitDraft((current) => retargetPostcardDraft(current, {
                        recipientSlug: current.recipientSlug,
                        designId: design.id,
                      }));
                    }}
                    aria-pressed={designId === design.id}
                    className={cn(
                      "overflow-hidden rounded-xl border bg-primary text-left transition-all",
                      designId === design.id
                        ? "border-brand-solid ring-2 ring-brand-solid/25"
                        : "border-secondary hover:-translate-y-0.5 hover:border-primary",
                    )}
                  >
                    <span
                      className="relative block h-16 overflow-hidden px-3 py-2"
                      style={{ background: design.background, color: design.ink }}
                    >
                      <span className="absolute inset-0 opacity-70" style={{ background: design.overlay }} />
                      <span className="relative block text-[9px] font-bold uppercase tracking-[0.16em] opacity-70">
                        {identity?.communityName ?? "CORE"}
                      </span>
                      <span className="relative mt-1 block max-w-[80%] text-sm font-black uppercase leading-none">
                        {design.headline}
                      </span>
                      {identity ? (
                        <img
                          src={identity.media.communityLogo}
                          alt=""
                          className="absolute bottom-1.5 right-2 size-9 object-contain"
                        />
                      ) : null}
                    </span>
                    <span className="block px-3 py-2.5">
                      <span className="block text-sm font-semibold text-primary">{design.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-tertiary">
                        {design.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2.5">
                <p className="text-xs text-tertiary">Keep this design; remix its crop, marks, and texture.</p>
                <button
                  type="button"
                  onClick={() => commitDraft((current) => ({
                    ...current,
                    variationSeed: createVariationSeed(),
                  }))}
                  className="rounded-lg border border-secondary bg-primary px-2.5 py-1.5 text-xs font-semibold text-secondary transition-colors hover:text-primary"
                >
                  Shuffle details
                </button>
              </div>
            </Field>

            {/* Message */}
            <Field
              label="Your message"
              htmlFor="postcard-message"
              hint={`${remaining} characters · ${messageLineCount}/${POSTCARD_LIMITS.messageLines} lines`}
            >
              {availablePrompts.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {availablePrompts.map((prompt, promptIndex) => (
                    <button
                      key={`${prompt.id}-${promptIndex}`}
                      type="button"
                      onClick={() => setActivePromptId(prompt.id)}
                      aria-pressed={activePromptId === prompt.id}
                      title={prompt.question}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        activePromptId === prompt.id
                          ? "border-brand-solid bg-brand-solid/10 text-brand-secondary"
                          : "border-secondary bg-primary text-tertiary hover:text-primary",
                      )}
                    >
                      {prompt.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {activePrompt ? (
                <p className="text-xs font-medium text-secondary">{activePrompt.question}</p>
              ) : null}
              <textarea
                id="postcard-message"
                value={message}
                onChange={(e) => {
                  const nextMessage = limitMessage(e.target.value);
                  if (countMessageLines(e.target.value.slice(0, POSTCARD_LIMITS.message)) > POSTCARD_LIMITS.messageLines) {
                    setError(MESSAGE_LINES_ERROR);
                  } else if (error === MESSAGE_LINES_ERROR) {
                    setError(null);
                  }
                  commitDraft((current) => ({
                    ...current,
                    writing: { ...current.writing, message: nextMessage },
                  }));
                }}
                rows={5}
                placeholder={activePrompt?.placeholder ?? "Say something real. Stickers welcome IRL."}
                className="w-full resize-none rounded-xl border border-secondary bg-primary px-3.5 py-3 text-md text-primary shadow-xs outline-none placeholder:text-placeholder focus:border-brand-solid focus:ring-2 focus:ring-brand-solid/30"
              />
              {activePack?.phrases.length ? (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-quaternary">
                    {activePack.title} phrases
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {activePack.phrases.map((phrase) => (
                      <button
                        key={phrase.id}
                        type="button"
                        onClick={() => commitDraft((current) => applyFanPostcardPhrase(current, phrase))}
                        title={phrase.text}
                        className="min-h-11 rounded-full border border-secondary bg-primary px-2.5 py-1 text-xs font-medium text-tertiary transition-colors hover:border-brand-solid hover:text-primary"
                      >
                        + {phrase.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </Field>

            <PostcardEditorPanels
              draft={draft}
              scheduledMailEnabled={scheduledMailEnabled}
              onChange={commitDraft}
              onPickImage={onPickFile}
              onRemoveImage={(position) => commitDraft((current) => updateDraftSlot(
                current,
                position,
                (slot) => ({ ...slot, asset: null }),
              ))}
              onSwapImages={(from, to) => commitDraft((current) => swapDraftSlots(current, from, to))}
              onAutoRemoveBackground={onAutoRemoveBackground}
              onSampleAccent={onSampleAccent}
              onSuggestFaceCrop={onSuggestFaceCrop}
              onSuggestHorizon={onSuggestHorizon}
              onUndo={editor.undo}
              onRedo={editor.redo}
              canUndo={editor.canUndo}
              canRedo={editor.canRedo}
              draftSaveStatus={editor.draftSaveStatus}
              onSaveDraft={editor.saveNamedDraft}
              namedDrafts={editor.namedDrafts}
              onLoadDraft={editor.loadNamedDraft}
              onRemoveDraft={editor.removeNamedDraft}
              proofToken={editor.proofToken}
              favoriteRemixes={editor.favoriteRemixes}
              onToggleFavoriteRemix={editor.toggleFavoriteRemix}
              moments={moments}
            />

            <PostcardCollectiblePicker
              draft={draft}
              enabled={providerMode === "live"}
              onChange={commitDraft}
            />

            {hasCustomArt ? (
              <p className="rounded-xl border border-warning-primary/25 bg-warning-secondary px-3.5 py-3 text-xs leading-relaxed text-warning-primary">
                Custom photos, captions, and signatures are safety-reviewed before printing. If art is declined,
                payment is refunded; text-only postcards proceed without that art-review step.
              </p>
            ) : null}

            {/* Sender */}
            <Field label="Sign it (optional)" htmlFor="postcard-sender-name">
              <input
                id="postcard-sender-name"
                value={senderName}
                onChange={(e) => commitDraft((current) => ({
                  ...current,
                  writing: {
                    ...current.writing,
                    senderName: e.target.value.slice(0, POSTCARD_LIMITS.senderName),
                  },
                }))}
                placeholder="Your name / handle"
                className="w-full rounded-xl border border-secondary bg-primary px-3.5 py-2.5 text-md text-primary shadow-xs outline-none placeholder:text-placeholder focus:border-brand-solid focus:ring-2 focus:ring-brand-solid/30"
              />
            </Field>

            {/* Return address (optional, collapsible) */}
            <div>
              <button
                type="button"
                onClick={() => setShowReturn((v) => !v)}
                className="text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover"
              >
                {showReturn ? "– Hide return address" : "+ Add your return address (optional)"}
              </button>
              {showReturn && (
                <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <Inp id="postcard-return-street" label="Return street address" ph="Street address" v={ret.line1 ?? ""} on={(x) => setRet({ ...ret, line1: x })} className="sm:col-span-2" />
                  <Inp id="postcard-return-city" label="Return address city" ph="City" v={ret.city ?? ""} on={(x) => setRet({ ...ret, city: x })} />
                  <div className="grid grid-cols-2 gap-2.5">
                    <Inp id="postcard-return-state" label="Return address state" ph="State" v={ret.state ?? ""} on={(x) => setRet({ ...ret, state: x })} />
                    <Inp id="postcard-return-zip" label="Return address ZIP code" ph="ZIP" v={ret.zip ?? ""} on={(x) => setRet({ ...ret, zip: x })} />
                  </div>
                </div>
              )}
            </div>

            {error ? <p role="alert" className="text-sm text-error-primary">{error}</p> : null}

            <div className="flex items-center justify-between gap-4 border-t border-secondary pt-5">
              <div>
                <p className="text-2xl font-semibold tracking-tight text-primary">
                  {providerMode === "sandbox" ? "No charge" : formatPrice(amountCents)}
                </p>
                <p className="text-xs text-tertiary">{providerModeCheckoutCopy(providerMode)}</p>
              </div>
              <Button size="xl" onClick={onContinue} isLoading={busy} isDisabled={providerMode === "unavailable"}>
                {providerModeButtonLabel(providerMode)}
              </Button>
            </div>
          </div>
        )}

        {step === "restoring" && (
          <div className="flex flex-col items-center gap-4 py-12 text-center" role="status">
            <div className="size-8 animate-spin rounded-full border-2 border-brand-solid/25 border-t-brand-solid" />
            <div>
              <h2 className="text-display-xs font-semibold tracking-tight text-primary">Checking your payment return…</h2>
              <p className="mt-2 text-sm text-tertiary">Nothing is treated as paid until the server confirms it.</p>
            </div>
          </div>
        )}

        {step === "pay" && clientSecret && orderId && statusToken && (
          <div className="flex flex-col gap-6">
            <div>
              <p className="text-sm font-semibold text-brand-secondary">Checkout</p>
              <h2 className="mt-1 text-display-xs font-semibold tracking-tight text-primary">
                {orderProviderMode === "test" ? "Create a test proof." : "Pay & submit for printing."}
              </h2>
              <p className="mt-1 text-sm text-tertiary">
                Postcard to {recipient?.displayName} · {formatPrice(checkoutAmountCents ?? amountCents)}
              </p>
              {orderProviderMode === "test" ? (
                <p className="mt-2 text-xs text-tertiary">Test-mode payment details only. A digital proof may be generated, but nothing physical is mailed.</p>
              ) : null}
              {checkoutNotice ? <p role="alert" className="mt-3 text-sm text-warning-primary">{checkoutNotice}</p> : null}
            </div>
            <PostcardCheckout
              clientSecret={clientSecret}
              orderId={orderId}
              statusToken={statusToken}
              recipientSlug={recipientSlug}
              amountCents={checkoutAmountCents ?? amountCents}
              onPaid={onPaid}
              onCancel={() => {
                clearPostcardCheckoutContext(orderId);
                setStep("customize");
              }}
            />
          </div>
        )}

        {step === "sent" && (
          <div className="flex flex-col items-center gap-5 py-8 text-center">
            <FeaturedIcon icon={CheckCircle} color={statusIconColor(fulfillmentStatus)} theme="light" size="xl" />
            <div>
              <h2 className="text-display-sm font-semibold tracking-tight text-primary">
                {sandbox ? (
                  <>Sandbox <span className="gradient-text">simulation complete.</span></>
                ) : fulfillmentStatus === "review" ? (
                  <>Custom art <span className="gradient-text">awaiting review.</span></>
                ) : fulfillmentStatus === "refunding" ? (
                  <>Payment <span className="gradient-text">refund in progress.</span></>
                ) : fulfillmentStatus === "refunded" ? (
                  <>Payment <span className="gradient-text">refunded.</span></>
                ) : fulfillmentStatus === "proof" ? (
                  <>Digital proof <span className="gradient-text">ready.</span></>
                ) : fulfillmentStatus === "mailed" ? (
                  <>Postcard <span className="gradient-text">mailed.</span></>
                ) : fulfillmentStatus === "printing" ? (
                  <>Postcard <span className="gradient-text">submitted for printing.</span></>
                ) : fulfillmentStatus === "failed" ? (
                  <>Print submission <span className="gradient-text">needs attention.</span></>
                ) : (
                  <>Payment <span className="gradient-text">received.</span></>
                )}
              </h2>
              <p className="mt-2 max-w-sm text-md text-tertiary">
                {sandbox
                  ? `This was a simulated order for ${recipient?.displayName ?? "your recipient"}. No physical postcard was printed or mailed.`
                  : fulfillmentStatus === "review"
                    ? "Payment succeeded, but custom art is awaiting a safety review. Nothing has been printed or mailed yet."
                    : fulfillmentStatus === "refunding"
                      ? "The custom art was declined and a refund is being processed. Nothing was printed or mailed."
                    : fulfillmentStatus === "refunded"
                      ? "The order was declined or could not be safely completed, so the payment was refunded. Nothing was printed or mailed."
                  : fulfillmentStatus === "proof"
                    ? `A test-mode digital proof was generated for ${recipient?.displayName ?? "your recipient"}. Nothing physical was printed or mailed.`
                  : fulfillmentStatus === "mailed"
                    ? `The print partner reports your postcard to ${recipient?.displayName ?? "your recipient"} has been mailed.`
                    : fulfillmentStatus === "printing"
                      ? `The paid order for ${recipient?.displayName ?? "your recipient"} was accepted by the print partner. USPS handoff happens after printing.`
                      : fulfillmentStatus === "failed"
                        ? "We couldn't confirm print submission. Keep your order reference so the team can investigate."
                        : `Your paid order for ${recipient?.displayName ?? "your recipient"} is accepted and preparing for print. This screen does not yet confirm USPS handoff.`}
              </p>
              {sandbox ? (
                <p className="mt-3 inline-block rounded-full bg-secondary px-3 py-1 text-xs font-medium text-tertiary">
                  Sandbox mode · nothing physical was mailed
                </p>
              ) : fulfillmentStatus === "proof" ? (
                <p className="mt-3 inline-block rounded-full bg-secondary px-3 py-1 text-xs font-medium text-tertiary">
                  Test mode · digital proof only
                </p>
              ) : fulfillmentStatus === "review" ? (
                <p className="mt-3 inline-block rounded-full bg-warning-secondary px-3 py-1 text-xs font-medium text-warning-primary">
                  Safety review · not submitted for print
                </p>
              ) : fulfillmentStatus === "refunding" ? (
                <p className="mt-3 inline-block rounded-full bg-warning-secondary px-3 py-1 text-xs font-medium text-warning-primary">
                  Refund processing · nothing mailed
                </p>
              ) : fulfillmentStatus === "refunded" ? (
                <p className="mt-3 inline-block rounded-full bg-error-secondary px-3 py-1 text-xs font-medium text-error-primary">
                  Refunded · nothing mailed
                </p>
              ) : null}

              {fulfillmentStatus === "proof" && orderProviderMode === "test" && proofUrl ? (
                <a
                  href={proofUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover"
                >
                  Open private digital proof
                </a>
              ) : null}
            </div>
            <Button color="secondary" size="lg" onClick={reset}>
              Send another
            </Button>
          </div>
        )}
      </div>

      {/* RIGHT — live preview */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.22em] text-tertiary">Live preview</p>
        <PostcardPreview
          recipient={recipient}
          message={message}
          senderName={senderName.trim() || undefined}
          designId={designId}
          imageDataUrl={imageDataUrl}
          variationSeed={variationSeed}
          draft={draft}
        />
      </div>
    </div>
  );
}

function PublishedPackPicker({
  packs,
  activePack,
  activeDesignId,
  photoSlotPositions,
  onSelectPack,
  onApplyDesign,
  onApplyAsset,
  onApplyMotif,
  onApplyPalette,
}: {
  packs: readonly FanPostcardPack[];
  activePack: FanPostcardPack | null;
  activeDesignId: string | null;
  photoSlotPositions: readonly number[];
  onSelectPack: (pack: FanPostcardPack) => void;
  onApplyDesign: (pack: FanPostcardPack, designId: string) => void;
  onApplyAsset: (pack: FanPostcardPack, designId: string, assetId: string, position: number) => void;
  onApplyMotif: (pack: FanPostcardPack, designId: string, motifId: string) => void;
  onApplyPalette: (pack: FanPostcardPack, designId: string, paletteId: string) => void;
}) {
  const design = activePack?.designs.find((candidate) => candidate.id === activeDesignId)
    ?? activePack?.designs[0]
    ?? null;
  const motifAssetIds = new Set(activePack?.motifs.flatMap((motif) => (
    design?.motifIds.includes(motif.id) && motif.assetId ? [motif.assetId] : []
  )) ?? []);
  const assets = design && activePack
    ? activePack.assets.filter((asset) => design.assetIds.includes(asset.id) || motifAssetIds.has(asset.id))
    : [];
  const motifs = design && activePack
    ? activePack.motifs.filter((motif) => design.motifIds.includes(motif.id) && motif.mark)
    : [];
  const palettes = design && activePack
    ? activePack.palettes.filter((palette) => design.paletteIds.includes(palette.id))
    : [];
  return (
    <Field label="Creator packs" hint={`${packs.length} published`}>
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Published creator packs">
        {packs.map((pack) => (
          <button
            key={pack.packId}
            type="button"
            aria-pressed={activePack?.packId === pack.packId}
            onClick={() => onSelectPack(pack)}
            className={cn(
              "min-h-11 min-w-36 rounded-xl border px-3 py-2 text-left transition-colors",
              activePack?.packId === pack.packId
                ? "border-brand-solid bg-brand-solid/10"
                : "border-secondary bg-primary hover:border-primary",
            )}
          >
            <span className="block text-sm font-semibold text-primary">{pack.title}</span>
            <span className="mt-0.5 block text-[11px] text-tertiary">
              {pack.activeDrops[0]?.title ?? `${pack.designs.length} creator design${pack.designs.length === 1 ? "" : "s"}`}
            </span>
          </button>
        ))}
      </div>
      {activePack ? (
        <div className="rounded-xl border border-secondary bg-secondary/40 p-3">
          {activePack.activeDrops.length ? (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {activePack.activeDrops.map((drop) => (
                <span key={drop.id} className="rounded-full bg-brand-solid px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                  Live drop · {drop.title}
                </span>
              ))}
            </div>
          ) : null}
          {activePack.description ? <p className="mb-3 text-xs leading-relaxed text-tertiary">{activePack.description}</p> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {activePack.designs.map((packDesign) => (
              <button
                key={packDesign.id}
                type="button"
                aria-pressed={design?.id === packDesign.id}
                onClick={() => onApplyDesign(activePack, packDesign.id)}
                className={cn(
                  "min-h-11 rounded-lg border px-3 py-2 text-left transition-colors",
                  design?.id === packDesign.id
                    ? "border-brand-solid bg-primary"
                    : "border-secondary bg-primary/60 hover:border-primary",
                )}
              >
                <span className="block text-sm font-semibold text-primary">{packDesign.label}</span>
                <span className="mt-0.5 block text-[11px] text-tertiary">Apply creator palette and layout</span>
              </button>
            ))}
          </div>

          {design && palettes.length > 1 ? (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-quaternary">Creator palettes</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {palettes.map((palette) => (
                  <button key={palette.id} type="button" onClick={() => onApplyPalette(activePack, design.id, palette.id)} className="flex min-h-11 items-center gap-2 rounded-full border border-secondary bg-primary px-2.5 py-1 text-xs font-semibold text-secondary hover:border-brand-solid hover:text-primary">
                    <span className="flex" aria-hidden="true">
                      {[palette.background, palette.primary, palette.highlight].map((color, colorIndex) => <span key={`${color}-${colorIndex}`} className="size-3 rounded-full border border-white/20" style={{ backgroundColor: color }} />)}
                    </span>
                    {palette.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {design && motifs.length ? (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-quaternary">Creator marks</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {motifs.map((motif) => (
                  <button key={motif.id} type="button" onClick={() => onApplyMotif(activePack, design.id, motif.id)} className="min-h-11 rounded-full border border-secondary bg-primary px-2.5 py-1 text-xs font-semibold text-secondary hover:border-brand-solid hover:text-primary">
                    + {motif.mark}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {design && assets.length ? (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-quaternary">Approved creator artwork</p>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                {assets.map((asset) => (
                  <article key={asset.id} className="flex min-w-0 gap-2 rounded-lg border border-secondary bg-primary p-2">
                    <img src={asset.url} alt="" className="size-12 shrink-0 rounded-md object-cover" loading="lazy" referrerPolicy="no-referrer" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold capitalize text-primary">{asset.kind.replaceAll("-", " ")}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {photoSlotPositions.map((position) => (
                          <button key={position} type="button" onClick={() => onApplyAsset(activePack, design.id, asset.id, position)} className="min-h-11 rounded-md border border-secondary px-2 text-[10px] font-semibold text-secondary hover:border-brand-solid hover:text-primary">
                            Use in photo {position + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Field>
  );
}

type PostcardStatusPollResult = {
  status: string;
  providerMode: ActiveProviderMode | null;
  proofUrl: string | null;
};

async function pollPostcardStatus(
  orderId: string,
  statusToken: string,
  initialStatus: string,
): Promise<PostcardStatusPollResult> {
  let latestStatus = initialStatus;
  let resolvedMode: ActiveProviderMode | null = null;
  let proofUrl: string | null = null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const query = new URLSearchParams({ orderId, statusToken });
      const response = await fetch(`/api/postcard/status?${query}`, { cache: "no-store" });
      if (response.ok) {
        const payload = (await response.json()) as {
          status?: unknown;
          providerMode?: unknown;
          proofUrl?: unknown;
        };
        if (isActiveProviderMode(payload.providerMode)) resolvedMode = payload.providerMode;
        if (typeof payload.proofUrl === "string") proofUrl = payload.proofUrl;
        if (typeof payload.status === "string") {
          // A locally confirmed Stripe success must never be downgraded by a
          // brief webhook race where the order endpoint still says `created`.
          if (!(initialStatus === "paid" && payload.status === "created")) {
            latestStatus = payload.status;
          }
          if (POLLING_STOP_STATUSES.has(payload.status)) break;
        }
      }
    } catch {
      /* Keep polling through transient navigation/network races. */
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  return { status: latestStatus, providerMode: resolvedMode, proofUrl };
}

function isPaidOrLaterStatus(status: string): boolean {
  return [
    "paid",
    "fulfilling",
    "review",
    "refunding",
    "refunded",
    "proof",
    "printing",
    "mailed",
    "sent",
    "failed",
  ].includes(status);
}

function isActiveProviderMode(value: unknown): value is ActiveProviderMode {
  return value === "sandbox" || value === "test" || value === "live";
}

function safeProofUrl(value: string | null): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function cleanCheckoutReturnUrl(url: URL): void {
  for (const key of [
    "checkout",
    "order",
    "payment_intent",
    "payment_intent_client_secret",
    "redirect_status",
  ]) {
    url.searchParams.delete(key);
  }
  globalThis.history.replaceState(
    globalThis.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

function countMessageLines(value: string): number {
  return value.split(/\r\n?|\n/).length;
}

function limitMessage(value: string): string {
  const characterLimited = value.slice(0, POSTCARD_LIMITS.message).replace(/\r\n?/g, "\n");
  return characterLimited.split("\n").slice(0, POSTCARD_LIMITS.messageLines).join("\n");
}

function ProviderModeNotice({ mode }: { mode: PostcardStudioProviderMode }) {
  const content: Record<PostcardStudioProviderMode, { title: string; body: string; classes: string }> = {
    sandbox: {
      title: "Demo sandbox",
      body: "Continuing simulates the order only. There is no charge, printing, postage, or physical mail.",
      classes: "border-secondary bg-secondary text-secondary",
    },
    test: {
      title: "Test proof mode",
      body: "Checkout uses test payment details and may create a private digital proof. Nothing physical is mailed.",
      classes: "border-warning-primary/30 bg-warning-secondary text-warning-primary",
    },
    live: {
      title: "Live physical mail",
      body: "A successful payment submits this design for real printing and postage. Status copy will confirm each later step.",
      classes: "border-success-primary/30 bg-success-secondary text-success-primary",
    },
    unavailable: {
      title: "Preview only",
      body: "Provider configuration is unavailable, so checkout is disabled and no payment or mail can be created.",
      classes: "border-error-primary/30 bg-error-secondary text-error-primary",
    },
  };
  const notice = content[mode];
  return (
    <div className={`rounded-xl border px-3.5 py-3 ${notice.classes}`} role="status">
      <p className="text-sm font-semibold">{notice.title}</p>
      <p className="mt-0.5 text-xs leading-relaxed opacity-80">{notice.body}</p>
    </div>
  );
}

function providerModeCheckoutCopy(mode: PostcardStudioProviderMode): string {
  const copy: Record<PostcardStudioProviderMode, string> = {
    sandbox: "Simulation only · no charge or physical mail",
    test: "Test checkout · digital proof only",
    live: "Physical postcard and postage after successful payment",
    unavailable: "Checkout unavailable · preview remains available",
  };
  return copy[mode];
}

function providerModeButtonLabel(mode: PostcardStudioProviderMode): string {
  const labels: Record<PostcardStudioProviderMode, string> = {
    sandbox: "Simulate postcard",
    test: "Continue to test checkout",
    live: "Continue to payment",
    unavailable: "Checkout unavailable",
  };
  return labels[mode];
}

function statusIconColor(status: string | null): "success" | "warning" | "error" {
  if (status === "failed" || status === "refunded") return "error";
  if (status === "review" || status === "refunding") return "warning";
  return "success";
}

function createVariationSeed(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID().replaceAll("-", "_");
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function archetypeLabel(archetype: PostcardArchetype): string {
  const labels: Record<PostcardArchetype, string> = {
    "broadcast-freeze-frame": "Live broadcast signal",
    "creator-trading-card": "Numbered creator card",
    "newspaper-front-page": "Late-edition front page",
    "editorial-magazine": "Culture and sport editorial",
    "scrapbook-contact-sheet": "Flock archive scrapbook",
  };
  return labels[archetype];
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-semibold text-primary">{label}</label>
        ) : (
          <p className="text-sm font-semibold text-primary">{label}</p>
        )}
        {hint ? <span className="text-xs text-tertiary">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Inp({
  id,
  label,
  ph,
  v,
  on,
  className,
}: {
  id: string;
  label: string;
  ph: string;
  v: string;
  on: (x: string) => void;
  className?: string;
}) {
  return (
    <input
      id={id}
      aria-label={label}
      placeholder={ph}
      value={v}
      onChange={(e) => on(e.target.value)}
      className={cn(
        "w-full rounded-xl border border-secondary bg-primary px-3.5 py-2.5 text-md text-primary shadow-xs outline-none placeholder:text-placeholder focus:border-brand-solid focus:ring-2 focus:ring-brand-solid/30",
        className,
      )}
    />
  );
}

function hasReturn(r: ReturnAddress): boolean {
  return Boolean(r.line1 && r.city && r.state && r.zip);
}

function firstEmbeddedImage(draft: PostcardDraft): string | null {
  for (const slot of [...draft.photoSlots].sort((a, b) => a.position - b.position)) {
    if (slot.asset?.source.kind === "embedded") return slot.asset.source.dataUrl;
  }
  return null;
}

function draftSlotPreview(slot: PostcardPhotoSlot): string | null {
  if (!slot.asset) return null;
  const source = slot.asset.source;
  if (source.kind === "embedded") return source.dataUrl;
  if (source.kind === "managed") return source.previewUrl;
  return source.imageUrl;
}

function updateDraftSlot(
  draft: PostcardDraft,
  position: number,
  updater: (slot: PostcardPhotoSlot) => PostcardPhotoSlot,
): PostcardDraft {
  return {
    ...draft,
    photoSlots: draft.photoSlots.map((slot) => slot.position === position ? updater(slot) : slot),
  };
}

function swapDraftSlots(draft: PostcardDraft, from: number, to: number): PostcardDraft {
  if (from === to) return draft;
  const source = draft.photoSlots.find((slot) => slot.position === from);
  const target = draft.photoSlots.find((slot) => slot.position === to);
  if (!source || !target) return draft;
  return {
    ...draft,
    photoSlots: draft.photoSlots.map((slot) => {
      if (slot.position === from) return { ...target, position: from };
      if (slot.position === to) return { ...source, position: to };
      return slot;
    }),
  };
}

function createDraftAssetId(position: number): string {
  const random = globalThis.crypto?.randomUUID?.().replaceAll("-", "")
    ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `asset-${position + 1}-${random}`.slice(0, 160);
}

/** Downscale an image file to a JPEG data URL under `maxBytes`. */
async function resizeToDataUrl(file: File, maxDim: number, maxBytes: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  let quality = 0.85;
  let out = canvas.toDataURL("image/jpeg", quality);
  while (out.length > maxBytes && quality > 0.4) {
    quality -= 0.12;
    out = canvas.toDataURL("image/jpeg", quality);
  }
  if (out.length > maxBytes) throw new Error("image exceeds postcard upload limit");
  return out;
}

async function imageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image decode failed"));
    image.src = dataUrl;
  });
}

type DetectedFace = {
  boundingBox: { x: number; y: number; width: number; height: number };
};

type FaceDetectorConstructor = new (options?: {
  fastMode?: boolean;
  maxDetectedFaces?: number;
}) => {
  detect(source: CanvasImageSource): Promise<DetectedFace[]>;
};

async function suggestFaceAwareCrop(source: string): Promise<{
  focalPoint: { x: number; y: number };
  zoom: number;
}> {
  const image = await imageFromDataUrl(source);
  const Detector = (globalThis as unknown as { FaceDetector?: FaceDetectorConstructor }).FaceDetector;
  const faces = Detector
    ? await new Detector({ fastMode: true, maxDetectedFaces: 8 }).detect(image).catch(() => [])
    : [];
  const nativeFace = [...faces].sort((left, right) =>
    (right.boundingBox.width * right.boundingBox.height)
      - (left.boundingBox.width * left.boundingBox.height),
  )[0];
  const box = nativeFace?.boundingBox ?? detectPortraitSkinRegion(image);
  if (!box || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    throw new Error("no face detected");
  }
  const x = Math.max(0, Math.min(1, (box.x + box.width / 2) / image.naturalWidth));
  // Bias slightly toward the eyes so portrait crops retain headroom.
  const y = Math.max(0, Math.min(1, (box.y + box.height * 0.42) / image.naturalHeight));
  const zoom = Math.max(1, Math.min(2.4, Math.min(
    image.naturalWidth / Math.max(1, box.width * 2.4),
    image.naturalHeight / Math.max(1, box.height * 2.8),
  )));
  return { focalPoint: { x, y }, zoom };
}

/** Privacy-preserving fallback for browsers without the Shape Detection API. */
function detectPortraitSkinRegion(image: HTMLImageElement): DetectedFace["boundingBox"] | null {
  const width = 160;
  const height = Math.max(90, Math.min(220, Math.round(width * image.naturalHeight / image.naturalWidth)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  try {
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const skin = new Uint8Array(width * height);
    for (let index = 0; index < skin.length; index += 1) {
      const offset = index * 4;
      const red = pixels[offset]!;
      const green = pixels[offset + 1]!;
      const blue = pixels[offset + 2]!;
      const maximum = Math.max(red, green, blue);
      const minimum = Math.min(red, green, blue);
      const commonSkin = red > 80 && green > 30 && blue > 15
        && maximum - minimum > 15 && red > green * 1.08 && red > blue * 1.12;
      const lowLightSkin = red > 35 && green > 18 && blue > 8
        && red > green * 1.12 && green > blue * 1.03 && maximum - minimum > 10;
      skin[index] = commonSkin || lowLightSkin ? 1 : 0;
    }

    const visited = new Uint8Array(skin.length);
    let best: { minX: number; minY: number; maxX: number; maxY: number; count: number; score: number } | null = null;
    for (let start = 0; start < skin.length; start += 1) {
      if (!skin[start] || visited[start]) continue;
      const queue = [start];
      visited[start] = 1;
      let cursor = 0;
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;
      let count = 0;
      while (cursor < queue.length) {
        const current = queue[cursor++]!;
        const x = current % width;
        const y = Math.floor(current / width);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        count += 1;
        const neighbors = [current - 1, current + 1, current - width, current + width];
        for (const neighbor of neighbors) {
          if (neighbor < 0 || neighbor >= skin.length || visited[neighbor] || !skin[neighbor]) continue;
          const neighborX = neighbor % width;
          if (Math.abs(neighborX - x) > 1) continue;
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const aspect = boxWidth / Math.max(1, boxHeight);
      const density = count / Math.max(1, boxWidth * boxHeight);
      if (count < 18 || aspect < 0.35 || aspect > 2.4 || boxWidth > width * 0.55 || boxHeight > height * 0.55) continue;
      const upperBias = 1.25 - Math.min(0.55, (minY / height) * 0.55);
      const score = count * density * upperBias;
      if (!best || score > best.score) best = { minX, minY, maxX, maxY, count, score };
    }
    if (!best) return null;
    const scaleX = image.naturalWidth / width;
    const scaleY = image.naturalHeight / height;
    return {
      x: best.minX * scaleX,
      y: best.minY * scaleY,
      width: (best.maxX - best.minX + 1) * scaleX,
      height: (best.maxY - best.minY + 1) * scaleY,
    };
  } catch {
    // Cross-origin images without CORS can still use the native detector, but
    // their pixels cannot be inspected by the fallback.
    return null;
  }
}

/** Estimate the strongest near-horizontal edge and return its leveling angle. */
async function suggestHorizonCorrection(source: string): Promise<number> {
  const image = await imageFromDataUrl(source);
  const width = 192;
  const height = Math.max(96, Math.min(192, Math.round(width * image.naturalHeight / image.naturalWidth)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("no canvas");
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const luminance = new Float32Array(width * height);
  for (let index = 0; index < luminance.length; index += 1) {
    const offset = index * 4;
    luminance[index] = pixels[offset]! * 0.2126 + pixels[offset + 1]! * 0.7152 + pixels[offset + 2]! * 0.0722;
  }

  let bestAngle = 0;
  let bestScore = 0;
  for (let angle = -12; angle <= 12; angle += 0.5) {
    const slope = Math.tan(angle * Math.PI / 180);
    for (let baseY = Math.round(height * 0.2); baseY <= height * 0.78; baseY += 3) {
      let score = 0;
      let samples = 0;
      for (let x = 4; x < width - 4; x += 3) {
        const y = Math.round(baseY + slope * (x - width / 2));
        if (y < 2 || y >= height - 2) continue;
        score += Math.abs(luminance[(y + 1) * width + x]! - luminance[(y - 1) * width + x]!);
        samples += 1;
      }
      const normalized = samples ? score / samples : 0;
      if (normalized > bestScore) {
        bestScore = normalized;
        bestAngle = angle;
      }
    }
  }
  if (bestScore < 10) throw new Error("no strong horizon");
  return Math.max(-12, Math.min(12, -bestAngle));
}

/**
 * Local, privacy-preserving automatic cutout. It estimates the background from
 * the four corners and softly removes matching edge colors. This keeps photo
 * bytes in the browser and is intentionally reversible through editor undo.
 */
async function makeAutomaticCutout(dataUrl: string): Promise<string> {
  const image = await imageFromDataUrl(dataUrl);
  const maximum = 1_200;
  const scale = Math.min(1, maximum / Math.max(image.naturalWidth, image.naturalHeight));
  let width = Math.max(1, Math.round(image.naturalWidth * scale));
  let height = Math.max(1, Math.round(image.naturalHeight * scale));
  let canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  let context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("no canvas");
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const cornerSize = Math.max(1, Math.min(12, width, height, Math.round(Math.min(width, height) * 0.025)));
  const corners = [
    averageRegion(pixels.data, width, 0, 0, cornerSize, cornerSize),
    averageRegion(pixels.data, width, width - cornerSize, 0, cornerSize, cornerSize),
    averageRegion(pixels.data, width, 0, height - cornerSize, cornerSize, cornerSize),
    averageRegion(pixels.data, width, width - cornerSize, height - cornerSize, cornerSize, cornerSize),
  ];
  for (let index = 0; index < pixels.data.length; index += 4) {
    const red = pixels.data[index]!;
    const green = pixels.data[index + 1]!;
    const blue = pixels.data[index + 2]!;
    let nearest = Number.POSITIVE_INFINITY;
    for (const corner of corners) {
      const distance = Math.hypot(red - corner[0], green - corner[1], blue - corner[2]);
      if (distance < nearest) nearest = distance;
    }
    const softAlpha = Math.max(0, Math.min(1, (nearest - 24) / 54));
    pixels.data[index + 3] = Math.round(pixels.data[index + 3]! * softAlpha);
  }
  context.putImageData(pixels, 0, 0);

  let output = canvas.toDataURL("image/webp", 0.86);
  while (output.length > 600_000 && Math.max(width, height) > 520) {
    width = Math.round(width * 0.82);
    height = Math.round(height * 0.82);
    const smaller = document.createElement("canvas");
    smaller.width = width;
    smaller.height = height;
    context = smaller.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.drawImage(canvas, 0, 0, width, height);
    canvas = smaller;
    output = canvas.toDataURL("image/webp", 0.8);
  }
  if (output.length > 900_000 || !/^data:image\/(?:png|webp);base64,/.test(output)) {
    throw new Error("cutout too large");
  }
  return output;
}

function averageRegion(
  data: Uint8ClampedArray,
  width: number,
  startX: number,
  startY: number,
  regionWidth: number,
  regionHeight: number,
): readonly [number, number, number] {
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (let y = startY; y < startY + regionHeight; y += 1) {
    for (let x = startX; x < startX + regionWidth; x += 1) {
      const offset = (y * width + x) * 4;
      red += data[offset]!;
      green += data[offset + 1]!;
      blue += data[offset + 2]!;
      count += 1;
    }
  }
  return [red / count, green / count, blue / count];
}

async function sampleImageAccent(dataUrl: string): Promise<string> {
  const image = await imageFromDataUrl(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("no canvas");
  context.drawImage(image, 0, 0, 64, 64);
  const data = context.getImageData(0, 0, 64, 64).data;
  const buckets = new Map<string, { count: number; red: number; green: number; blue: number; chroma: number }>();
  for (let index = 0; index < data.length; index += 16) {
    if (data[index + 3]! < 96) continue;
    const red = data[index]!;
    const green = data[index + 1]!;
    const blue = data[index + 2]!;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const chroma = maximum - minimum;
    const lightness = (maximum + minimum) / 2;
    if (chroma < 28 || lightness < 28 || lightness > 232) continue;
    const key = `${red >> 5}:${green >> 5}:${blue >> 5}`;
    const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0, chroma: 0 };
    bucket.count += 1;
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    bucket.chroma += chroma;
    buckets.set(key, bucket);
  }
  const winner = [...buckets.values()].sort((left, right) =>
    (right.count * (right.chroma / right.count)) - (left.count * (left.chroma / left.count)),
  )[0];
  if (!winner) return "#e7005a";
  return `#${[winner.red, winner.green, winner.blue]
    .map((channel) => Math.round(channel / winner.count).toString(16).padStart(2, "0"))
    .join("")}`;
}
