import { TriangleAlert } from "lucide-react";

/**
 * Pre-launch banner. Pinned to the top of every page above the navbar
 * so visitors immediately understand the site isn't public yet. The
 * existing `TopNav` is `fixed top-0`, so the banner needs to push the
 * navbar's top offset by its own height — handled by giving it a
 * `relative z-50` and rendering it BEFORE the `<TopNav>` in the layout.
 */
export function UnreleasedBanner() {
  return (
    <div
      role="status"
      className="relative z-50 w-full border-b border-[color:var(--core)]/40 bg-[color:var(--core)]/12 text-[color:var(--ink)] backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-[1440px] items-center justify-center gap-2 px-6 py-2 text-center md:px-8">
        <TriangleAlert size={13} className="shrink-0 text-[color:var(--core)]" />
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink)] md:text-[11px]">
          <span className="font-bold text-[color:var(--core)]">Under Maintenance</span>
          <span className="mx-2 text-[color:var(--ink-faint)]">·</span>
          This is a unofficial site. If you enjoy it, maybe It can be an official website.
          {" "}
          <a
            href="https://mdcran.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 decoration-[color:var(--ink-faint)] hover:text-[color:var(--core)] hover:decoration-[color:var(--core)]"
          >
            Built by MDCran ↗
          </a>
        </p>
      </div>
    </div>
  );
}
