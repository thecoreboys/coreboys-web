"use client";

import { useEffect, useState } from "react";
import { BarChart3, Images, Mail, UsersRound } from "lucide-react";
import { cx } from "@/utils/cx";

type SectionId = "mail" | "wall" | "polls" | "communities";

const sections: Array<{ id: SectionId; label: string; icon: typeof Mail }> = [
  { id: "communities", label: "Communities", icon: UsersRound },
  { id: "mail", label: "Mail", icon: Mail },
  { id: "wall", label: "Wall", icon: Images },
  { id: "polls", label: "Polls", icon: BarChart3 },
];

export function FanZoneNav() {
  const [active, setActive] = useState<SectionId>("communities");
  const [counts, setCounts] = useState<{ wallPhotos?: number; openPolls?: number }>({});

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActive(visible.target.id as SectionId);
      },
      { rootMargin: "-25% 0px -60%", threshold: [0.05, 0.25, 0.5] },
    );
    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    void fetch("/api/fanzone/summary", { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { wallPhotos?: number; openPolls?: number } | null) => {
        if (data) setCounts(data);
      });
  }, []);

  return (
    <nav aria-label="Fanzone sections" className="sticky top-16 z-30 border-y border-secondary bg-primary/90 backdrop-blur-xl md:top-[72px]">
      <div className="mx-auto flex max-w-container items-center gap-1 overflow-x-auto px-4 py-2 md:px-8">
        {sections.map((section) => {
          const Icon = section.icon;
          const count = section.id === "wall" ? counts.wallPhotos : section.id === "polls" ? counts.openPolls : undefined;
          return (
            <a
              key={section.id}
              href={`#${section.id}`}
              aria-current={active === section.id ? "location" : undefined}
              className={cx(
                "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                active === section.id ? "bg-secondary text-primary" : "text-tertiary hover:text-primary",
              )}
            >
              <Icon size={15} /> {section.label}
              {typeof count === "number" ? <span className="text-xs font-medium tabular-nums text-quaternary">{count}</span> : null}
            </a>
          );
        })}
        <span className="ml-auto hidden text-xs text-quaternary md:block">One place for the community</span>
      </div>
    </nav>
  );
}
