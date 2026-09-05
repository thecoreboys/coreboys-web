import { ArrowUpRight } from "@untitledui/icons";

/**
 * Pre-launch banner. Pinned to the top of every page above the navbar.
 * Untitled UI brand banner: brand-solid pill badge + supporting copy on
 * a subtle bg-secondary strip with a real bottom rule.
 */
export function UnreleasedBanner() {
  return (
    <div
      role="status"
      className="relative z-50 w-full border-b border-secondary bg-secondary/90 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-container flex-col items-center justify-center gap-1 px-4 py-2.5 text-center sm:flex-row sm:flex-wrap sm:gap-x-2.5 sm:gap-y-1 md:px-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-solid px-2.5 py-0.5 text-xs font-semibold text-white shadow-xs-skeuomorphic">
          <span
            aria-hidden
            className="size-1.5 rounded-full bg-white"
            style={{ animation: "live-blink 1.6s ease-in-out infinite" }}
          />
          Unofficial Site
        </span>
        <span className="max-w-[34rem] text-xs font-medium leading-5 text-tertiary sm:max-w-none">
          Not affiliated with CORE Boys. I&apos;d love to speak with the technical production crew.
        </span>
        <a
          href="https://x.com/berryeyu"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-secondary transition-colors hover:text-brand-secondary_hover"
        >
          Contact the builder
          <ArrowUpRight className="size-3.5" />
        </a>
      </div>
    </div>
  );
}
