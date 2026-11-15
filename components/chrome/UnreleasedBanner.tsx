/**
 * Pre-launch banner. Pinned to the top of every page above the navbar.
 * Untitled UI brand banner: brand-solid pill badge + supporting copy on
 * a subtle bg-secondary strip with a real bottom rule.
 */
export function UnreleasedBanner() {
  return (
    <div
      className="relative z-50 w-full border-b border-secondary bg-secondary/90 backdrop-blur-md"
    >
      <p className="mx-auto max-w-container px-3 py-1.5 text-center text-[13px] leading-5 text-secondary">
        Unofficial fan site · Not affiliated with CORE.
      </p>
    </div>
  );
}
