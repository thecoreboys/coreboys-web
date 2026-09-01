import Link from "next/link";

/** Shared policy footer mounted by the root layout on every standard route. */
export function GlobalSiteFooter() {
  return (
    <footer className="border-t border-[color:var(--rule)] bg-[color:var(--bg)] px-5 py-8 text-[11px] text-[color:var(--ink-dim)] sm:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p>CORE TV · Unofficial site</p>
        <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-5 gap-y-2 uppercase tracking-[0.12em]">
          <Link className="hover:text-[color:var(--ink)]" href="/legal/terms">Terms of Service</Link>
          <Link className="hover:text-[color:var(--ink)]" href="/legal/privacy">Privacy Policy</Link>
          <Link className="hover:text-[color:var(--ink)]" href="/legal/cookies">Cookie Policy</Link>
          <Link className="hover:text-[color:var(--ink)]" href="/legal/data-deletion">Data deletion</Link>
        </nav>
      </div>
    </footer>
  );
}
