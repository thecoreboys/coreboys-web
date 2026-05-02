"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Send, Upload, X } from "lucide-react";

const FAN_KEY = "coreboys-fan-photos:v1";
const MAX_BYTES = 6 * 1024 * 1024;

export type FanPhotoSubmission = {
  id: string;
  imageUrl: string;
  /** Legacy single-name field — kept for backwards compat with old saved entries. */
  submitterName?: string;
  submitterFirstName?: string;
  submitterLastName?: string;
  /** Admin-only — never rendered publicly. */
  submitterEmail: string;
  /** Legacy field. */
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

/**
 * Fan photo submission. Real file upload (data-URL in Phase 1; signed
 * S3 upload in Phase 4). Tagging uses the same avatar-chip pattern as
 * /media + /clips so the UX reads as one system. First name + last name
 * + email + consent. Public wall later renders only "{first} {L.}".
 */
export function FanPhotoSubmit({
  memberOptions,
  onClose,
}: {
  memberOptions: MemberOption[];
  onClose?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [tagged, setTagged] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  }, [file]);

  const onPick = (f: File | null) => {
    setError(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (!f.type.startsWith("image/")) {
      setError("That doesn't look like an image file.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`Image is too large (${(f.size / 1_048_576).toFixed(1)} MB). Max 6 MB.`);
      return;
    }
    setFile(f);
  };

  const toggle = (slug: string) =>
    setTagged((prev) =>
      prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug],
    );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !preview ||
      !firstName.trim() ||
      !lastName.trim() ||
      !email.trim() ||
      !consent ||
      tagged.length === 0
    )
      return;
    const sub: FanPhotoSubmission = {
      id: `fphoto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      imageUrl: preview,
      submitterFirstName: firstName.trim(),
      submitterLastName: lastName.trim(),
      submitterEmail: email.trim(),
      consent,
      taggedMembers: tagged,
      status: "pending",
      submittedAt: new Date().toISOString(),
    };
    try {
      const raw = localStorage.getItem(FAN_KEY);
      const prev = raw ? (JSON.parse(raw) as FanPhotoSubmission[]) : [];
      localStorage.setItem(FAN_KEY, JSON.stringify([sub, ...prev]));
    } catch {
      /* ignore */
    }
    setDone(true);
  };

  if (done) {
    return (
      <div className="p-8 text-center">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--core)]/20 text-[color:var(--core)]">
          <Check size={18} />
        </span>
        <h3 className="mt-3 text-[18px] font-bold text-[color:var(--ink)]">
          Got it. We&apos;ll review it.
        </h3>
        <p className="mt-2 text-[13px] text-[color:var(--ink-dim)]">
          Approved photos appear on the wall with credit to{" "}
          <strong>
            {firstName} {lastName ? `${lastName[0]}.` : ""}
          </strong>
        </p>
        {onClose ? (
          <button type="button" onClick={onClose} className="btn btn-secondary mt-5">
            Close
          </button>
        ) : null}
      </div>
    );
  }

  const ready =
    !!preview &&
    !!firstName.trim() &&
    !!lastName.trim() &&
    !!email.trim() &&
    consent &&
    tagged.length > 0;

  return (
    <>
      {/* Modal header */}
      <div className="flex items-center justify-between border-b border-[color:var(--rule)] bg-[color:var(--surface)] px-5 py-3">
        <h3 className="text-[14px] font-bold tracking-tight text-[color:var(--ink)]">
          Submit a photo
        </h3>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[color:var(--ink-dim)] hover:bg-[color:var(--bg)] hover:text-[color:var(--ink)]"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      <form
        onSubmit={onSubmit}
        className="flex max-h-[80vh] flex-col gap-5 overflow-y-auto p-5 md:p-6"
      >
        {/* Upload */}
        <Field label="Photo" required>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            className="sr-only"
            id="fanphoto-file"
          />
          {!preview ? (
            <label
              htmlFor="fanphoto-file"
              className="group/upload flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg)] px-4 py-8 text-center transition-all hover:-translate-y-0.5 hover:border-[color:var(--core)] hover:bg-[color:var(--surface)] hover:shadow-[0_8px_24px_-12px_rgba(255,59,31,0.4)] active:translate-y-0"
            >
              <Upload
                size={20}
                className="text-[color:var(--ink-dim)] transition-all group-hover/upload:-translate-y-0.5 group-hover/upload:scale-110 group-hover/upload:text-[color:var(--core)]"
              />
              <span className="text-[13px] font-medium text-[color:var(--ink)]">
                Click or drop to upload
              </span>
              <span className="text-[11px] text-[color:var(--ink-faint)]">
                JPG / PNG / WEBP · up to 6 MB
              </span>
            </label>
          ) : (
            <div className="relative overflow-hidden rounded-lg border border-[color:var(--rule)] bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Selected"
                className="block max-h-[260px] w-full object-contain"
              />
              <button
                type="button"
                onClick={() => onPick(null)}
                aria-label="Remove photo"
                className="absolute right-2 top-2 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/60 text-white transition-all hover:scale-110 hover:bg-black/80"
              >
                <X size={14} />
              </button>
            </div>
          )}
          {error ? (
            <p className="mt-1 text-[11px] text-[color:var(--core)]">{error}</p>
          ) : null}
        </Field>

        {/* Tag — avatar-only chips, same pattern as /media and /clips */}
        <Field
          label="Who's in the photo with you?"
          required
          hint="Pick everyone you took the photo with. Hover an avatar for the name."
        >
          <ul className="flex flex-wrap items-center gap-2">
            {memberOptions.map((m) => {
              const active = tagged.includes(m.slug);
              return (
                <li key={m.slug} className="group/chip relative">
                  <button
                    type="button"
                    onClick={() => toggle(m.slug)}
                    aria-pressed={active}
                    aria-label={m.stageName}
                    className="relative inline-flex h-12 w-12 items-center justify-center rounded-full transition-all cursor-pointer hover:-translate-y-0.5"
                  >
                    {m.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.avatarUrl}
                        alt=""
                        className="h-12 w-12 rounded-full ring-2 ring-inset transition-all"
                        style={{
                          ["--tw-ring-color" as string]: active
                            ? m.accent
                            : "var(--rule-strong)",
                          opacity: active ? 1 : 0.6,
                          filter: active ? "none" : "grayscale(0.4)",
                          boxShadow: active
                            ? `0 0 0 2px ${m.accent}, 0 6px 16px -4px ${m.accent}aa`
                            : "none",
                        }}
                      />
                    ) : (
                      <span
                        className="inline-flex h-12 w-12 items-center justify-center rounded-full ring-2 ring-inset text-[14px] font-bold"
                        style={{
                          ["--tw-ring-color" as string]: active
                            ? m.accent
                            : "var(--rule-strong)",
                          color: m.accent,
                          background: "rgba(8,8,10,0.6)",
                        }}
                      >
                        {m.stageName[0]}
                      </span>
                    )}
                    {active ? (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-[color:var(--bg-elev)]"
                        style={{ background: m.accent, color: "#fff" }}
                        aria-hidden
                      >
                        <Check size={11} />
                      </span>
                    ) : null}
                  </button>
                  {/* Hover tooltip — matches /media + /clips chips */}
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[color:var(--rule-strong)] bg-[color:var(--bg)] px-2 py-1 text-[10px] font-semibold text-[color:var(--ink)] opacity-0 shadow-lg transition-opacity group-hover/chip:opacity-100"
                  >
                    {m.stageName}
                  </span>
                </li>
              );
            })}
          </ul>
        </Field>

        {/* Submitter */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="First name" required>
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Alex"
              className={inputClass}
            />
          </Field>
          <Field label="Last name" required hint="Only the initial is shown publicly.">
            <input
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Smith"
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Email" required hint="Admin-only. Never shown publicly.">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className={inputClass}
          />
        </Field>

        {/* Consent */}
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg)] p-4 text-[12px] leading-relaxed text-[color:var(--ink-dim)] transition-colors hover:border-[color:var(--rule-strong)] hover:bg-[color:var(--bg-elev)] has-[:checked]:border-[color:var(--core)]/60 has-[:checked]:bg-[color:var(--core)]/5">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 cursor-pointer accent-[color:var(--core)]"
          />
          <span>
            I confirm I own this photo or have permission to share it, I&apos;m okay with it
            being displayed publicly on thecoreboys.com with my first name and last initial
            credited, and I&apos;ve read and accept the{" "}
            <button
              type="button"
              onClick={() => setTermsOpen(true)}
              className="font-semibold text-[color:var(--core)] underline decoration-[color:var(--core)]/40 underline-offset-4 hover:decoration-[color:var(--core)]"
            >
              submission terms
            </button>
            .
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--rule)] pt-4">
          <button
            type="submit"
            disabled={!ready}
            className="btn btn-primary cursor-pointer transition-all enabled:hover:-translate-y-0.5 enabled:hover:shadow-[0_8px_20px_-8px_rgba(255,59,31,0.6)] enabled:active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={14} /> Submit photo
          </button>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer text-[12px] font-medium text-[color:var(--ink-dim)] transition-colors hover:text-[color:var(--ink)]"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      {termsOpen ? <TermsModal onClose={() => setTermsOpen(false)} /> : null}
    </>
  );
}

function TermsModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fanzone-terms"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[640px] overflow-hidden rounded-2xl border border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[color:var(--rule)] bg-[color:var(--surface)] px-5 py-3">
          <h3 id="fanzone-terms" className="text-[14px] font-bold tracking-tight text-[color:var(--ink)]">
            Fanzone submission terms
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[color:var(--ink-dim)] hover:bg-[color:var(--bg)] hover:text-[color:var(--ink)]"
          >
            <X size={14} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-6 text-[13px] leading-relaxed text-[color:var(--ink-dim)]">
          <p>By submitting a photo to the CORE Fanzone you confirm the following:</p>
          <ul className="mt-4 flex flex-col gap-3">
            <li>
              <strong className="text-[color:var(--ink)]">You own the photo</strong>, or you have
              explicit permission from whoever does to share it on this site.
            </li>
            <li>
              <strong className="text-[color:var(--ink)]">You consent to public display</strong>{" "}
              of the photo with attribution to your <em>first name + last initial</em>. Your
              full last name and email are admin-only and never shown publicly.
            </li>
            <li>
              <strong className="text-[color:var(--ink)]">AI safety screening.</strong> Every
              upload is automatically scanned by our AI moderation pipeline (vision-language
              model + AWS Rekognition Moderation Labels) to detect:
              <ul className="mt-2 ml-5 flex list-disc flex-col gap-1">
                <li>Explicit, sexual, or sexually-suggestive content</li>
                <li>Violence, weapons, or self-harm imagery</li>
                <li>Hate symbols, slurs, or extremist content</li>
                <li>Photos of minors in unsafe contexts</li>
                <li>Non-consensual imagery / private content shared without consent</li>
              </ul>
            </li>
            <li>
              <strong className="text-[color:var(--ink)]">If anything is flagged</strong>, the
              submission is <em>immediately removed</em>, the upload is <em>deleted from our
              storage</em>, and depending on severity may be <em>reported to platform
              trust-and-safety teams or law enforcement</em>. Submitter metadata (full name,
              email, IP, device fingerprint, EXIF data, image hash) is preserved for
              investigation and may be handed to authorities or third-party safety partners.
            </li>
            <li>
              <strong className="text-[color:var(--ink)]">No do-overs.</strong> Repeat
              submissions of flagged content from the same submitter result in a permanent ban.
            </li>
            <li>
              <strong className="text-[color:var(--ink)]">Removal requests</strong> at{" "}
              <code className="font-mono">press@thecoreboys.com</code>. We act on verified
              requests within 72 hours.
            </li>
          </ul>
          <p className="mt-5 text-[11px] text-[color:var(--ink-faint)]">
            By checking the consent box you agree to all of the above.
          </p>
        </div>
        <div className="flex items-center justify-end border-t border-[color:var(--rule)] bg-[color:var(--bg)] px-5 py-3">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold tracking-tight text-[color:var(--ink)]">
        {label}
        {required ? <span className="ml-1 text-[color:var(--core)]">*</span> : null}
      </span>
      {hint ? (
        <span className="-mt-0.5 text-[11px] text-[color:var(--ink-dim)]">{hint}</span>
      ) : null}
      {children}
    </label>
  );
}

const inputClass =
  "w-full cursor-text rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] px-3 py-2.5 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-faint)] transition-colors hover:border-[color:var(--rule-strong)] hover:bg-[color:var(--bg-elev)] focus:border-[color:var(--core)] focus:bg-[color:var(--bg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--core)]/20";
