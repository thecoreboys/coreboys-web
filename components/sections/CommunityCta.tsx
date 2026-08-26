import type { ReactNode } from "react";
import { CtaGradientBox } from "@/components/sections/CtaGradientBox";

/**
 * On-brand "join the community" CTA section. Thin wrapper that drops the
 * reusable <CtaGradientBox> into a full-bleed section band. The public prop
 * API is preserved so existing call sites (app/page.tsx) keep working.
 */
type IconName = "users" | "heart" | "image" | "announcement" | "play" | "stars";

export function CommunityCta({
  eyebrow = "Join the community",
  iconName = "users",
  title = (
    <>
      Become part of <span className="whitespace-nowrap">the house.</span>
    </>
  ),
  supporting = "Create a free account to follow your favorite members, save clips, send fan mail, and get into the live chat.",
  primaryLabel = "Create your account",
  primaryHref = "/signup",
  secondaryLabel,
  secondaryHref,
}: {
  eyebrow?: string;
  iconName?: IconName;
  title?: ReactNode;
  supporting?: ReactNode;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}) {
  return (
    <section className="relative py-16 md:py-24">
      <div className="mx-auto max-w-container px-6 md:px-8">
        <CtaGradientBox
          eyebrow={eyebrow}
          iconName={iconName}
          title={title}
          supporting={supporting}
          primaryLabel={primaryLabel}
          primaryHref={primaryHref}
          secondaryLabel={secondaryLabel}
          secondaryHref={secondaryHref}
          pattern="grid-check"
        />
      </div>
    </section>
  );
}
