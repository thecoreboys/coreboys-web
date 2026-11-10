import Link from "next/link";

/** The independent fan-site notice stays above the navigation on every page. */
export function UnreleasedBanner() {
  return (
    <div
      className="relative z-50 w-full border-b border-secondary bg-secondary/90 backdrop-blur-md"
    >
      <p className="mx-auto max-w-container whitespace-nowrap px-2 py-1 text-center text-[12px] leading-5 text-secondary sm:px-3 sm:py-1.5 sm:text-[13px]">
        <span className="sm:hidden">Unofficial · Not affiliated with CORE · </span>
        <span className="hidden sm:inline">
        Unofficial fan site - not affiliated with CORE.{" "}
        </span>
        <Link href="/special-message" className="rounded-sm font-semibold underline underline-offset-4 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
          <span className="sm:hidden">Read message</span>
          <span className="hidden sm:inline">Read a message from the site creator.</span>
        </Link>
      </p>
    </div>
  );
}
