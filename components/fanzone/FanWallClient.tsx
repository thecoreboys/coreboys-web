"use client";

import { useEffect, useState } from "react";
import { Camera, Plus } from "lucide-react";
import { FanPhotoSubmit, type FanPhotoSubmission } from "@/components/fanzone/FanPhotoSubmit";

const FAN_KEY = "coreboys-fan-photos:v1";

type MemberOption = {
  slug: string;
  stageName: string;
  accent: string;
  avatarUrl?: string;
};

/**
 * Fan wall + "Have a photo?" trigger that opens the submit modal.
 *
 * Public render of submitter names:
 *   approved → `firstName L.` (last initial only)
 *   admin viewer → full first + last name + email
 */
export function FanWallClient({ memberOptions }: { memberOptions: MemberOption[] }) {
  const [photos, setPhotos] = useState<FanPhotoSubmission[]>([]);
  const [authed, setAuthed] = useState(false);
  const [open, setOpen] = useState(false);

  const refresh = () => {
    try {
      const raw = localStorage.getItem(FAN_KEY);
      if (!raw) {
        setPhotos([]);
        return;
      }
      const parsed = JSON.parse(raw) as FanPhotoSubmission[];
      const isAuthed = localStorage.getItem("coreboys-auth-demo") === "1";
      setAuthed(isAuthed);
      setPhotos(parsed.filter((p) => p.status === "approved" || isAuthed));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow inline-flex items-center gap-2">
            <Camera size={11} />
            Featured · Fan wall
          </p>
          <h2 className="mt-2 text-display text-[clamp(28px,3.6vw,44px)] font-bold text-[color:var(--ink)]">
            Photos from the community.
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn btn-primary btn-pulse-glow"
        >
          <Plus size={14} /> Have a photo?
        </button>
      </header>

      {photos.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] p-8 text-center">
          <p className="text-[12px] text-[color:var(--ink-faint)]">
            No fan photos featured yet. Tap <strong>Have a photo?</strong> to submit one — admins
            review every upload.
          </p>
        </div>
      ) : (
        <ul className="columns-2 gap-3 sm:columns-3 md:columns-4 [column-fill:_balance]">
          {photos.map((p) => (
            <li
              key={p.id}
              className="group relative mb-3 break-inside-avoid overflow-hidden rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] media-tone"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.imageUrl}
                alt={`Submitted by ${publicName(p, authed)}`}
                className="block w-full transition group-hover:scale-[1.02]"
                loading="lazy"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, transparent 55%, rgba(8,8,10,0.92) 100%)",
                }}
              />
              <div className="absolute inset-x-2 bottom-2">
                <p className="truncate text-[11px] font-medium text-on-image">
                  {publicName(p, authed)}
                </p>
                {authed && p.submitterEmail ? (
                  <p className="truncate text-[10px] text-on-image-dim">{p.submitterEmail}</p>
                ) : null}
              </div>
              {p.status !== "approved" ? (
                <span className="absolute right-2 top-2 rounded-full border border-[color:var(--warning)]/50 bg-[rgba(8,8,10,0.78)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-[color:var(--warning)] backdrop-blur">
                  {p.status}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {/* Submission modal */}
      {open ? (
        <FanSubmitModal
          memberOptions={memberOptions}
          onClose={() => {
            setOpen(false);
            refresh();
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Public-facing name: keep the last name to a single initial. Admins see
 * the full record so they can run moderation.
 */
function publicName(p: FanPhotoSubmission, authed: boolean): string {
  if (authed) {
    const full = [p.submitterFirstName ?? "", p.submitterLastName ?? ""].filter(Boolean).join(" ");
    return full || p.submitterName || "anonymous";
  }
  const first = p.submitterFirstName ?? p.submitterName ?? "anonymous";
  const last = (p.submitterLastName ?? "").trim();
  if (!last) return first;
  return `${first} ${last[0]?.toUpperCase() ?? ""}.`;
}

function FanSubmitModal({
  memberOptions,
  onClose,
}: {
  memberOptions: MemberOption[];
  onClose: () => void;
}) {
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
      aria-label="Submit a fan photo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[680px] overflow-hidden rounded-2xl border border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)]"
        onClick={(e) => e.stopPropagation()}
      >
        <FanPhotoSubmit memberOptions={memberOptions} onClose={onClose} />
      </div>
    </div>
  );
}
