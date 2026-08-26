"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchLg } from "@untitledui/icons";
import { Input } from "@/components/base/input/input";

export type Heading = { id: string; text: string; level: 2 | 3 };

/**
 * Sticky sidebar with: in-article search field that scrolls to the
 * first matching heading + a TOC of all H2/H3 headings with active
 * highlight that follows scroll.
 *
 * Headings are extracted server-side from the article body and passed
 * down — that way the TOC works even before client JS hydrates.
 */
export function ArticleSidebar({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    for (const h of headings) {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [headings]);

  const filtered = useMemo(() => {
    if (!query.trim()) return headings;
    const q = query.trim().toLowerCase();
    return headings.filter((h) => h.text.toLowerCase().includes(q));
  }, [headings, query]);

  const onJump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 88;
    window.scrollTo({ top, behavior: "smooth" });
  };

  if (headings.length === 0) return null;

  return (
    <aside className="sticky top-24 flex max-h-[calc(100vh-7rem)] flex-col gap-3 overflow-hidden">
      <Input
        size="sm"
        type="text"
        aria-label="Find in article"
        icon={SearchLg}
        value={query}
        onChange={setQuery}
        placeholder="Find in article…"
      />
      <div className="overflow-y-auto pr-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
          On this page
        </p>
        <ol className="mt-3 flex flex-col gap-1">
          {filtered.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => onJump(h.id)}
                className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors cursor-pointer ${
                  active === h.id
                    ? "bg-[color:var(--bg-elev)] text-[color:var(--core)]"
                    : "text-[color:var(--ink-dim)] hover:bg-[color:var(--bg-elev)] hover:text-[color:var(--ink)]"
                } ${h.level === 3 ? "pl-5" : ""}`}
              >
                <span
                  className={`mt-1 h-1 w-1 shrink-0 rounded-full ${active === h.id ? "bg-[color:var(--core)]" : "bg-[color:var(--ink-faint)]"}`}
                />
                <span className="leading-snug">{h.text}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-[color:var(--ink-faint)]">
              No headings match
            </li>
          ) : null}
        </ol>
      </div>
    </aside>
  );
}
