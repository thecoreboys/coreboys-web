import { Mail01, PackageX, Pencil01 } from "@untitledui/icons";

const STEPS = [
  {
    icon: Pencil01,
    title: "Address it exactly",
    body: "Copy the recipient line as shown. It is the name registered to that box, so your mail reaches the right person.",
  },
  {
    icon: Mail01,
    title: "Stamp it right",
    body: "One Forever stamp covers a standard one-ounce letter or a postcard. Weigh thick envelopes and packages at the post office.",
  },
  {
    icon: PackageX,
    title: "Keep it safe",
    body: "No perishables, hazardous items, or cash. Do not send anything you need back, and put your name or handle inside.",
  },
] as const;

/** Three short sending rules shared by the hub and every creator page. */
export function SendingGuide({ accent = "var(--core)" }: { accent?: string }) {
  return (
    <ol className="grid gap-px overflow-hidden rounded-2xl border border-[color:var(--rule)] bg-[color:var(--rule)] md:grid-cols-3">
      {STEPS.map((step, index) => {
        const Icon = step.icon;
        return (
          <li key={step.title} className="flex gap-4 bg-[color:var(--bg-elev)] p-5 md:flex-col md:p-6">
            <span className="flex shrink-0 items-center gap-3">
              <span
                className="grid size-10 place-items-center rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg)] text-[color:var(--ink)]"
                style={{ boxShadow: `inset 0 -2px 0 ${accent}` }}
              >
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <span className="hidden text-xs font-semibold tabular-nums text-[color:var(--ink-faint)] md:inline">
                0{index + 1}
              </span>
            </span>
            <span className="min-w-0">
              <span className="block text-base font-semibold text-[color:var(--ink)]">{step.title}</span>
              <span className="mt-1 block text-sm leading-relaxed text-[color:var(--ink-dim)]">{step.body}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
