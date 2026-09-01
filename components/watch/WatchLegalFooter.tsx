import Link from "next/link";

/** Always-visible policy links required by connected-platform app reviews. */
export function WatchLegalFooter() {
  return (
    <footer className="border-t border-[color:var(--rule)] px-5 py-8 text-[11px] text-[color:var(--ink-dim)] sm:px-8">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>CORE TV · Unofficial site</p>
        <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link className="hover:text-[color:var(--ink)]" href="/legal/privacy">
            Privacy Policy
          </Link>
          <Link className="hover:text-[color:var(--ink)]" href="/legal/terms">
            Terms of Service
          </Link>
          <Link className="hover:text-[color:var(--ink)]" href="/legal/data-deletion">
            Data deletion
          </Link>
        </nav>
      </div>
    </footer>
  );
}
