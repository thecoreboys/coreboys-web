export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading page"
      aria-busy="true"
      className="mx-auto w-full max-w-container px-4 py-7 sm:px-6 lg:px-8"
    >
      <span className="sr-only">Loading page…</span>
      <div className="animate-pulse space-y-8 motion-reduce:animate-none">
        <div className="space-y-3">
          <div className="h-3 w-24 rounded bg-[color:var(--surface)]" />
          <div className="h-8 w-2/5 max-w-sm rounded-lg bg-[color:var(--surface)]" />
          <div className="h-4 w-3/5 max-w-xl rounded bg-[color:var(--surface)]" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div
              key={index}
              className="aspect-video rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)]"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
