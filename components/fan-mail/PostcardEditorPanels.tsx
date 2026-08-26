"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import type {
  PostcardDraft,
  PostcardPhotoSlot,
} from "@/lib/postcard-draft";
import {
  POSTCARD_CREATOR_FIELD_DEFINITIONS,
  creatorFieldDefinitionsFor,
  type PostcardCreatorFieldDefinition,
} from "@/lib/postcard-creator-fields";
import {
  applyPostcardRemix,
  generatePostcardRemixes,
  type PostcardRemixDimension,
} from "@/lib/postcard-remix";
import type { NamedPostcardDraft } from "@/hooks/usePostcardDraftEditor";

export type PostcardMomentOption = {
  id: string;
  title: string;
  imageUrl: string;
  sourceUrl?: string | null;
  platform: "instagram" | "twitch" | "youtube" | "core";
  attribution: string;
};

type Props = {
  draft: PostcardDraft;
  scheduledMailEnabled: boolean;
  onChange: (updater: (draft: PostcardDraft) => PostcardDraft) => void;
  onPickImage: (position: number, file: File, origin?: "upload" | "clipboard" | "camera") => void | Promise<void>;
  onRemoveImage: (position: number) => void;
  onSwapImages: (from: number, to: number) => void;
  onAutoRemoveBackground: (position: number) => void | Promise<void>;
  onSampleAccent: (position: number) => void | Promise<void>;
  onSuggestFaceCrop: (position: number) => void | Promise<void>;
  onSuggestHorizon: (position: number) => void | Promise<void>;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  draftSaveStatus: "idle" | "saving" | "saved" | "error";
  onSaveDraft: (name: string) => Promise<boolean>;
  namedDrafts: NamedPostcardDraft[];
  onLoadDraft: (id: string) => void;
  onRemoveDraft: (id: string) => void;
  proofToken: string;
  favoriteRemixes: string[];
  onToggleFavoriteRemix: (seed: string) => void;
  moments?: readonly PostcardMomentOption[];
};

const PURPOSES = [
  ["freeform", "Freeform"],
  ["thank-you", "Thank you"],
  ["memory", "Memory"],
  ["roast", "Roast"],
  ["prediction", "Prediction"],
  ["advice", "Advice"],
  ["congratulations", "Congrats"],
] as const;

const PALETTES = [
  { id: "creator", label: "Creator", colors: [null, null, null] as const },
  { id: "night", label: "Night", colors: ["#08080b", "#f6f7fb", "#e7005a"] as const },
  { id: "sunburst", label: "Sunburst", colors: ["#ffef00", "#090909", "#ff4d00"] as const },
  { id: "ice", label: "Ice", colors: ["#dff8ff", "#08111f", "#10bde8"] as const },
  { id: "violet", label: "Violet", colors: ["#1b102c", "#f8efff", "#9b5cff"] as const },
  { id: "newsprint", label: "Print", colors: ["#eee9dc", "#181512", "#c3262e"] as const },
];

const IMAGE_MASKS = ["template", "rectangle", "arch", "shield", "ticket", "circle", "monitor", "torn-paper"] as const;
const IMAGE_BORDERS = ["template", "none", "thin", "heavy", "neon", "distressed", "double"] as const;
const ATTACHMENTS = ["template", "none", "tape", "staples", "clips", "brackets", "photo-corners"] as const;
const BACKGROUNDS = ["template", "solid", "linear-gradient", "radial-gradient", "striped", "grid", "checker", "starburst"] as const;
const TEXTURES = ["template", "none", "smooth", "grain", "halftone", "crt", "paper-fibers", "newsprint"] as const;
const EDGES = ["template", "clean", "worn", "rounded", "inked", "deckled"] as const;
const FRAMES = ["template", "frameless", "keyline", "collector", "full-bleed"] as const;

