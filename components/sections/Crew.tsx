"use client";

import { useQueryState } from "nuqs";
import { CREW, MEMBERS_BY_SLUG } from "@/lib/members";
import { SocialIcon, PLATFORM_LABEL } from "@/components/ui/SocialIcon";
import { Display, Eyebrow } from "@/components/typography";
import { SectionNumber } from "@/components/editorial/SectionNumber";

const ROLE_LABEL: Record<string, string> = {
  cameraman: "Camera",
  management: "Management",
  editor: "Editor",
  producer: "Technical Productions",
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
      <SectionNumber index={6} label="Crew" />
      <div className="mx-auto max-w-container px-6 md:px-16">
        <Eyebrow className="mb-3">Behind the lens</Eyebrow>
        <Display as="h2" size={48} className="md:text-[72px]">
          The crew.
        </Display>
        <p className="mt-4 max-w-xl text-lg text-[color:var(--ink-dim)]">
          The people who make sure the footage exists at all.
        </p>

        <div className="mt-14 grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-3">
          {Object.entries(grouped).map(([role, list]) => (
            <div key={role}>
              <Eyebrow className="mb-5">{ROLE_LABEL[role] ?? role}</Eyebrow>
              <ul className="flex flex-col gap-3">
                {list.map((c) => {
                  const works = c.worksWith
                    .map((slug) => MEMBERS_BY_SLUG[slug])
                    .filter((m): m is NonNullable<typeof m> => !!m);
                  return (
                    <li
                      key={c.slug}
                      className="rounded-xl bg-[color:var(--bg-elev)] p-5 ring-1 ring-inset ring-[color:var(--rule)] shadow-xs-skeuomorphic transition hover:ring-[color:var(--ink)]/40"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-md font-semibold tracking-tight text-[color:var(--ink)]">{c.name}</div>
                          <div className="kicker mt-1 text-xs">
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
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--ink-dim)] ring-1 ring-inset ring-[color:var(--rule)] transition hover:text-[color:var(--ink)] hover:ring-[color:var(--ink)]/40"
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
