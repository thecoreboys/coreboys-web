import { MessageSquare } from "lucide-react";

/**
 * Floating "Give Feedback" pill in the bottom-right corner of every
 * page. Opens the public Google Form in a new tab so the visitor's
 * scroll position / state is preserved.
 *
 * Mounted globally from app/layout.tsx alongside the other persistent
 * surface chrome (cookie banner, console egg, etc.).
 */
export function FeedbackButton() {
  return (
    <a
      href="https://forms.gle/gg9TEQjSn7UCvRcE6"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Give feedback (opens Google Form in a new tab)"
      className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-[color:var(--core)]/60 bg-[color:var(--bg-elev)]/90 px-4 py-2.5 text-[12px] font-semibold tracking-tight text-[color:var(--ink)] shadow-[0_18px_40px_-18px_rgba(239,68,68,0.7),inset_0_0_0_1px_rgba(239,68,68,0.18)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-[color:var(--core)] hover:bg-[color:var(--core)]/12 hover:text-[color:var(--core)] md:bottom-6 md:right-6"
    >
      <MessageSquare size={13} aria-hidden />
      Give Feedback
    </a>
  );
}