export function PostcardEditorPanels(props: Props) {
  const { draft, onChange } = props;
  const [draftName, setDraftName] = useState("");
  const [copied, setCopied] = useState(false);
  const [namedSaveNotice, setNamedSaveNotice] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState(0);
  const [showDrafts, setShowDrafts] = useState(false);
  const [photoAnnouncement, setPhotoAnnouncement] = useState("");
  const orderedPhotoSlots = useMemo(
    () => [...draft.photoSlots].sort((first, second) => first.position - second.position),
    [draft.photoSlots],
  );
  const selectedSlot = orderedPhotoSlots.find((slot) => slot.position === activeSlot) ?? orderedPhotoSlots[0];

  const setMode = (mode: PostcardDraft["mode"]) => onChange((current) => ({ ...current, mode }));
  const setWriting = <K extends keyof PostcardDraft["writing"]>(key: K, value: PostcardDraft["writing"][K]) => {
    onChange((current) => ({ ...current, writing: { ...current.writing, [key]: value } }));
  };

  function swapPhotos(from: number, to: number) {
    if (from === to) return;
    const destinationIndex = orderedPhotoSlots.findIndex((slot) => slot.position === to);
    props.onSwapImages(from, to);
    // Keep the same photo selected as it moves to its new slot.
    setActiveSlot((current) => current === from ? to : current === to ? from : current);
    if (destinationIndex >= 0) {
      setPhotoAnnouncement(`Photo moved to position ${destinationIndex + 1} of ${orderedPhotoSlots.length}.`);
    }
  }

  async function copyProofLink() {
    const url = new URL(globalThis.location.href);
    // Keep the proof payload in the fragment so browsers do not send the
    // fan's message/composition to the web server, access logs, or referrers.
    url.searchParams.delete("proof");
    url.hash = new URLSearchParams({ proof: props.proofToken }).toString();
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), 1800);
    } catch {
      globalThis.prompt("Copy this shareable composition link", url.toString());
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-secondary bg-secondary/45 p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-secondary bg-primary p-1" role="group" aria-label="Customization depth">
            <ModeButton active={draft.mode === "quick"} onClick={() => setMode("quick")}>Quick customize</ModeButton>
            <ModeButton active={draft.mode === "fine"} onClick={() => setMode("fine")}>Fine tune</ModeButton>
          </div>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <SmallButton onClick={props.onUndo} disabled={!props.canUndo} title="Undo the last edit">Undo</SmallButton>
            <SmallButton onClick={props.onRedo} disabled={!props.canRedo} title="Redo the last edit">Redo</SmallButton>
            <SmallButton onClick={() => setShowDrafts((value) => !value)} active={showDrafts}>Drafts</SmallButton>
            <SmallButton onClick={copyProofLink}>{copied ? "Copied" : "Share composition"}</SmallButton>
          </div>
        </div>

        {showDrafts ? (
          <div className="mt-3 rounded-xl border border-secondary bg-primary p-3">
            <div className="flex gap-2">
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value.slice(0, 80))}
                placeholder="Name this draft"
                aria-label="Draft name"
                className="min-w-0 flex-1 rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-primary outline-none focus:border-brand-solid"
              />
              <SmallButton onClick={() => {
                void props.onSaveDraft(draftName).then((saved) => {
                  setNamedSaveNotice(saved ? "Draft saved on this device." : "Draft could not be saved. Check browser storage and try again.");
                  if (saved) setDraftName("");
                });
              }}>Save</SmallButton>
            </div>
            <p className={cn("mt-2 text-xs", props.draftSaveStatus === "error" || namedSaveNotice?.startsWith("Draft could") ? "text-error-primary" : "text-tertiary")} role="status" aria-live="polite">
              {namedSaveNotice ?? (props.draftSaveStatus === "saving" ? "Saving current work…" : props.draftSaveStatus === "saved" ? "Current work saved on this device." : props.draftSaveStatus === "error" ? "Automatic save is unavailable. Keep this tab open or try a named save." : "")}
            </p>
            {props.namedDrafts.length ? (
              <div className="mt-3 grid gap-2">
                {props.namedDrafts.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
                    <button type="button" onClick={() => props.onLoadDraft(entry.id)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-semibold text-primary">{entry.name}</span>
                      <span className="text-[11px] text-tertiary">{new Date(entry.savedAt).toLocaleString()}</span>
                    </button>
                    <button type="button" onClick={() => props.onRemoveDraft(entry.id)} className="rounded-md px-2 py-1 text-xs text-tertiary hover:bg-primary hover:text-error-primary">Remove</button>
                  </div>
                ))}
              </div>
            ) : <p className="mt-2 text-xs text-tertiary">No named drafts yet. Your current work is still saved automatically on this device.</p>}
          </div>
        ) : null}
      </div>

      <RemixTray
        draft={draft}
        onChange={onChange}
        favoriteRemixes={props.favoriteRemixes}
        onToggleFavoriteRemix={props.onToggleFavoriteRemix}
      />

      <Section title="Message style" description="Start with a purpose, then make the note sound like you.">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Message purpose">
          {PURPOSES.map(([value, label]) => (
            <ChoicePill key={value} active={draft.writing.purpose === value} onClick={() => setWriting("purpose", value)}>{label}</ChoicePill>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <TextInput label="Greeting" value={draft.writing.greeting} placeholder="Yo Jason," maxLength={80} onChange={(value) => setWriting("greeting", value)} />
          <TextInput label="Sign-off" value={draft.writing.signoff} placeholder="Keep cooking," maxLength={80} onChange={(value) => setWriting("signoff", value)} />
        </div>
      </Section>

      <Section title={`Photos · ${orderedPhotoSlots.length} slot${orderedPhotoSlots.length === 1 ? "" : "s"}`} description="Each slot can use a different image. Drag to swap, or use the Earlier and Later controls.">
        <p className="sr-only" aria-live="polite" aria-atomic="true">{photoAnnouncement}</p>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3">
          {orderedPhotoSlots.map((slot, index) => (
            <PhotoSlotTile
              key={slot.id}
              slot={slot}
              displayIndex={index}
              total={orderedPhotoSlots.length}
              active={selectedSlot?.id === slot.id}
              onSelect={() => setActiveSlot(slot.position)}
              onPick={(file, origin) => void props.onPickImage(slot.position, file, origin)}
              onRemove={() => props.onRemoveImage(slot.position)}
              onDrop={(from) => swapPhotos(from, slot.position)}
              onMoveEarlier={index > 0 ? () => swapPhotos(slot.position, orderedPhotoSlots[index - 1]!.position) : undefined}
              onMoveLater={index < orderedPhotoSlots.length - 1 ? () => swapPhotos(slot.position, orderedPhotoSlots[index + 1]!.position) : undefined}
            />
          ))}
        </div>

        {props.moments?.length ? (
          <details className="min-w-0 max-w-full overflow-hidden rounded-xl border border-secondary bg-primary p-3">
            <summary className="cursor-pointer text-sm font-semibold text-primary">Choose an approved CORE moment</summary>
            <div className="mt-3 flex w-full min-w-0 max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1">
              {props.moments.map((moment) => (
                <button
                  type="button"
                  key={moment.id}
                  onClick={() => {
                    if (!selectedSlot) return;
                    onChange((current) => updateSlot(current, selectedSlot.position, (slot) => ({
                      ...slot,
                      asset: {
                        id: `moment-${moment.id}`,
                        altText: moment.title,
                        source: {
                          kind: "core-moment",
                          momentId: moment.id,
                          platform: moment.platform,
                          imageUrl: moment.imageUrl,
                          sourceUrl: moment.sourceUrl ?? null,
                          attribution: moment.attribution,
                        },
                      },
                    })));
                  }}
                  className="w-28 shrink-0 overflow-hidden rounded-lg border border-secondary bg-secondary text-left hover:border-brand-solid"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={moment.imageUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                  <span className="block truncate px-2 py-1.5 text-[11px] font-semibold text-primary">{moment.title}</span>
                </button>
              ))}
            </div>
          </details>
        ) : null}
      </Section>

      {draft.mode === "quick" ? (
        <QuickControls draft={draft} onChange={onChange} />
      ) : (
        <FineControls
          draft={draft}
          scheduledMailEnabled={props.scheduledMailEnabled}
          slot={selectedSlot}
          onChange={onChange}
          onAutoRemoveBackground={props.onAutoRemoveBackground}
          onSampleAccent={props.onSampleAccent}
          onSuggestFaceCrop={props.onSuggestFaceCrop}
          onSuggestHorizon={props.onSuggestHorizon}
        />
      )}

      <MemoryBuilder draft={draft} onChange={onChange} />

      <CollectibleControls draft={draft} onChange={onChange} />

      <div className="rounded-xl border border-secondary bg-secondary/55 px-3.5 py-3">
        <p className="text-sm font-semibold text-primary">Collectible copy</p>
        <p className="mt-1 text-xs leading-relaxed text-tertiary">
          Completed live orders can unlock the approved design in your private CORE Passport binder. Any serial is issued by the server after acceptance—this editor never invents rarity or numbers.
        </p>
        <a href="/binder/postcards" className="mt-2 inline-flex text-xs font-semibold text-brand-secondary hover:underline">Open my binder</a>
      </div>
    </div>
  );
}

const REMIX_DIMENSIONS: readonly PostcardRemixDimension[] = ["crop", "colors", "motifs", "texture", "edges", "stamps", "layout"];

function RemixTray({ draft, onChange, favoriteRemixes, onToggleFavoriteRemix }: Pick<Props, "draft" | "onChange" | "favoriteRemixes" | "onToggleFavoriteRemix">) {
  const [traySeed, setTraySeed] = useState(() => draft.variationSeed);
  const alternatives = useMemo(
    () => generatePostcardRemixes(draft, { seed: traySeed }),
    [draft, traySeed],
  );
  function newTray() {
    const token = globalThis.crypto?.randomUUID?.().replaceAll("-", "")
      ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    setTraySeed(`tray-${token}`.slice(0, 80));
  }
  return (
    <Section title="Remix tray" description="Compare six alternatives. Your current card stays untouched until you choose one.">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {alternatives.map((alternative) => {
          const preview = alternative.preview;
          const colors = [
            preview.visual.palette.background,
            preview.visual.palette.primary,
            preview.visual.palette.highlight,
          ].filter((value): value is string => Boolean(value));
          const favorite = favoriteRemixes.includes(alternative.id);
          return (
            <div key={alternative.id} className="overflow-hidden rounded-xl border border-secondary bg-primary">
              <button
                type="button"
                onClick={() => onChange((current) => applyPostcardRemix(current, alternative))}
                className="group block w-full text-left"
                aria-label={`Use remix ${alternative.index + 1}`}
              >
                <span
                  className="relative block aspect-[3/2] overflow-hidden"
                  style={{ background: remixBackground(preview, colors) }}
                >
                  <span className="absolute inset-[12%] rounded-md border-2 border-current/30" style={{ transform: `rotate(${preview.photoSlots[0]?.rotationDeg ?? 0}deg)` }} />
                  <span className="absolute bottom-2 left-2 right-2 truncate bg-black/75 px-2 py-1 text-[9px] font-black uppercase text-white">{preview.fields.headline}</span>
                  <span className="absolute right-2 top-2 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">Use</span>
                </span>
                <span className="block px-2.5 py-2">
                  <span className="block text-xs font-semibold text-primary">Option {alternative.index + 1}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-tertiary">{alternative.changed.length ? alternative.changed.map(labelize).join(" · ") : "Locked look"}</span>
                </span>
              </button>
              <button type="button" onClick={() => onToggleFavoriteRemix(alternative.id)} aria-pressed={favorite} className="w-full border-t border-secondary px-2.5 py-1.5 text-left text-[10px] font-semibold text-tertiary hover:bg-secondary hover:text-primary">{favorite ? "♥ Favorited" : "♡ Favorite"}</button>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-tertiary">Lock before remixing</span>
        {REMIX_DIMENSIONS.map((dimension) => (
          <ChoicePill
            key={dimension}
            active={draft.remixLocks[dimension]}
            onClick={() => onChange((current) => ({ ...current, remixLocks: { ...current.remixLocks, [dimension]: !current.remixLocks[dimension] } }))}
          >
            {draft.remixLocks[dimension] ? "🔒 " : ""}{labelize(dimension)}
          </ChoicePill>
        ))}
        <SmallButton onClick={newTray}>New six</SmallButton>
      </div>
    </Section>
  );
}

function QuickControls({ draft, onChange }: Pick<Props, "draft" | "onChange">) {
  return (
    <Section title="Look" description="Big visual choices that stay creator-approved and print-safe.">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PALETTES.map((palette) => (
          <button
            key={palette.id}
            type="button"
            onClick={() => onChange((current) => ({
              ...current,
              visual: {
                ...current.visual,
                palettePresetId: palette.id === "creator" ? null : palette.id,
                palette: {
                  ...current.visual.palette,
                  background: palette.colors[0],
                  ink: palette.colors[1],
                  primary: palette.colors[2],
                },
              },
            }))}
            aria-pressed={(draft.visual.palettePresetId ?? "creator") === palette.id}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition-colors",
              (draft.visual.palettePresetId ?? "creator") === palette.id ? "border-brand-solid bg-brand-solid/10 text-primary" : "border-secondary bg-primary text-secondary hover:border-primary",
            )}
          >
            <span className="flex -space-x-1">
              {(palette.colors[0] ? palette.colors : ["#e7005a", "#111111", "#f4f4f4"]).map((color, index) => <span key={index} className="size-4 rounded-full ring-1 ring-white/35" style={{ background: color ?? undefined }} />)}
            </span>
            {palette.label}
          </button>
        ))}
      </div>
      <SelectControl
        label="Background"
        value={draft.visual.background.type}
        options={BACKGROUNDS}
        onChange={(value) => onChange((current) => ({ ...current, visual: { ...current.visual, background: { ...current.visual.background, type: value as PostcardDraft["visual"]["background"]["type"], colors: value === "template" ? [] : current.visual.background.colors.length ? current.visual.background.colors : ["#e7005a", "#171719"] } } }))}
      />
    </Section>
  );
}

function FineControls({
  draft,
  scheduledMailEnabled,
  slot,
  onChange,
  onAutoRemoveBackground,
  onSampleAccent,
  onSuggestFaceCrop,
  onSuggestHorizon,
}: Pick<Props, "draft" | "scheduledMailEnabled" | "onChange" | "onAutoRemoveBackground" | "onSampleAccent" | "onSuggestFaceCrop" | "onSuggestHorizon"> & { slot?: PostcardPhotoSlot }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      {slot ? (
        <Section title={`Photo ${slot.position + 1} controls`} description="Crop and finish this slot independently.">
          <Range label="Horizontal focal point" value={slot.focalPoint.x} min={0} max={1} step={0.01} output={`${Math.round(slot.focalPoint.x * 100)}%`} onChange={(value) => onChange((current) => updateSlot(current, slot.position, (item) => ({ ...item, focalPoint: { ...item.focalPoint, x: value } })))} />
          <Range label="Vertical focal point" value={slot.focalPoint.y} min={0} max={1} step={0.01} output={`${Math.round(slot.focalPoint.y * 100)}%`} onChange={(value) => onChange((current) => updateSlot(current, slot.position, (item) => ({ ...item, focalPoint: { ...item.focalPoint, y: value } })))} />
          <Range label="Zoom" value={slot.zoom} min={1} max={5} step={0.05} output={`${slot.zoom.toFixed(2)}×`} onChange={(value) => onChange((current) => updateSlot(current, slot.position, (item) => ({ ...item, zoom: value })))} />
          <Range label="Rotation" value={slot.rotationDeg} min={-180} max={180} step={1} output={`${Math.round(slot.rotationDeg)}°`} onChange={(value) => onChange((current) => updateSlot(current, slot.position, (item) => ({ ...item, rotationDeg: value })))} />
          <div className="flex flex-wrap gap-1.5">
            <ChoicePill active={slot.flipHorizontal} onClick={() => onChange((current) => updateSlot(current, slot.position, (item) => ({ ...item, flipHorizontal: !item.flipHorizontal })))}>Flip horizontal</ChoicePill>
            <ChoicePill active={slot.flipVertical} onClick={() => onChange((current) => updateSlot(current, slot.position, (item) => ({ ...item, flipVertical: !item.flipVertical })))}>Flip vertical</ChoicePill>
            <ChoicePill active={slot.subjectOverlap} onClick={() => onChange((current) => updateSlot(current, slot.position, (item) => ({ ...item, subjectOverlap: !item.subjectOverlap })))}>Subject overlap</ChoicePill>
            {slot.asset ? <ChoicePill active={false} onClick={() => void onSuggestFaceCrop(slot.position)}>Suggest face crop</ChoicePill> : null}
            {slot.asset ? <ChoicePill active={false} onClick={() => void onSuggestHorizon(slot.position)}>Level horizon</ChoicePill> : null}
            {slot.asset?.source.kind === "embedded" ? (
              <>
                <ChoicePill active={slot.adjustments.backgroundRemoved} onClick={() => void onAutoRemoveBackground(slot.position)}>{slot.adjustments.backgroundRemoved ? "Re-cut background" : "Remove background"}</ChoicePill>
                <ChoicePill active={draft.visual.palette.sampleAccentFromSlotId === slot.id} onClick={() => void onSampleAccent(slot.position)}>Sample accent</ChoicePill>
              </>
            ) : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <SelectControl label="Mask" value={slot.mask} options={IMAGE_MASKS} onChange={(value) => onChange((current) => updateSlot(current, slot.position, (item) => ({ ...item, mask: value as PostcardPhotoSlot["mask"] })))} />
            <SelectControl label="Border" value={slot.border} options={IMAGE_BORDERS} onChange={(value) => onChange((current) => updateSlot(current, slot.position, (item) => ({ ...item, border: value as PostcardPhotoSlot["border"] })))} />
            <SelectControl label="Attachment" value={slot.attachment} options={ATTACHMENTS} onChange={(value) => onChange((current) => updateSlot(current, slot.position, (item) => ({ ...item, attachment: value as PostcardPhotoSlot["attachment"] })))} />
          </div>
          <TextInput label="Photo caption" value={slot.caption} placeholder="What happened here?" maxLength={240} onChange={(value) => onChange((current) => updateSlot(current, slot.position, (item) => ({ ...item, caption: value })))} />
          <div className="grid gap-3 sm:grid-cols-2">
            {(["exposure", "contrast", "warmth", "saturation"] as const).map((key) => (
              <Range key={key} label={labelize(key)} value={slot.adjustments[key]} min={-1} max={1} step={0.02} output={slot.adjustments[key].toFixed(2)} onChange={(value) => onChange((current) => updateSlot(current, slot.position, (item) => ({ ...item, adjustments: { ...item.adjustments, [key]: value } })))} />
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <TextInput label="Duotone shadow" value={slot.adjustments.duotone?.shadow ?? "#151515"} type="color" onChange={(value) => onChange((current) => updateSlot(current, slot.position, (item) => ({ ...item, adjustments: { ...item.adjustments, duotone: { shadow: value, highlight: item.adjustments.duotone?.highlight ?? "#f4e7ff" } } })))} />
            <TextInput label="Duotone highlight" value={slot.adjustments.duotone?.highlight ?? "#f4e7ff"} type="color" onChange={(value) => onChange((current) => updateSlot(current, slot.position, (item) => ({ ...item, adjustments: { ...item.adjustments, duotone: { shadow: item.adjustments.duotone?.shadow ?? "#151515", highlight: value } } })))} />
          </div>
          {slot.adjustments.duotone ? <SmallButton onClick={() => onChange((current) => updateSlot(current, slot.position, (item) => ({ ...item, adjustments: { ...item.adjustments, duotone: null } })))}>Remove duotone</SmallButton> : null}
        </Section>
      ) : null}

      <Section title="Print treatment" description="Effects are bounded printed graphics—never fake physical foil or postage.">
        <div className="grid gap-2 sm:grid-cols-3">
          <SelectControl label="Texture" value={draft.visual.texture} options={TEXTURES} onChange={(value) => onChange((current) => ({ ...current, visual: { ...current.visual, texture: value as PostcardDraft["visual"]["texture"] } }))} />
          <SelectControl label="Edge" value={draft.visual.edge} options={EDGES} onChange={(value) => onChange((current) => ({ ...current, visual: { ...current.visual, edge: value as PostcardDraft["visual"]["edge"] } }))} />
          <SelectControl label="Frame" value={draft.visual.frame} options={FRAMES} onChange={(value) => onChange((current) => ({ ...current, visual: { ...current.visual, frame: value as PostcardDraft["visual"]["frame"] } }))} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            ["grain", "Grain"],
            ["halftoneDotSize", "Halftone dots"],
            ["scanlineDensity", "CRT scanlines"],
            ["signalDistortion", "Signal distortion"],
            ["colorSeparation", "Color separation"],
            ["inkBleed", "Ink bleed"],
            ["registrationOffset", "Registration offset"],
          ] as const).map(([key, label]) => (
            <Range key={key} label={label} value={draft.visual.effects[key]} min={0} max={1} step={0.02} output={`${Math.round(draft.visual.effects[key] * 100)}%`} onChange={(value) => onChange((current) => ({ ...current, visual: { ...current.visual, effects: { ...current.visual.effects, [key]: value } } }))} />
          ))}
        </div>
      </Section>

      <Section title="Editable card fields" description="Templates use only the fields that fit their approved layout.">
        <div className="grid gap-2 sm:grid-cols-2">
          {(["headline", "caption", "issueNumber", "date", "score", "location"] as const).map((key) => (
            <TextInput key={key} label={labelize(key)} value={draft.fields[key]} maxLength={key === "caption" ? 240 : 160} onChange={(value) => onChange((current) => ({ ...current, fields: { ...current.fields, [key]: value } }))} />
          ))}
        </div>
        <StatsEditor draft={draft} onChange={onChange} />
      </Section>

      <RecipientDesignTools draft={draft} onChange={onChange} />

      <Section title="Writing side" description="Choose how the note looks without changing the postal clear zone.">
        <div className="grid gap-2 sm:grid-cols-3">
          <SelectControl label="Lettering" value={draft.writing.lettering} options={["template", "handwritten", "marker", "ballpoint", "label-maker", "typewriter"]} onChange={(value) => onChange((current) => ({ ...current, writing: { ...current.writing, lettering: value as PostcardDraft["writing"]["lettering"] } }))} />
          <SelectControl label="Alignment" value={draft.writing.alignment} options={["left", "center", "letter"]} onChange={(value) => onChange((current) => ({ ...current, writing: { ...current.writing, alignment: value as PostcardDraft["writing"]["alignment"] } }))} />
          <SelectControl label="Paper" value={draft.writing.paper} options={["template", "plain", "lined", "notebook", "editorial", "stat-sheet"]} onChange={(value) => onChange((current) => ({ ...current, writing: { ...current.writing, paper: value as PostcardDraft["writing"]["paper"] } }))} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["full-name", "handle", "anonymous"] as const).map((value) => <ChoicePill key={value} active={draft.writing.senderVisibility === value} onClick={() => onChange((current) => ({ ...current, writing: { ...current.writing, senderVisibility: value } }))}>{labelize(value)}</ChoicePill>)}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <TextInput label="Featured quote (optional)" value={draft.writing.featuredQuote} maxLength={240} onChange={(value) => onChange((current) => ({ ...current, writing: { ...current.writing, featuredQuote: value } }))} />
          <TextInput label="Why this moment mattered" value={draft.writing.whyMomentMattered} maxLength={300} onChange={(value) => onChange((current) => ({ ...current, writing: { ...current.writing, whyMomentMattered: value } }))} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <SelectControl label="Second language" value={draft.writing.secondaryLanguage} options={["none", "spanish", "french", "portuguese"]} onChange={(value) => onChange((current) => ({ ...current, writing: { ...current.writing, secondaryLanguage: value as PostcardDraft["writing"]["secondaryLanguage"], secondaryMessage: value === "none" ? "" : current.writing.secondaryMessage } }))} />
          {scheduledMailEnabled ? (
            <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-secondary">
              <span>Mailing date (optional)</span>
              <input
                type="date"
                min={mailingDateBounds().min}
                max={mailingDateBounds().max}
                value={toDateValue(draft.writing.scheduledFor)}
                onChange={(event) => onChange((current) => ({
                  ...current,
                  writing: {
                    ...current.writing,
                    scheduledFor: event.target.value ? `${event.target.value}T00:00:00.000Z` : null,
                  },
                }))}
                className="min-h-10 rounded-lg border border-secondary bg-primary px-2.5 text-sm font-medium text-primary outline-none focus:border-brand-solid"
              />
            </label>
          ) : draft.writing.scheduledFor ? (
            <div className="rounded-lg border border-warning-primary/30 bg-warning-secondary px-3 py-2 text-xs text-warning-primary">
              <p className="font-semibold">Scheduled mailing is unavailable for this print account.</p>
              <button
                type="button"
                className="mt-1 font-semibold underline underline-offset-2"
                onClick={() => onChange((current) => ({
                  ...current,
                  writing: { ...current.writing, scheduledFor: null },
                }))}
              >
                Clear saved mailing date
              </button>
            </div>
          ) : null}
        </div>
        {draft.writing.secondaryLanguage !== "none" ? (
          <TextArea label={`${labelize(draft.writing.secondaryLanguage)} version`} value={draft.writing.secondaryMessage} onChange={(value) => onChange((current) => ({ ...current, writing: { ...current.writing, secondaryMessage: value.slice(0, 380) } }))} />
        ) : null}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-secondary">Content notes (optional)</p>
          <div className="flex flex-wrap gap-1.5">
            {(["grief", "illness", "loss", "mental-health", "violence", "other"] as const).map((warning) => (
              <ChoicePill key={warning} active={draft.writing.contentWarnings.includes(warning)} onClick={() => onChange((current) => ({ ...current, writing: { ...current.writing, contentWarnings: current.writing.contentWarnings.includes(warning) ? current.writing.contentWarnings.filter((value) => value !== warning) : [...current.writing.contentWarnings, warning] } }))}>{labelize(warning)}</ChoicePill>
            ))}
          </div>
        </div>
        <GroupSigners draft={draft} onChange={onChange} />
        <SignaturePad draft={draft} onChange={onChange} />
      </Section>
    </div>
  );
}

function MemoryBuilder({ draft, onChange }: Pick<Props, "draft" | "onChange">) {
  const [open, setOpen] = useState(false);
  const answers = draft.memory;
  function update<K extends keyof PostcardDraft["memory"]>(key: K, value: PostcardDraft["memory"][K]) {
    onChange((current) => ({ ...current, memory: { ...current.memory, [key]: value } }));
  }
  function buildMessage() {
    const pieces = [
      answers.occasion ? `I keep thinking about ${answers.occasion}${answers.location ? ` at ${answers.location}` : ""}.` : "",
      answers.favoriteMoment ? `My favorite part was ${answers.favoriteMoment}.` : "",
      answers.insideJoke ? `And I still laugh about ${answers.insideJoke}.` : "",
      answers.whyItMattered ? `It mattered because ${answers.whyItMattered}.` : "",
    ].filter(Boolean);
    const next = pieces.join(" ").slice(0, 380);
    if (!next) return;
    onChange((current) => ({ ...current, writing: { ...current.writing, message: next, purpose: "memory" }, fields: { ...current.fields, date: answers.happenedOn || current.fields.date, location: answers.location || current.fields.location } }));
  }
  return (
    <div className="rounded-xl border border-secondary bg-primary">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left">
        <span><span className="block text-sm font-semibold text-primary">Guided memory builder</span><span className="mt-0.5 block text-xs text-tertiary">Answer a few prompts and turn the story into editable card copy.</span></span>
        <span aria-hidden className="text-tertiary">{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div className="grid gap-2 border-t border-secondary p-3.5 sm:grid-cols-2">
          <TextInput label="Occasion or moment" value={answers.occasion} onChange={(value) => update("occasion", value)} />
          <TextInput label="When" value={answers.happenedOn} onChange={(value) => update("happenedOn", value)} />
          <TextInput label="Where" value={answers.location} onChange={(value) => update("location", value)} />
          <TextInput label="Who was there" value={answers.people} onChange={(value) => update("people", value)} />
          <TextArea label="Favorite part" value={answers.favoriteMoment} onChange={(value) => update("favoriteMoment", value)} />
          <TextArea label="Why it mattered" value={answers.whyItMattered} onChange={(value) => update("whyItMattered", value)} />
          <TextArea label="Inside joke" value={answers.insideJoke} onChange={(value) => update("insideJoke", value)} />
          <SelectControl label="Tone" value={answers.desiredTone} options={["unspecified", "sincere", "funny", "hype", "nostalgic", "roast"]} onChange={(value) => update("desiredTone", value as PostcardDraft["memory"]["desiredTone"])} />
          <div className="sm:col-span-2"><SmallButton onClick={buildMessage}>Build an editable message</SmallButton></div>
        </div>
      ) : null}
    </div>
  );
}

