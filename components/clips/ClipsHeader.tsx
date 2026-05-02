"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { ClipSubmitForm } from "@/components/clips/ClipSubmitForm";
import type { MemberLite } from "@/components/clips/ClipsPageClient";

export function ClipsHeader({
  total,
  members,
}: {
  total: number;
  members: MemberLite[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 25% 30%, rgba(239,68,68,0.10), transparent 60%), radial-gradient(45% 40% at 80% 100%, rgba(99,102,241,0.08), transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-[1440px] px-6 py-16 md:px-8 md:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Library · Clips</p>
            <h1 className="mt-2 text-display text-[clamp(40px,6vw,72px)] font-black tracking-[-0.04em] text-[color:var(--ink)]">
              Viral clips. <span className="gradient-text">Across every platform.</span>
            </h1>
            <p className="mt-4 max-w-[60ch] text-[15px] leading-relaxed text-[color:var(--ink-dim)]">
              Twitch, YouTube, TikTok, and Instagram clips in one place. Sort by popular or
              newest, filter by member or platform, or use AI to describe the moment.
            </p>
            <p className="mt-3 text-[12px] text-[color:var(--ink-faint)]">
              {total} clip{total === 1 ? "" : "s"} in the library
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="btn btn-primary btn-pulse-glow"
          >
            <Plus size={14} /> Found a clip?
          </button>
        </div>
      </div>

      {open ? (
        <ClipSubmitModal members={members} onClose={() => setOpen(false)} />
      ) : null}
    </section>
  );
}

function ClipSubmitModal({
  members,
  onClose,
}: {
  members: MemberLite[];
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
      aria-label="Submit a clip"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[680px] overflow-hidden rounded-2xl border border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)]"
        onClick={(e) => e.stopPropagation()}
      >
        <ClipSubmitForm members={members} onClose={onClose} />
      </div>
    </div>
  );
}
