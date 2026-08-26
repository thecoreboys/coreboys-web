"use client";

import { useEffect, useState } from "react";
import { ClipSubmitForm } from "@/components/clips/ClipSubmitForm";
import { PageHeader } from "@/components/ui/PageHeader";
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
    <>
      <PageHeader
        eyebrow="Cuts"
        title="Cuts."
        supporting="Recaps and moments from across the house."
        meta={`${total} ${total === 1 ? "cut" : "cuts"}`}
        actions={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink)] underline-offset-4 hover:underline"
          >
            Submit a cut
          </button>
        }
      />

      {open ? <ClipSubmitModal members={members} onClose={() => setOpen(false)} /> : null}
    </>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[680px] overflow-hidden border border-[color:var(--rule)] bg-[color:var(--bg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <ClipSubmitForm members={members} onClose={onClose} />
      </div>
    </div>
  );
}