function CollectibleControls({ draft, onChange }: Pick<Props, "draft" | "onChange">) {
  const [open, setOpen] = useState(false);
  const detail = (id: string) => draft.creatorFields.values[id] ?? "";
  function setDetail(id: string, value: string) {
    onChange((current) => {
      const values = { ...current.creatorFields.values };
      if (value) values[id] = value;
      else delete values[id];
      return { ...current, creatorFields: { ...current.creatorFields, values } };
    });
  }
  return (
    <div className="rounded-xl border border-secondary bg-primary">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left">
        <span><span className="block text-sm font-semibold text-primary">CORE set & milestone details</span><span className="mt-0.5 block text-xs text-tertiary">Build a crossover, milestone, season, trip, or yearbook edition. Variants are chosen—not randomized.</span></span>
        <span aria-hidden className="text-tertiary">{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div className="grid gap-3 border-t border-secondary p-3.5">
          <div className="grid gap-2 sm:grid-cols-3">
            <SelectControl label="Crossover" value={detail("crossover-format")} options={["", "Solo", "Duo", "Trio", "Full house"]} onChange={(value) => setDetail("crossover-format", value)} />
            <TextInput label="Featured members" value={detail("featured-members")} placeholder="Ron + Jason + Lacy" maxLength={160} onChange={(value) => setDetail("featured-members", value)} />
            <SelectControl label="Edition type" value={detail("edition-type")} options={["", "Moment", "First stream", "Channel anniversary", "Event", "Trip", "Tournament", "House move", "Yearbook"]} onChange={(value) => setDetail("edition-type", value)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <SelectControl label="Milestone" value={detail("milestone-kind")} options={["", "Followers", "Subscribers", "Airtime", "Viewership", "Watchtime"]} onChange={(value) => setDetail("milestone-kind", value)} />
            <TextInput label="Verified milestone value" value={detail("milestone-value")} placeholder="1,000,000 followers" maxLength={160} onChange={(value) => setDetail("milestone-value", value)} />
            <TextInput label="Watching since" value={detail("watching-since")} placeholder="2021" maxLength={160} onChange={(value) => setDetail("watching-since", value)} />
          </div>
          <TextInput label="Favorite CORE era / series" value={detail("core-era")} placeholder="The first house era" maxLength={160} onChange={(value) => setDetail("core-era", value)} />
          <div>
            <p className="mb-2 text-xs font-semibold text-secondary">Artwork composition</p>
            <div className="flex flex-wrap gap-1.5">
              {(["Single-card artwork", "Matching-pair artwork", "Panoramic artwork"] as const).map((value) => <ChoicePill key={value} active={detail("artwork-composition") === value} onClick={() => setDetail("artwork-composition", detail("artwork-composition") === value ? "" : value)}>{value}</ChoicePill>)}
            </div>
            <p className="mt-1.5 text-[11px] text-tertiary">This changes the artwork’s visual composition only; it does not add postcards or promise a fulfillment bundle.</p>
          </div>
          <p className="text-[11px] leading-relaxed text-tertiary">Any official set, variant, serial, or limited-drop inventory is assigned by the server after an eligible product is selected. Creative details here never invent scarcity or guarantee stock.</p>
        </div>
      ) : null}
    </div>
  );
}

