"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Send, X } from "lucide-react";

const STORAGE_KEY = "coreboys-clip-submissions:v1";

export type FanSubmission = {
  id: string;
  source: "twitch" | "youtube" | "tiktok" | "instagram" | null;
  externalId: string | null;
  url: string;
  why: string;
  memberSlugs: string[];
  /** Legacy single-name field — kept for backwards compat with old saved entries. */
  submitterName?: string;
  submitterFirstName?: string;
  submitterLastName?: string;
  /** Admin-only — never rendered publicly. */
  submitterEmail: string;
  consent: boolean;
  status: "pending" | "approved" | "denied";
  reason?: string;
  submittedAt: string;
};

type MemberOption = {
  slug: string;
  stageName: string;
  accent: string;
  avatarUrl?: string;
};

/**
 * Public clip submission form. Mirrors the fanzone photo submit UX —
 * modal frame with a scrollable body, avatar-chip member tagging,
 * polished hover/focus inputs, terms gate. Phase 4 swaps the
 * localStorage write for `POST /v1/clip-submissions`.
 */
export function ClipSubmitForm({
  members,
  onClose,
}: {
  members: MemberOption[];
  onClose?: () => void;
}) {
  const [url, setUrl] = useState("");
  const [why, setWhy] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const detection = useMemo(() => detectPlatform(url), [url]);

  const togglePick = (slug: string) =>
    setPicked((prev) =>
      prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug],
    );

  const ready =
    !!url.trim() &&
    !!detection.source &&
    !!firstName.trim() &&
    !!lastName.trim() &&
    !!email.trim() &&
    consent &&
    picked.length > 0;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    const sub: FanSubmission = {
      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: detection.source,
      externalId: detection.externalId,
      url: url.trim(),
      why: why.trim(),
      memberSlugs: picked,
      submitterFirstName: firstName.trim(),
      submitterLastName: lastName.trim(),
      submitterEmail: email.trim(),
      consent,
      status: "pending",
      submittedAt: new Date().toISOString(),
    };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const prev = raw ? (JSON.parse(raw) as FanSubmission[]) : [];
      localStorage.setItem(STORAGE_KEY, JSON.stringify([sub, ...prev]));
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
          Got it. We&apos;ll take a look.
        </h3>
        <p className="mt-2 text-[13px] text-[color:var(--ink-dim)]">
          Approved clips appear in the library with credit to{" "}
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

  return (
    <>
      {/* Modal header */}
      <div className="flex items-center justify-between border-b border-[color:var(--rule)] bg-[color:var(--surface)] px-5 py-3">
        <h3 className="text-[14px] font-bold tracking-tight text-[color:var(--ink)]">
          Submit a clip
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
        <Field label="Clip URL" required hint="Twitch clip, YouTube short, TikTok, Instagram reel.">
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://clips.twitch.tv/... or https://youtube.com/shorts/..."
            className={inputClass}
          />
          {url ? (
            detection.source ? (
              <p className="mt-2 text-[12px] text-[color:var(--ink-dim)]">
                Detected:{" "}
                <strong className="text-[color:var(--ink)]">{detection.source}</strong>
              </p>
            ) : (
              <p className="mt-2 text-[12px] text-[color:var(--core)]">
                We can&apos;t detect this URL — supported: clips.twitch.tv, youtube.com/shorts,
                youtu.be, tiktok.com, instagram.com/reel.
              </p>
            )
          ) : null}
        </Field>

        <Field label="Why is it worth posting?" hint="One sentence. Optional.">
          <textarea
            rows={3}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            placeholder="The 1v3 in the final round at 2:14"
            className={inputClass}
          />
        </Field>

        <Field
          label="Who's in the clip?"
          required
          hint="Tag every member who appears. Hover an avatar for the name."
        >
          <ul className="flex flex-wrap items-center gap-2">
            {members.map((m) => {
              const active = picked.includes(m.slug);
              return (
                <li key={m.slug} className="group/chip relative">
                  <button
                    type="button"
                    onClick={() => togglePick(m.slug)}
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

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg)] p-4 text-[12px] leading-relaxed text-[color:var(--ink-dim)] transition-colors hover:border-[color:var(--rule-strong)] hover:bg-[color:var(--bg-elev)] has-[:checked]:border-[color:var(--core)]/60 has-[:checked]:bg-[color:var(--core)]/5">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 cursor-pointer accent-[color:var(--core)]"
          />
          <span>
            I confirm I&apos;m okay with this clip being shown publicly on thecoreboys.com with
            credit to my first name and last initial, and I&apos;ve read and accept the{" "}
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
            <Send size={14} /> Submit clip
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
      aria-labelledby="clip-terms"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[640px] overflow-hidden rounded-2xl border border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[color:var(--rule)] bg-[color:var(--surface)] px-5 py-3">
          <h3
            id="clip-terms"
            className="text-[14px] font-bold tracking-tight text-[color:var(--ink)]"
          >
            Clip submission terms
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
          <p>By submitting a clip to The Core Boys you confirm the following:</p>
          <ul className="mt-4 flex flex-col gap-3">
            <li>
              <strong className="text-[color:var(--ink)]">The clip is appropriate</strong> — no
              explicit, hateful, harassing, or non-consensual content. Admins reject anything
              that crosses that line.
            </li>
            <li>
              <strong className="text-[color:var(--ink)]">You consent to public display</strong>{" "}
              of the clip embed on thecoreboys.com with attribution to your{" "}
              <em>first name + last initial</em>. Your full last name and email are admin-only
              and never shown publicly.
            </li>
            <li>
              <strong className="text-[color:var(--ink)]">Source ownership</strong> — clips are
              embedded from the original platform (Twitch / YouTube / TikTok / Instagram). We
              don&apos;t re-host the video.
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

function detectPlatform(url: string): {
  source: "twitch" | "youtube" | "tiktok" | "instagram" | null;
  externalId: string | null;
} {
  if (!url) return { source: null, externalId: null };
  try {
    const u = new URL(url);
    if (u.hostname.includes("clips.twitch.tv")) {
      return { source: "twitch", externalId: u.pathname.slice(1) || null };
    }
    if (u.hostname.includes("youtube.com")) {
      const id = u.pathname.startsWith("/shorts/")
        ? u.pathname.split("/")[2]
        : u.searchParams.get("v");
      return { source: "youtube", externalId: id ?? null };
    }
    if (u.hostname.includes("youtu.be")) {
      return { source: "youtube", externalId: u.pathname.slice(1) || null };
    }
    if (u.hostname.includes("tiktok.com")) {
      const m = u.pathname.match(/\/video\/(\d+)/);
      return { source: "tiktok", externalId: m?.[1] ?? null };
    }
    if (u.hostname.includes("instagram.com")) {
      const m = u.pathname.match(/\/(?:reel|p)\/([^/]+)/);
      return { source: "instagram", externalId: m?.[1] ?? null };
    }
  } catch {
    /* ignore */
  }
  return { source: null, externalId: null };
}
