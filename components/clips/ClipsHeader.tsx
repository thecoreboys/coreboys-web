"use client";

import { useState } from "react";
import { ClipSubmitForm } from "@/components/clips/ClipSubmitForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
    <Dialog open={open} onOpenChange={setOpen}>
      <PageHeader
        eyebrow="Cuts"
        title="Cuts."
        supporting="Recaps and moments from across the house."
        meta={`${total} ${total === 1 ? "cut" : "cuts"}`}
        actions={
          <DialogTrigger asChild>
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-xl border border-[color:var(--ui-line)] bg-[color:var(--ui-surface)] px-4 text-sm font-medium text-[color:var(--ink)] transition-colors hover:bg-[color:var(--ui-hover)]"
            >
              Submit a cut
            </button>
          </DialogTrigger>
        }
      />

      {open ? <ClipSubmitModal members={members} onClose={() => setOpen(false)} /> : null}
    </Dialog>
  );
}

function ClipSubmitModal({
  members,
  onClose,
}: {
  members: MemberLite[];
  onClose: () => void;
}) {
  return (
    <DialogContent className="max-w-[680px] bg-primary pt-12" aria-describedby={undefined}>
      <DialogTitle className="sr-only">Submit a clip</DialogTitle>
      <ClipSubmitForm members={members} onClose={onClose} showHeaderClose={false} />
    </DialogContent>
  );
}