function PhotoSlotTile({
  slot,
  displayIndex,
  total,
  active,
  onSelect,
  onPick,
  onRemove,
  onDrop,
  onMoveEarlier,
  onMoveLater,
}: {
  slot: PostcardPhotoSlot;
  displayIndex: number;
  total: number;
  active: boolean;
  onSelect: () => void;
  onPick: (file: File, origin: "upload" | "clipboard" | "camera") => void;
  onRemove: () => void;
  onDrop: (from: number) => void;
  onMoveEarlier?: () => void;
  onMoveLater?: () => void;
}) {
  const preview = assetPreview(slot);
  const [dragOver, setDragOver] = useState(false);
  const slotNumber = displayIndex + 1;
  async function pasteFromClipboard() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((candidate) => candidate.startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        onPick(new File([blob], `clipboard-${Date.now()}.${type.split("/")[1] ?? "png"}`, { type }), "clipboard");
        return;
      }
    } catch {
      // The visible file controls remain available when clipboard permission is denied.
    }
  }
  function dragStart(event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.setData("application/x-core-postcard-slot", String(slot.position));
    event.dataTransfer.effectAllowed = "move";
  }
  function handleSlotKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!slot.asset || !event.altKey) return;
    if (event.key === "ArrowLeft" && onMoveEarlier) {
      event.preventDefault();
      onMoveEarlier();
    } else if (event.key === "ArrowRight" && onMoveLater) {
      event.preventDefault();
      onMoveLater();
    }
  }
  return (
    <div
      draggable={Boolean(slot.asset)}
      onDragStart={dragStart}
      onDragEnd={() => setDragOver(false)}
      onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => { event.preventDefault(); setDragOver(false); const from = Number(event.dataTransfer.getData("application/x-core-postcard-slot")); if (Number.isInteger(from)) onDrop(from); }}
      className={cn("min-w-0 rounded-xl border bg-primary transition-colors", active || dragOver ? "border-brand-solid ring-2 ring-brand-solid/20" : "border-secondary")}
    >
      <button
        type="button"
        onClick={onSelect}
        onKeyDown={handleSlotKeyDown}
        aria-label={`Select photo slot ${slotNumber} of ${total}${slot.asset && total > 1 ? ". Press Alt plus Left or Right Arrow to reorder." : ""}`}
        aria-keyshortcuts={slot.asset && total > 1 ? "Alt+ArrowLeft Alt+ArrowRight" : undefined}
        className="relative block aspect-[4/3] w-full overflow-hidden rounded-t-[11px] bg-secondary text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-solid"
      >
        {preview ? <img src={preview} alt={slot.asset?.altText ?? ""} className="size-full object-cover" style={{ objectPosition: `${slot.focalPoint.x * 100}% ${slot.focalPoint.y * 100}%` }} /> : <span className="grid size-full place-items-center text-xs text-tertiary">Photo {slotNumber}</span>}
        <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-1 text-[10px] font-bold text-white">{slotNumber}/{total}</span>
      </button>
      <div className="flex min-w-0 flex-wrap gap-1 p-1.5">
        <label className="relative inline-flex min-h-11 cursor-pointer items-center rounded-md px-2 text-[11px] font-semibold text-secondary hover:bg-secondary hover:text-primary focus-within:ring-2 focus-within:ring-brand-solid">
          Upload<input type="file" accept="image/jpeg,image/png,image/webp" className="absolute inset-0 size-full cursor-pointer opacity-0" onChange={(event) => { const file = event.target.files?.[0]; if (file) onPick(file, "upload"); event.currentTarget.value = ""; }} />
        </label>
        <label className="relative inline-flex min-h-11 cursor-pointer items-center rounded-md px-2 text-[11px] font-semibold text-secondary hover:bg-secondary hover:text-primary focus-within:ring-2 focus-within:ring-brand-solid">
          Camera<input type="file" accept="image/*" capture="environment" className="absolute inset-0 size-full cursor-pointer opacity-0" onChange={(event) => { const file = event.target.files?.[0]; if (file) onPick(file, "camera"); event.currentTarget.value = ""; }} />
        </label>
        <button type="button" onClick={pasteFromClipboard} className="min-h-11 rounded-md px-2 text-[11px] font-semibold text-secondary hover:bg-secondary hover:text-primary">Paste</button>
        {slot.asset ? <button type="button" onClick={onRemove} className="ml-auto min-h-11 rounded-md px-2 text-[11px] font-semibold text-error-primary hover:bg-error-secondary">Remove</button> : null}
        {slot.asset && total > 1 ? (
          <div className="grid w-full min-w-0 grid-cols-2 gap-1 border-t border-secondary pt-1" role="group" aria-label={`Reorder photo ${slotNumber} of ${total}`}>
            <button
              type="button"
              onClick={onMoveEarlier}
              disabled={!onMoveEarlier}
              aria-label={`Move photo ${slotNumber} earlier`}
              className="min-h-11 min-w-0 rounded-md px-2 py-1 text-[11px] font-semibold text-secondary hover:bg-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-35"
            >
              <span aria-hidden="true">←</span> Earlier
            </button>
            <button
              type="button"
              onClick={onMoveLater}
              disabled={!onMoveLater}
              aria-label={`Move photo ${slotNumber} later`}
              className="min-h-11 min-w-0 rounded-md px-2 py-1 text-[11px] font-semibold text-secondary hover:bg-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-35"
            >
              Later <span aria-hidden="true">→</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatsEditor({ draft, onChange }: Pick<Props, "draft" | "onChange">) {
  const stats = draft.fields.stats;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-secondary">Stats</p>
        <SmallButton disabled={stats.length >= 8} onClick={() => onChange((current) => ({ ...current, fields: { ...current.fields, stats: [...current.fields.stats, { id: `stat-${Date.now().toString(36)}`, label: "Stat", value: "99" }] } }))}>Add stat</SmallButton>
      </div>
      <div className="mt-2 grid gap-2">
        {stats.map((stat, index) => (
          <div key={stat.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input aria-label={`Stat ${index + 1} label`} value={stat.label} maxLength={60} onChange={(event) => onChange((current) => ({ ...current, fields: { ...current.fields, stats: current.fields.stats.map((item) => item.id === stat.id ? { ...item, label: event.target.value } : item) } }))} className="min-w-0 rounded-lg border border-secondary bg-primary px-2.5 py-2 text-xs text-primary outline-none focus:border-brand-solid" />
            <input aria-label={`Stat ${index + 1} value`} value={stat.value} maxLength={60} onChange={(event) => onChange((current) => ({ ...current, fields: { ...current.fields, stats: current.fields.stats.map((item) => item.id === stat.id ? { ...item, value: event.target.value } : item) } }))} className="min-w-0 rounded-lg border border-secondary bg-primary px-2.5 py-2 text-xs text-primary outline-none focus:border-brand-solid" />
            <button type="button" aria-label={`Remove stat ${index + 1}`} onClick={() => onChange((current) => ({ ...current, fields: { ...current.fields, stats: current.fields.stats.filter((item) => item.id !== stat.id) } }))} className="rounded-lg px-2 text-tertiary hover:bg-error-secondary hover:text-error-primary">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecipientDesignTools({ draft, onChange }: Pick<Props, "draft" | "onChange">) {
  const definition = POSTCARD_CREATOR_FIELD_DEFINITIONS[draft.recipientSlug];
  const activeFields = creatorFieldDefinitionsFor(draft.recipientSlug, draft.designId)
    .filter((field) => field.section !== "collection");
  function valueFor(id: string): string {
    return draft.creatorFields.values[id] ?? "";
  }
  function setValue(field: PostcardCreatorFieldDefinition, value: string) {
    onChange((current) => {
      const values = { ...current.creatorFields.values };
      if (value) values[field.id] = value;
      else delete values[field.id];
      return { ...current, creatorFields: { ...current.creatorFields, values } };
    });
  }
  return (
    <Section title={definition.title} description="Controls are scoped to this design and print in its native visual language.">
      <div className="grid gap-2 sm:grid-cols-2">
        {activeFields.map((field) => field.options ? (
          <SelectControl key={field.id} label={field.label} value={valueFor(field.id)} options={["", ...field.options]} onChange={(value) => setValue(field, value)} />
        ) : (
          <TextInput key={field.id} label={field.label} value={valueFor(field.id)} placeholder={field.placeholder} maxLength={160} onChange={(value) => setValue(field, value)} />
        ))}
      </div>
    </Section>
  );
}

function GroupSigners({ draft, onChange }: Pick<Props, "draft" | "onChange">) {
  const [name, setName] = useState("");
  const signers = draft.writing.groupSigners;
  return (
    <div className="rounded-lg border border-secondary bg-secondary/45 p-3">
      <p className="text-xs font-semibold text-secondary">Group card signatures</p>
      <div className="mt-2 flex gap-2">
        <input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); const trimmed = name.trim(); if (trimmed && signers.length < 12) { onChange((current) => ({ ...current, writing: { ...current.writing, groupSigners: [...current.writing.groupSigners, trimmed] } })); setName(""); } } }} placeholder="Friend's name or handle" aria-label="Add group signer" className="min-w-0 flex-1 rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-primary outline-none focus:border-brand-solid" />
        <SmallButton disabled={!name.trim() || signers.length >= 12} onClick={() => { const trimmed = name.trim(); if (!trimmed) return; onChange((current) => ({ ...current, writing: { ...current.writing, groupSigners: [...current.writing.groupSigners, trimmed] } })); setName(""); }}>Add</SmallButton>
      </div>
      {signers.length ? <div className="mt-2 flex flex-wrap gap-1.5">{signers.map((signer, index) => <button key={`${signer}-${index}`} type="button" title="Remove signer" onClick={() => onChange((current) => ({ ...current, writing: { ...current.writing, groupSigners: current.writing.groupSigners.filter((_, signerIndex) => signerIndex !== index) } }))} className="rounded-full border border-secondary bg-primary px-2.5 py-1 text-xs font-medium text-secondary hover:border-error-primary hover:text-error-primary">{signer} ×</button>)}</div> : <p className="mt-1.5 text-[11px] text-tertiary">Add up to 12 friends; their names print together on the writing side.</p>}
    </div>
  );
}

const SIGNATURE_LIBRARY_KEY = "coreboys:postcard:signatures:v1";
type SavedSignature = { id: string; label: string; dataUrl: string };

function SignaturePad({ draft, onChange }: Pick<Props, "draft" | "onChange">) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [label, setLabel] = useState(draft.writing.savedSignatureLabel);
  const [saved, setSaved] = useState<SavedSignature[]>([]);

  useEffect(() => {
    try {
      const value = JSON.parse(globalThis.localStorage?.getItem(SIGNATURE_LIBRARY_KEY) ?? "[]") as unknown;
      if (Array.isArray(value)) {
        setSaved(value.filter((entry): entry is SavedSignature => Boolean(entry && typeof entry === "object" && typeof (entry as SavedSignature).id === "string" && typeof (entry as SavedSignature).label === "string" && /^data:image\/png;base64,/.test((entry as SavedSignature).dataUrl))).slice(0, 8));
      }
    } catch {
      setSaved([]);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!draft.writing.signatureDataUrl) return;
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = draft.writing.signatureDataUrl;
  }, [draft.writing.signatureDataUrl]);

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * canvas.width, y: ((event.clientY - rect.top) / rect.height) * canvas.height };
  }
  function begin(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const current = point(event);
    context.beginPath();
    context.moveTo(current.x, current.y);
    context.strokeStyle = "#141414";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
  }
  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const current = point(event);
    context.lineTo(current.x, current.y);
    context.stroke();
  }
  function finish(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const dataUrl = event.currentTarget.toDataURL("image/png");
    if (dataUrl.length <= 220_000) onChange((current) => ({ ...current, writing: { ...current.writing, signatureDataUrl: dataUrl } }));
  }
  function clear() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    onChange((current) => ({ ...current, writing: { ...current.writing, signatureDataUrl: null, savedSignatureLabel: "" } }));
  }
  function saveReusable() {
    const dataUrl = draft.writing.signatureDataUrl;
    const trimmed = label.trim().slice(0, 80);
    if (!dataUrl || !trimmed) return;
    const entry = { id: `signature-${Date.now().toString(36)}`, label: trimmed, dataUrl };
    const next = [entry, ...saved].slice(0, 8);
    setSaved(next);
    try { globalThis.localStorage?.setItem(SIGNATURE_LIBRARY_KEY, JSON.stringify(next)); } catch { /* Local reuse is optional. */ }
    onChange((current) => ({ ...current, writing: { ...current.writing, savedSignatureLabel: trimmed } }));
  }
  return (
    <div className="rounded-lg border border-secondary bg-secondary/45 p-3">
      <div className="flex items-center justify-between gap-2"><div><p className="text-xs font-semibold text-secondary">Draw your signature</p><p className="text-[11px] text-tertiary">Use a mouse, stylus, or finger. It remains private unless you submit the postcard.</p></div>{draft.writing.signatureDataUrl ? <SmallButton onClick={clear}>Clear</SmallButton> : null}</div>
      <canvas ref={canvasRef} width={600} height={160} onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} className="mt-2 aspect-[15/4] w-full touch-none cursor-crosshair rounded-lg bg-white ring-1 ring-black/10" aria-label="Signature drawing pad" />
      <p className="mt-2 text-[11px] text-tertiary">Keyboard alternative: use the <a href="#postcard-sender-name" className="font-semibold underline underline-offset-2 hover:text-primary">Sign it</a> text field below.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
        <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Save as, e.g. My marker signature" aria-label="Reusable signature name" className="min-w-0 rounded-lg border border-secondary bg-primary px-3 py-2 text-xs text-primary outline-none focus:border-brand-solid" />
        <SmallButton disabled={!draft.writing.signatureDataUrl || !label.trim()} onClick={saveReusable}>Save treatment</SmallButton>
      </div>
      {saved.length ? <div className="mt-2 flex flex-wrap gap-1.5">{saved.map((signature) => <button key={signature.id} type="button" onClick={() => onChange((current) => ({ ...current, writing: { ...current.writing, signatureDataUrl: signature.dataUrl, savedSignatureLabel: signature.label } }))} className="rounded-full border border-secondary bg-primary px-2.5 py-1 text-[11px] font-medium text-secondary hover:border-brand-solid hover:text-primary">{signature.label}</button>)}</div> : null}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-secondary bg-primary p-3.5"><div className="min-w-0"><h3 className="text-sm font-semibold text-primary">{title}</h3>{description ? <p className="mt-0.5 text-xs leading-relaxed text-tertiary">{description}</p> : null}</div>{children}</section>;
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={cn("min-h-11 rounded-lg px-3 py-2 text-xs font-semibold transition-colors", active ? "bg-brand-solid text-white shadow-xs" : "text-tertiary hover:bg-secondary hover:text-primary")}>{children}</button>;
}

