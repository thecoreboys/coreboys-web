export default function ChannelLoading() {
  return (
    <main className="mx-auto min-h-[calc(100dvh-4rem)] w-full max-w-[1800px] px-4 py-5 sm:px-6 lg:px-10" aria-busy="true" aria-label="Loading network">
      <div className="animate-pulse space-y-8">
        <div className="flex items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-white/[0.035] p-3">
          <span className="h-3 w-20 shrink-0 rounded bg-white/10" />
          <div className="flex min-w-0 gap-2">
            {Array.from({ length: 7 }, (_, index) => (
              <span key={index} className="h-10 w-24 shrink-0 rounded-lg bg-white/[0.07]" />
            ))}
          </div>
        </div>

        <section className="relative flex min-h-[17rem] items-end overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] p-6 sm:min-h-[22rem] sm:p-9">
          <div className="w-full max-w-xl space-y-3">
            <span className="block h-3 w-28 rounded bg-white/10" />
            <span className="block h-9 w-2/3 rounded-lg bg-white/10" />
            <span className="block h-4 w-full max-w-md rounded bg-white/[0.07]" />
            <span className="block h-4 w-4/5 max-w-sm rounded bg-white/[0.07]" />
          </div>
        </section>

        {[0, 1].map((row) => (
          <section key={row} className="space-y-3">
            <span className="block h-5 w-40 rounded bg-white/10" />
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: 7 }, (_, index) => (
                <span key={index} className="aspect-video w-48 shrink-0 rounded-xl bg-white/[0.055] sm:w-56" />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
