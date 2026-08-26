"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle, Check, Send01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Badge } from "@/components/base/badges/badges";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { cx } from "@/utils/cx";
import { useAuth } from "@/components/providers/AuthProvider";
import Link from "next/link";

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
 * modal frame with a scrollable body, avatar-chip member tagging, UUI
 * inputs / textarea / checkbox, terms gate. Phase 4 swaps the
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
  const [hasSocial, setHasSocial] = useState<boolean | null>(null);
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!user) {
      setHasSocial(null);
      return;
    }
    let cancelled = false;
    fetch("/api/account/connections", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d: { connections?: Array<{ provider: string; status: string }> }) => {
        if (cancelled) return;
        setHasSocial(
          (d.connections ?? []).some(
            (c) => (c.provider === "twitch" || c.provider === "youtube") && c.status === "active",
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setHasSocial(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

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

  if (!authLoading && !user) {
    return (
      <div className="flex flex-col items-center p-8 text-center">
        <h3 className="text-lg font-semibold text-primary">Sign in to submit</h3>
        <p className="mt-2 max-w-sm text-sm text-tertiary">
          Clip submissions are attributed to a CORE account so we can credit you.
        </p>
        <Button href={"/login?next=/clips/submit" as never} size="md" color="primary" className="mt-5">
          Sign in
        </Button>
      </div>
    );
  }

  if (user && hasSocial === false) {
    return (
      <div className="flex flex-col items-center p-8 text-center">
        <h3 className="text-lg font-semibold text-primary">Connect Twitch or YouTube</h3>
        <p className="mt-2 max-w-sm text-sm text-tertiary">
          We need a connected platform so the clip is tied to a real creator account, not just an email.
        </p>
        <Link
          href="/account"
          className="mt-5 inline-flex rounded-lg bg-brand-solid px-4 py-2 text-sm font-semibold text-white"
        >
          Connect an account
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center p-8 text-center">
        <FeaturedIcon icon={CheckCircle} size="lg" color="success" theme="modern" />
        <h3 className="mt-4 text-lg font-semibold text-primary">
          Got it. We&apos;ll take a look.
        </h3>
        <p className="mt-1 text-sm text-tertiary">
          Approved clips appear in the library with credit to{" "}
          <strong className="font-semibold text-secondary">
            {firstName} {lastName ? `${lastName[0]}.` : ""}
          </strong>
        </p>
        {onClose ? (
          <Button size="md" color="secondary" onClick={onClose} className="mt-5">
            Close
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      {/* Modal header */}
      <div className="flex items-center justify-between border-b border-secondary bg-secondary px-5 py-4">
        <h3 className="text-md font-semibold tracking-tight text-primary">
          Submit a clip
        </h3>
        {onClose ? (
          <ButtonUtility size="sm" color="tertiary" icon={XClose} aria-label="Close" onClick={onClose} />
        ) : null}
      </div>

      <form
        onSubmit={onSubmit}
        className="flex max-h-[80vh] flex-col gap-5 overflow-y-auto p-5 md:p-6"
      >
        <div>
          <Input
            isRequired
            type="url"
            label="Clip URL"
            hint="Twitch clip, YouTube short, TikTok, Instagram reel."
            size="md"
            value={url}
            onChange={(v) => setUrl(v)}
            placeholder="https://clips.twitch.tv/... or https://youtube.com/shorts/..."
          />
          {url ? (
            detection.source ? (
              <p className="mt-2 inline-flex items-center gap-2 text-xs text-tertiary">
                Detected:
                <Badge type="pill-color" color="brand" size="sm">
                  {detection.source}
                </Badge>
              </p>
            ) : (
              <p className="mt-2 text-xs font-medium text-error-primary">
                We can&apos;t detect this URL — supported: clips.twitch.tv, youtube.com/shorts,
                youtu.be, tiktok.com, instagram.com/reel.
              </p>
            )
          ) : null}
        </div>

        <TextArea
          label="Why is it worth posting?"
          hint="One sentence. Optional."
          rows={3}
          value={why}
          onChange={(v) => setWhy(v)}
          placeholder="The 1v3 in the final round at 2:14"
        />

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
                    className="relative inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full transition-all motion-safe:hover:-translate-y-0.5"
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
                        className="inline-flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold ring-2 ring-inset"
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
                        <Check className="size-3" />
                      </span>
                    ) : null}
                  </button>
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary opacity-0 shadow-lg ring-1 ring-inset ring-secondary transition-opacity group-hover/chip:opacity-100"
                  >
                    {m.stageName}
                  </span>
                </li>
              );
            })}
          </ul>
        </Field>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            isRequired
            label="First name"
            size="md"
            value={firstName}
            onChange={(v) => setFirstName(v)}
            placeholder="Alex"
          />
          <Input
            isRequired
            label="Last name"
            hint="Only the initial is shown publicly."
            size="md"
            value={lastName}
            onChange={(v) => setLastName(v)}
            placeholder="Smith"
          />
        </div>
        <Input
          isRequired
          type="email"
          label="Email"
          hint="Admin-only. Never shown publicly."
          size="md"
          value={email}
          onChange={(v) => setEmail(v)}
          placeholder="you@email.com"
        />

        <label
          className={cx(
            "flex cursor-pointer items-start gap-3 rounded-xl bg-primary p-4 text-sm leading-relaxed text-tertiary shadow-xs ring-1 ring-inset transition-colors",
            consent ? "ring-brand bg-brand-primary" : "ring-secondary hover:bg-secondary",
          )}
        >
          <Checkbox
            size="sm"
            isSelected={consent}
            onChange={(v) => setConsent(v)}
            className="mt-0.5"
            aria-label="Consent to public display"
          />
          <span>
            I confirm I&apos;m okay with this clip being shown publicly on thecoreboys.com with
            credit to my first name and last initial, and I&apos;ve read and accept the{" "}
            <button
              type="button"
              onClick={() => setTermsOpen(true)}
              className="cursor-pointer font-semibold text-brand-secondary underline underline-offset-2 hover:text-brand-secondary_hover"
            >
              submission terms
            </button>
            .
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3 border-t border-secondary pt-4">
          <Button
            type="submit"
            size="lg"
            color="primary"
            isDisabled={!ready}
            iconLeading={Send01}
          >
            Submit clip
          </Button>
          {onClose ? (
            <Button type="button" size="lg" color="link-gray" onClick={onClose}>
              Cancel
            </Button>
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
        className="relative w-full max-w-[640px] overflow-hidden rounded-2xl bg-primary shadow-xl ring-1 ring-inset ring-secondary"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-secondary bg-secondary px-5 py-4">
          <h3
            id="clip-terms"
            className="text-md font-semibold tracking-tight text-primary"
          >
            Clip submission terms
          </h3>
          <ButtonUtility size="sm" color="tertiary" icon={XClose} aria-label="Close" onClick={onClose} />
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-6 text-sm leading-relaxed text-tertiary">
          <p>By submitting a clip to CORE you confirm the following:</p>
          <ul className="mt-4 flex flex-col gap-3">
            <li>
              <strong className="font-semibold text-primary">The clip is appropriate</strong> — no
              explicit, hateful, harassing, or non-consensual content. Admins reject anything
              that crosses that line.
            </li>
            <li>
              <strong className="font-semibold text-primary">You consent to public display</strong>{" "}
              of the clip embed on thecoreboys.com with attribution to your{" "}
              <em>first name + last initial</em>. Your full last name and email are admin-only
              and never shown publicly.
            </li>
            <li>
              <strong className="font-semibold text-primary">Source ownership</strong> — clips are
              embedded from the original platform (Twitch / YouTube / TikTok / Instagram). We
              don&apos;t re-host the video.
            </li>
            <li>
              <strong className="font-semibold text-primary">Removal requests</strong> at{" "}
              <code className="font-mono">press@thecoreboys.com</code>. We act on verified
              requests within 72 hours.
            </li>
          </ul>
          <p className="mt-5 text-xs text-quaternary">
            By checking the consent box you agree to all of the above.
          </p>
        </div>
        <div className="flex items-center justify-end border-t border-secondary bg-secondary px-5 py-4">
          <Button size="md" color="secondary" onClick={onClose}>
            Got it
          </Button>
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
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-secondary">
        {label}
        {required ? <span className="ml-0.5 text-brand-secondary">*</span> : null}
      </span>
      {children}
      {hint ? <span className="text-xs text-tertiary">{hint}</span> : null}
    </div>
  );
}

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
