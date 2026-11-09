import Link from "next/link";

/** Shared policy footer mounted by the root layout on every standard route. */
export function GlobalSiteFooter() {
  return (
    <footer className="site-footer border-t border-[color:var(--rule)] bg-[color:var(--bg)] px-5 py-8 text-sm text-[color:var(--ink-dim)] sm:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><p>CORE TV · Independent fan site</p><Link prefetch={false} href="/special-message" className="underline underline-offset-4">About the builder</Link><a href="https://x.com/berryeyu" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Contact</a></div>
        <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link prefetch={false} className="hover:text-[color:var(--ink)]" href="/legal/terms">Terms of Service</Link>
          <Link prefetch={false} className="hover:text-[color:var(--ink)]" href="/legal/privacy">Privacy Policy</Link>
          <Link prefetch={false} className="hover:text-[color:var(--ink)]" href="/legal/cookies">Cookie Policy</Link>
          <Link prefetch={false} className="hover:text-[color:var(--ink)]" href="/legal/data-deletion">Data deletion</Link>
        </nav>
      </div>
    </footer>
  );
}
