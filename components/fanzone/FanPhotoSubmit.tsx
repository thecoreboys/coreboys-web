"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, CheckCircle, Send01, UploadCloud02 } from "@untitledui/icons";
import { Image as ImageIcon, Palette, RotateCw } from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/providers/AuthProvider";
import { cx } from "@/utils/cx";

function browserDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const MAX_BYTES = 6 * 1024 * 1024;
export const FAN_RECEIPTS_KEY = "coreboys-fanzone-receipts:v2";
type CropAspect = "original" | "square" | "portrait" | "landscape";

export type FanSubmissionReceipt = {
  id: string;
  token: string;
  submittedAt: string;
};

/** Kept for older call sites while the wall now hydrates its public type from the API. */
export type FanPhotoSubmission = {
  id: string;
  imageUrl: string;
  submitterName?: string;
  submitterFirstName?: string;
  submitterLastName?: string;
  submitterEmail: string;
  caption?: string;
  consent: boolean;
  taggedMembers: string[];
  status: "pending" | "approved" | "denied";
  submittedAt: string;
};

type MemberOption = {
  slug: string;
  stageName: string;
  accent: string;
  avatarUrl?: string;
};

export function FanPhotoSubmit({
  memberOptions,
  onClose,
  onSubmitted,
}: {
  memberOptions: MemberOption[];
  onClose?: () => void;
  onSubmitted?: () => void;
}) {
  const { user } = useAuth();
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [kind, setKind] = useState<"photo" | "art">("photo");
  const [rotation, setRotation] = useState(0);
  const [cropAspect, setCropAspect] = useState<CropAspect>("original");
  const [focalX, setFocalX] = useState(50);
  const [focalY, setFocalY] = useState(50);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [caption, setCaption] = useState("");
  const [story, setStory] = useState("");
  const [eventName, setEventName] = useState("");
  const [happenedOn, setHappenedOn] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [photographerCredit, setPhotographerCredit] = useState("");
  const [consent, setConsent] = useState(false);
  const [tagged, setTagged] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const parts = user.displayName.trim().split(/\s+/);
    setFirstName((current) => current || parts[0] || "");
    setLastName((current) => current || parts.slice(1).join(" "));
    setEmail((current) => current || user.email);
  }, [user]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(next: File | null) {
    setError(null);
    if (!next) {
      setFile(null);
      setRotation(0);
      setCropAspect("original");
      setFocalX(50);
      setFocalY(50);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (!new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]).has(next.type)) {
      setError("Use a JPG, PNG, WEBP, or AVIF image.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setError(`That file is ${(next.size / 1_048_576).toFixed(1)} MB. The limit is 6 MB.`);
      return;
    }
    setFile(next);
    setRotation(0);
    setCropAspect("original");
    setFocalX(50);
    setFocalY(50);
  }

  function toggle(slug: string) {
    setTagged((current) =>
      current.includes(slug) ? current.filter((value) => value !== slug) : [...current, slug],
    );
  }

  const ready =
    Boolean(file) &&
    Boolean(firstName.trim()) &&
    Boolean(lastName.trim()) &&
    Boolean(email.trim()) &&
    tagged.length > 0 &&
    consent;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || !file || submitting) return;
    setSubmitting(true);
    setError(null);
    const form = new FormData();
    try {
      const editedFile = cropAspect === "original"
        ? file
        : await renderEditedUpload(file, rotation, cropAspect, focalX, focalY);
      form.set("file", editedFile);
      form.set("kind", kind);
      form.set("rotation", String(cropAspect === "original" ? rotation : 0));
      form.set("submitterFirstName", firstName.trim());
      form.set("submitterLastName", lastName.trim());
      form.set("submitterEmail", email.trim());
      form.set("memberSlugs", tagged.join(","));
      form.set("caption", caption.trim());
      form.set("story", story.trim());
      form.set("eventName", eventName.trim());
      form.set("happenedOn", happenedOn);
      form.set("locationLabel", locationLabel.trim());
      form.set("photographerCredit", photographerCredit.trim());
      form.set("consent", "true");
      const response = await fetch("/api/fanzone/photos", {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      const result = (await response.json().catch(() => ({}))) as {
        id?: string;
        receiptToken?: string;
        submittedAt?: string;
        error?: string;
      };
      if (!response.ok || !result.id || !result.receiptToken) {
        throw new Error(result.error ?? "We couldn’t upload that right now.");
      }
      saveReceipt({
        id: result.id,
        token: result.receiptToken,
        submittedAt: result.submittedAt ?? new Date().toISOString(),
      });
      setDone(true);
      onSubmitted?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t upload that right now.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
        <FeaturedIcon icon={CheckCircle} size="lg" color="success" theme="modern" />
        <h3 className="mt-4 text-xl font-semibold tracking-tight text-primary">Sent for review</h3>
        <p className="mt-2 max-w-[42ch] text-sm leading-relaxed text-tertiary">
          It stays private until the team approves it. You can check the result from
          <strong className="font-semibold text-secondary"> My submissions</strong> on the wall.
        </p>
        {onClose ? (
          <Button size="md" color="secondary" onClick={onClose} className="mt-6">
            Done
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <form onSubmit={submit} className="max-h-[86vh] overflow-y-auto">
        <div className="border-b border-secondary px-5 py-5 pr-14 md:px-6">
          <h3 className="text-lg font-semibold tracking-tight text-primary">Share with the wall</h3>
          <p className="mt-1 text-sm text-tertiary">Private while the team reviews it.</p>
        </div>

        <div className="space-y-6 p-5 md:p-6">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary p-1" aria-label="Submission type">
            <KindButton active={kind === "photo"} onClick={() => setKind("photo")} icon={ImageIcon}>
              Fan photo
            </KindButton>
            <KindButton active={kind === "art"} onClick={() => setKind("art")} icon={Palette}>
              Fan art
            </KindButton>
          </div>

          <Field label={kind === "art" ? "Artwork" : "Photo"} required>
            <input
              ref={fileInputRef}
              id={inputId}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="sr-only"
              onChange={(event) => pick(event.target.files?.[0] ?? null)}
            />
            {!preview ? (
              <label
                htmlFor={inputId}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  pick(event.dataTransfer.files?.[0] ?? null);
                }}
                onPaste={(event) => pick(event.clipboardData.files?.[0] ?? null)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                className={cx(
                  "flex min-h-[190px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-5 text-center outline-none transition",
                  dragging
                    ? "border-brand bg-brand-primary"
                    : "border-secondary bg-secondary hover:border-brand focus-visible:ring-2 focus-visible:ring-brand",
                )}
              >
                <FeaturedIcon icon={UploadCloud02} size="md" color="brand" theme="light" />
                <span className="mt-3 text-sm font-semibold text-primary">Drop, paste, or choose a file</span>
                <span className="mt-1 text-xs text-tertiary">JPG, PNG, WEBP, or AVIF · 6 MB max</span>
              </label>
            ) : (
              <>
                <div className="overflow-hidden rounded-2xl border border-secondary bg-black">
                  <div
                    className="mx-auto grid max-h-[420px] min-h-[220px] max-w-full place-items-center overflow-hidden"
                    style={{ aspectRatio: previewAspect(cropAspect) }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preview}
                      alt="Selected upload preview"
                      className={cx(
                        "h-full w-full transition-transform",
                        cropAspect === "original" ? "object-contain p-3" : "object-cover",
                      )}
                      style={{
                        objectPosition: `${focalX}% ${focalY}%`,
                        transform: `rotate(${rotation}deg)`,
                        scale: rotation % 180 ? "0.76" : "1",
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-black/70 p-2.5">
                    <span className="min-w-0 truncate px-1 text-xs text-white/70">{file?.name}</span>
                    <button
                      type="button"
                      onClick={() => pick(null)}
                      className="min-h-9 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                      Replace
                    </button>
                  </div>
                </div>
                <details className="mt-2 rounded-xl border border-secondary bg-secondary">
                  <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                    Crop &amp; rotate <span className="font-normal text-quaternary">(optional)</span>
                  </summary>
                  <div className="space-y-4 border-t border-secondary p-4">
                    <div className="flex flex-wrap gap-2" aria-label="Crop shape">
                      {(["original", "square", "portrait", "landscape"] as const).map((aspect) => (
                        <button
                          key={aspect}
                          type="button"
                          aria-pressed={cropAspect === aspect}
                          onClick={() => setCropAspect(aspect)}
                          className={cx(
                            "min-h-9 rounded-full border px-3 text-xs font-semibold capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                            cropAspect === aspect
                              ? "border-brand bg-brand-primary text-primary"
                              : "border-secondary bg-primary text-tertiary hover:text-primary",
                          )}
                        >
                          {aspect}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setRotation((value) => (value + 90) % 360)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-secondary bg-primary px-3 text-xs font-semibold text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <RotateCw size={14} /> Rotate 90°
                      </button>
                    </div>
                    {cropAspect !== "original" ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <RangeField label="Move left / right" value={focalX} onChange={setFocalX} />
                        <RangeField label="Move up / down" value={focalY} onChange={setFocalY} />
                      </div>
                    ) : (
                      <p className="text-xs leading-relaxed text-quaternary">Choose a shape to crop. The edited copy is made in your browser; your original file is not changed.</p>
                    )}
                  </div>
                </details>
              </>
            )}
            {error ? <p role="alert" className="mt-2 text-sm font-medium text-error-primary">{error}</p> : null}
          </Field>

          <Field label="Who is it for or with?" hint="Choose everyone relevant." required>
            <ul className="flex flex-wrap gap-2">
              {memberOptions.map((member) => {
                const active = tagged.includes(member.slug);
                return (
                  <li key={member.slug}>
                    <button
                      type="button"
                      onClick={() => toggle(member.slug)}
                      aria-pressed={active}
                      className={cx(
                        "inline-flex min-h-11 items-center gap-2 rounded-full border px-2.5 pr-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                        active
                          ? "border-brand bg-brand-primary text-primary"
                          : "border-secondary bg-secondary text-tertiary hover:text-primary",
                      )}
                    >
                      {member.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={member.avatarUrl} alt="" className="size-7 rounded-full object-cover" />
                      ) : (
                        <span className="grid size-7 place-items-center rounded-full bg-primary font-semibold" style={{ color: member.accent }}>
                          {member.stageName.slice(0, 1)}
                        </span>
                      )}
                      {member.stageName}
                      {active ? <Check className="size-3.5 text-brand-secondary" aria-hidden /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Input isRequired label="First name" value={firstName} onChange={setFirstName} placeholder="Alex" />
            <Input isRequired label="Last name" hint="Only the initial is public." value={lastName} onChange={setLastName} placeholder="Smith" />
          </div>
          <Input isRequired type="email" label="Email" hint="Used only for your submission and never displayed." value={email} onChange={setEmail} placeholder="you@example.com" />

          <Field label="Caption" hint={`${caption.length}/180 · optional`}>
            <input
              value={caption}
              onChange={(event) => setCaption(event.target.value.slice(0, 180))}
              placeholder={kind === "art" ? "What inspired this?" : "A quick moment from…"}
              className="min-h-11 w-full rounded-lg border border-secondary bg-primary px-3.5 text-sm text-primary outline-none placeholder:text-placeholder focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </Field>

          <details className="group rounded-xl border border-secondary bg-secondary">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              Add event details <span className="font-normal text-tertiary">(optional)</span>
            </summary>
            <div className="grid gap-4 border-t border-secondary p-4 md:grid-cols-2">
              <NativeField label="Event or album">
                <input value={eventName} maxLength={80} onChange={(event) => setEventName(event.target.value)} placeholder="CORE meetup" className={nativeClass} />
              </NativeField>
              <NativeField label="Date taken">
                <input type="date" value={happenedOn} max={browserDateKey()} onChange={(event) => setHappenedOn(event.target.value)} className={nativeClass} />
              </NativeField>
              <NativeField label="Location" hint="Keep it broad—never share a home address.">
                <input value={locationLabel} maxLength={80} onChange={(event) => setLocationLabel(event.target.value)} placeholder="Atlanta, GA" className={nativeClass} />
              </NativeField>
              <NativeField label="Photo / artist credit">
                <input value={photographerCredit} maxLength={80} onChange={(event) => setPhotographerCredit(event.target.value)} placeholder="@handle or name" className={nativeClass} />
              </NativeField>
              <NativeField label="Story" hint={`${story.length}/900`} className="md:col-span-2">
                <textarea value={story} maxLength={900} onChange={(event) => setStory(event.target.value)} rows={4} placeholder="Tell the story behind it…" className={cx(nativeClass, "resize-y py-2.5")} />
              </NativeField>
            </div>
          </details>

          <label className={cx("flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm leading-relaxed", consent ? "border-brand bg-brand-primary" : "border-secondary bg-secondary")}>
            <Checkbox size="sm" isSelected={consent} onChange={setConsent} className="mt-0.5" aria-label="Agree to submission terms" />
            <span className="text-tertiary">
              I own this upload or have permission to share it, and I accept the{" "}
              <button type="button" onClick={() => setTermsOpen(true)} className="font-semibold text-brand-secondary underline underline-offset-2">
                simple submission terms
              </button>
              .
            </span>
          </label>
        </div>

        <div className="sticky bottom-0 flex items-center gap-3 border-t border-secondary bg-primary/95 px-5 py-4 backdrop-blur md:px-6">
          <Button type="submit" size="lg" color="primary" isDisabled={!ready || submitting} isLoading={submitting} iconLeading={Send01}>
            {submitting ? "Preparing & uploading" : "Send for review"}
          </Button>
          {onClose ? <Button type="button" size="lg" color="link-gray" onClick={onClose}>Cancel</Button> : null}
          <span className="ml-auto hidden text-xs text-quaternary sm:block">Private until approved</span>
        </div>
      </form>

      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent className="max-w-[620px] p-6 md:p-8">
          <DialogTitle className="text-2xl">Submission terms</DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-relaxed">
            Plain language, so you know exactly what happens.
          </DialogDescription>
          <ul className="mt-6 space-y-4 text-sm leading-relaxed text-tertiary">
            <li><strong className="text-primary">Private first.</strong> The original is resized, metadata is removed, and the upload stays in private storage while a team member reviews it.</li>
            <li><strong className="text-primary">Public only after approval.</strong> The wall shows your first name and last initial. Your email and full last name stay in the review record.</li>
            <li><strong className="text-primary">You have permission.</strong> You own the image/artwork or have consent from its owner and the recognizable people in it.</li>
            <li><strong className="text-primary">Keep people safe.</strong> No private addresses, sexual content, hate, threats, graphic harm, impersonation, or exploitative images of minors.</li>
            <li><strong className="text-primary">Removal is available.</strong> Use Report on a wall item or email <a href="mailto:press@thecoreboys.com" className="font-semibold text-brand-secondary">press@thecoreboys.com</a>. Unreviewed uploads expire after 45 days; denied image files are removed 30 days after review and contact details are anonymized after 90 days.</li>
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

function saveReceipt(receipt: FanSubmissionReceipt) {
  try {
    const current = JSON.parse(localStorage.getItem(FAN_RECEIPTS_KEY) ?? "[]") as FanSubmissionReceipt[];
    const next = [receipt, ...current.filter((item) => item.id !== receipt.id)].slice(0, 20);
    localStorage.setItem(FAN_RECEIPTS_KEY, JSON.stringify(next));
  } catch {
    // An account still owns the history if local storage is unavailable.
  }
}

function previewAspect(aspect: CropAspect): string | undefined {
  if (aspect === "square") return "1 / 1";
  if (aspect === "portrait") return "4 / 5";
  if (aspect === "landscape") return "16 / 9";
  return undefined;
}

function cropRatio(aspect: Exclude<CropAspect, "original">): number {
  if (aspect === "square") return 1;
  if (aspect === "portrait") return 4 / 5;
  return 16 / 9;
}

/**
 * Produces a metadata-free, reasonably sized browser-side edit. The server
 * still validates and re-encodes the result before it reaches private storage.
 */
async function renderEditedUpload(
  file: File,
  rotation: number,
  aspect: Exclude<CropAspect, "original">,
  focalX: number,
  focalY: number,
): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const turnsSideways = normalizedRotation === 90 || normalizedRotation === 270;
    const sourceScale = Math.min(1, 3200 / Math.max(bitmap.width, bitmap.height));
    const sourceWidth = Math.max(1, Math.round(bitmap.width * sourceScale));
    const sourceHeight = Math.max(1, Math.round(bitmap.height * sourceScale));
    const rotatedWidth = turnsSideways ? sourceHeight : sourceWidth;
    const rotatedHeight = turnsSideways ? sourceWidth : sourceHeight;
    const rotated = document.createElement("canvas");
    rotated.width = rotatedWidth;
    rotated.height = rotatedHeight;
    const rotatedContext = rotated.getContext("2d", { alpha: false });
    if (!rotatedContext) throw new Error("This browser could not prepare the edit.");
    rotatedContext.imageSmoothingEnabled = true;
    rotatedContext.imageSmoothingQuality = "high";
    rotatedContext.translate(rotatedWidth / 2, rotatedHeight / 2);
    rotatedContext.rotate((normalizedRotation * Math.PI) / 180);
    rotatedContext.drawImage(bitmap, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);

    const targetRatio = cropRatio(aspect);
    let cropWidth = rotatedWidth;
    let cropHeight = rotatedHeight;
    if (rotatedWidth / rotatedHeight > targetRatio) cropWidth = rotatedHeight * targetRatio;
    else cropHeight = rotatedWidth / targetRatio;
    const sourceX = (rotatedWidth - cropWidth) * Math.min(1, Math.max(0, focalX / 100));
    const sourceY = (rotatedHeight - cropHeight) * Math.min(1, Math.max(0, focalY / 100));
    const outputScale = Math.min(1, 2400 / Math.max(cropWidth, cropHeight));
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(cropWidth * outputScale));
    output.height = Math.max(1, Math.round(cropHeight * outputScale));
    const outputContext = output.getContext("2d", { alpha: false });
    if (!outputContext) throw new Error("This browser could not prepare the crop.");
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = "high";
    outputContext.drawImage(
      rotated,
      sourceX,
      sourceY,
      cropWidth,
      cropHeight,
      0,
      0,
      output.width,
      output.height,
    );

    let blob: Blob | null = null;
    for (const quality of [0.9, 0.82, 0.72]) {
      blob = await canvasBlob(output, "image/webp", quality);
      if (blob && blob.size <= MAX_BYTES) break;
    }
    if (!blob || blob.size > MAX_BYTES) throw new Error("The edited image is still too large. Try a smaller original.");
    const stem = file.name.replace(/\.[^.]+$/, "") || "fanzone-upload";
    return new File([blob], `${stem}-edited.webp`, { type: blob.type, lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function RangeField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="text-xs font-medium text-tertiary">
      {label}
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 block w-full accent-[color:var(--color-brand-600)]"
      />
    </label>
  );
}

function KindButton({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: typeof ImageIcon; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cx("inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand", active ? "bg-primary text-primary shadow-xs ring-1 ring-inset ring-secondary" : "text-tertiary hover:text-primary")}>
      <Icon size={16} /> {children}
    </button>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-secondary">{label}{required ? <span className="ml-0.5 text-brand-secondary">*</span> : null}</span>
        {hint ? <span className="text-xs text-quaternary">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

const nativeClass = "min-h-11 w-full rounded-lg border border-secondary bg-primary px-3.5 text-sm text-primary outline-none placeholder:text-placeholder focus:border-brand focus:ring-1 focus:ring-brand";

function NativeField({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-sm font-medium text-secondary">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-quaternary">{hint}</span> : null}
    </label>
  );
}
