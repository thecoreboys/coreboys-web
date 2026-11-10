import Link from "next/link";

/** The independent fan-site notice stays above the navigation on every page. */
export function UnreleasedBanner() {
  return (
    <div
      className="relative z-50 w-full border-b border-secondary bg-secondary/90 backdrop-blur-md"
    >
      <p className="mx-auto max-w-container px-3 py-1.5 text-center text-[13px] leading-5 text-secondary">
        Unofficial fan site - not affiliated with CORE.{" "}
        <Link href="/special-message" className="rounded-sm font-semibold underline underline-offset-4 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
          Read a message from the site creator.
        </Link>
      </p>
    </div>
  );
}
