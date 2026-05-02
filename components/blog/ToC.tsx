"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/blog";

/**
 * Sticky table of contents. Scrollspy highlights the current heading via
 * IntersectionObserver. Skipped on mobile (the post page hides this aside).
 */
export function ToC({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (items.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    for (const it of items) {
      const el = document.getElementById(it.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;
  return (
    <nav aria-label="Table of contents">
      <p className="kicker mb-2 text-[10px] text-[color:var(--ink-faint)]">In this post</p>
      <ul className="space-y-1.5 text-[12px]">
        {items.map((it) => (
          <li key={it.id} className={it.level === 3 ? "pl-3" : ""}>
            <a
              href={`#${it.id}`}
              className={`block transition-colors ${
                active === it.id
                  ? "text-[color:var(--core)]"
                  : "text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
              }`}
            >
              {it.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
