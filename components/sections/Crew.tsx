"use client";

import { useQueryState } from "nuqs";
import { CREW, MEMBERS_BY_SLUG } from "@/lib/members";
import { SocialIcon, PLATFORM_LABEL } from "@/components/ui/SocialIcon";

const ROLE_LABEL: Record<string, string> = {
  cameraman: "Camera",
  management: "Management",
  editor: "Editor",
  producer: "Producer",
};

export function Crew() {
  const [, setMemberSlug] = useQueryState("member", {
    defaultValue: "",
    history: "push",
    shallow: true,
  });

  type CrewItem = (typeof CREW)[number];
  const grouped = CREW.reduce<Record<string, CrewItem[]>>((acc, c) => {
    const list = acc[c.role] ?? [];
    list.push(c);
    acc[c.role] = list;
    return acc;
  }, {});

  return (
    <section id="crew" className="relative w-full bg-[color:var(--bg)] py-28 md:py-36 rule">
      <div className="mx-auto max-w-7xl px-6">
        <div className="kicker mb-3">Behind the lens</div>
        <h2 className="font-display text-4xl md:text-6xl font-semibold tracking-tight">
          The crew.
        </h2>
        <p className="mt-4 max-w-xl text-[color:var(--ink-dim)]">
          The people who make sure the footage exists at all.
        </p>

        <div className="mt-14 grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-3">
          {Object.entries(grouped).map(([role, list]) => (
            <div key={role}>
              <div className="kicker mb-5">{ROLE_LABEL[role] ?? role}</div>
              <ul className="flex flex-col gap-3">
                {list.map((c) => {
                  const works = c.worksWith
                    .map((slug) => MEMBERS_BY_SLUG[slug])
                    .filter((m): m is NonNullable<typeof m> => !!m);
                  return (
                    <li
                      key={c.slug}
                      className="border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-5 transition hover:border-[color:var(--ink)]/40"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-base font-medium tracking-tight">{c.name}</div>
                          <div className="kicker mt-1 text-[10px]">
                            {works.map((m, i) => (
                              <button
                                key={m.slug}
                                onClick={() => void setMemberSlug(m.slug)}
                                className="hover:text-[color:var(--ink)]"
                                style={{ color: m.accent }}
                              >
                                {m.stageName}
                                {i < works.length - 1 ? <span className="opacity-40"> · </span> : null}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {c.socials.map((s) => (
                            <a
                              key={s.url}
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`${c.name} on ${PLATFORM_LABEL[s.platform as "x" | "instagram"]}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--rule)] text-[color:var(--ink-dim)] transition hover:text-[color:var(--ink)]"
                            >
                              <SocialIcon platform={s.platform as "x" | "instagram"} size={14} />
                            </a>
                          ))}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
