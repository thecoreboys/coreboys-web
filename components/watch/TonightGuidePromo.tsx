import Link from "next/link";
import { ArrowRight, Radio } from "lucide-react";
import type { WatchCatalog } from "@/lib/watch/types";

export function TonightGuidePromo({ catalog }: { catalog: WatchCatalog }) {
  return (
    <aside className="guide-tonight-promo mx-5 mb-5 mt-5 flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-[linear-gradient(110deg,rgba(219,3,104,.16),rgba(255,255,255,.035))] px-4 py-4 md:mx-10 md:px-5" data-guide-tonight-promo>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[color:var(--core)] text-white"><Radio className="size-4" aria-hidden /></span>
      <span className="min-w-0 flex-1"><strong className="block text-sm text-[color:var(--ink)]">Tonight on CORE</strong><small className="mt-1 block text-xs text-[color:var(--ink-dim)]">{catalog.live.length ? `${catalog.live.length} live now · then the house rotation` : "The next starts, reminders, and the house rotation"}</small></span>
      <Link href={{ pathname: "/tonight" }} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[color:var(--ink)] px-4 text-xs font-bold text-[color:var(--bg)]">See tonight <ArrowRight className="size-3.5" /></Link>
    </aside>
  );
}
