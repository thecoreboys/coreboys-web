"use client";

import { useMemo, useState, type ReactNode } from "react";
import { MAIL_MEMBERS_BY_SLUG, type MailMember } from "@/lib/fan-mail";
import type { PostcardDraft } from "@/lib/postcard-draft";
import { designById, postcardIdentityFor } from "@/lib/postcard-identities";
import { resolvePostcardScene } from "@/lib/postcard-scene";
import { cn } from "@/lib/utils";
import { PostcardBackFace, PostcardFrontFace } from "./PostcardFaces";

type Face = "front" | "back";

/**
 * Two-sided preview of the artwork that will be handed to the print provider.
 * The writing side deliberately keeps the provider-controlled USPS region
 * visible, rather than pretending a decorative creator seal is real postage.
 */
export function PostcardPreview({
  recipient,
  message,
  senderName,
  designId,
  imageDataUrl,
  variationSeed,
  draft,
}: {
  recipient: MailMember | null;
  message: string;
  senderName?: string;
  designId: string;
  imageDataUrl?: string | null;
  variationSeed?: string;
  /** Optional rich editor state. Valid draft identity and design take precedence. */
  draft?: PostcardDraft | null;
}) {
  const [face, setFace] = useState<Face>("front");
  const scene = useMemo(() => draft ? resolvePostcardScene(draft) : null, [draft]);
  const effectiveRecipient = scene ? MAIL_MEMBERS_BY_SLUG[scene.identity.slug] ?? recipient : recipient;
  const identity = scene?.identity ?? postcardIdentityFor(effectiveRecipient?.slug);
  const design = scene?.design ?? (identity ? designById(designId, identity.slug) : null);

  if (!effectiveRecipient || !identity || !design) {
    return (
      <div className="grid aspect-[3/2] w-full place-items-center rounded-2xl border border-dashed border-secondary bg-secondary px-6 text-center text-sm text-tertiary">
        Pick a recipient to reveal their postcard collection.
      </div>
    );
  }

  const faceProps = {
    recipient: effectiveRecipient,
    message,
    senderName,
    designId: design.id,
    imageDataUrl,
    variationSeed,
    draft: scene?.draft,
  };
  const hasCustomArt = scene
    ? scene.draft.photoSlots.some((slot) => slot.asset !== null)
    : Boolean(imageDataUrl);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-secondary bg-primary p-1" role="group" aria-label="Postcard side">
          <FaceButton active={face === "front"} onClick={() => setFace("front")}>
            Front artwork
          </FaceButton>
          <FaceButton active={face === "back"} onClick={() => setFace("back")}>
            Writing side
          </FaceButton>
        </div>
        <span className="hidden text-right text-xs text-tertiary sm:block">
          {identity.communityName} · {design.label}
        </span>
      </div>

      <div>
        {face === "front" ? <PostcardFrontFace {...faceProps} /> : <PostcardBackFace {...faceProps} />}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-secondary bg-primary px-3.5 py-3">
        <span
          aria-hidden
          className="mt-0.5 size-2.5 shrink-0 rounded-full"
          style={{ background: identity.palette.primary }}
        />
        <div>
          <p className="text-sm font-semibold text-primary">
            {face === "front" ? design.label : `${identity.creatorName}'s writing side`}
            {hasCustomArt && face === "front" ? " · your art" : ""}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-tertiary">
            {face === "front"
              ? design.description
              : "Your note and creator details print on the left. The marked right-hand zone stays clear for the real address, barcode, and postage applied during mailing."}
          </p>
        </div>
      </div>
    </div>
  );
}

function FaceButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
        active ? "bg-brand-solid text-white shadow-xs" : "text-tertiary hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}