function SmallButton({ onClick, disabled, active, title, children }: { onClick: () => void; disabled?: boolean; active?: boolean; title?: string; children: ReactNode }) {
  return <button type="button" onClick={onClick} disabled={disabled} title={title} className={cn("min-h-11 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35", active ? "border-brand-solid bg-brand-solid/10 text-brand-secondary" : "border-secondary bg-primary text-secondary hover:border-primary hover:text-primary")}>{children}</button>;
}

function ChoicePill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={cn("min-h-11 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors", active ? "border-brand-solid bg-brand-solid/10 text-brand-secondary" : "border-secondary bg-primary text-tertiary hover:border-primary hover:text-primary")}>{children}</button>;
}

function TextInput({ label, value, onChange, placeholder, maxLength = 160, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; maxLength?: number; type?: "text" | "color" }) {
  return <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-secondary"><span>{label}</span><input type={type} value={value} placeholder={placeholder} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} className={cn("rounded-lg border border-secondary bg-primary text-sm text-primary outline-none focus:border-brand-solid", type === "color" ? "h-10 w-full cursor-pointer p-1" : "px-3 py-2")} /></label>;
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="flex flex-col gap-1 text-xs font-semibold text-secondary"><span>{label}</span><textarea value={value} maxLength={500} rows={2} onChange={(event) => onChange(event.target.value)} className="resize-none rounded-lg border border-secondary bg-primary px-3 py-2 text-sm font-normal text-primary outline-none focus:border-brand-solid" /></label>;
}

function SelectControl({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-secondary"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-10 min-w-0 w-full rounded-lg border border-secondary bg-primary px-2.5 text-sm font-medium text-primary outline-none focus:border-brand-solid">{options.map((option) => <option key={option || "__empty"} value={option}>{option ? labelize(option) : "Not set"}</option>)}</select></label>;
}

function Range({ label, value, min, max, step, output, onChange }: { label: string; value: number; min: number; max: number; step: number; output: string; onChange: (value: number) => void }) {
  return <label className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 text-xs font-semibold text-secondary"><span>{label}</span><output className="font-mono text-[11px] text-tertiary">{output}</output><input className="col-span-2 w-full cursor-pointer accent-brand-solid" type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function updateSlot(draft: PostcardDraft, position: number, updater: (slot: PostcardPhotoSlot) => PostcardPhotoSlot): PostcardDraft {
  return { ...draft, photoSlots: draft.photoSlots.map((slot) => slot.position === position ? updater(slot) : slot) };
}

function assetPreview(slot: PostcardPhotoSlot): string | null {
  if (!slot.asset) return null;
  const source = slot.asset.source;
  if (source.kind === "embedded") return source.dataUrl;
  if (source.kind === "managed") return source.previewUrl;
  return source.imageUrl;
}

function remixBackground(draft: PostcardDraft, colors: string[]): string {
  const [first = "#171719", second = "#e7005a", third = "#f8f8f8"] = colors;
  const angle = draft.visual.background.angleDeg;
  switch (draft.visual.background.type) {
    case "solid": return first;
    case "radial-gradient": return `radial-gradient(circle at 35% 30%, ${second}, ${first} 72%)`;
    case "striped": return `repeating-linear-gradient(${angle}deg, ${first} 0 12px, ${second} 12px 24px)`;
    case "grid": return `linear-gradient(${first}dd, ${first}dd), repeating-linear-gradient(0deg, transparent 0 12px, ${second}66 12px 13px), repeating-linear-gradient(90deg, transparent 0 12px, ${second}66 12px 13px)`;
    case "checker": return `conic-gradient(from 90deg at 25% 25%, ${first} 25%, ${second} 0 50%, ${first} 0 75%, ${second} 0)`;
    case "starburst": return `conic-gradient(from ${angle}deg, ${first}, ${second}, ${third}, ${first}, ${second}, ${first})`;
    case "linear-gradient": return `linear-gradient(${angle}deg, ${first}, ${second}${third ? `, ${third}` : ""})`;
    default: return `linear-gradient(135deg, ${first}, ${second}, ${third})`;
  }
}

function labelize(value: string): string {
  return value.replaceAll("-", " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

function toDateValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function mailingDateBounds(now = new Date()): { min: string; max: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 179);
  return { min: start.toISOString().slice(0, 10), max: end.toISOString().slice(0, 10) };
}
