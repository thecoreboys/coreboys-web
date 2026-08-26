"use client";

import { useQueryState } from "nuqs";
import { useCallback, useMemo } from "react";
import { MEMBERS, MEMBERS_BY_SLUG } from "@/lib/members";
import { MemberHex } from "@/components/ui/MemberHex";
import { MemberDialog } from "@/components/ui/MemberDialog";
import { Display, Eyebrow } from "@/components/typography";
import { SectionNumber } from "@/components/editorial/SectionNumber";

export function Roster() {
  const [memberSlug, setMemberSlug] = useQueryState("member", {
    defaultValue: "",
    history: "push",
    shallow: true,
  });

  const selected = useMemo(() => MEMBERS_BY_SLUG[memberSlug] ?? null, [memberSlug]);

  const onSelect = useCallback(
    (slug: string) => {
      void setMemberSlug(slug);
    },
    [setMemberSlug],
  );

  const onOpenChange = useCallback(
    (next: boolean) => {
      if (!next) void setMemberSlug("");
    },
    [setMemberSlug],
  );

  return (
    <section
      id="roster"
      className="relative w-full bg-[color:var(--bg)] py-28 md:py-40 rule"
    >
      <SectionNumber index={2} label="The Boys" />
      <div className="mx-auto max-w-container px-6 md:px-16">
        <Eyebrow className="mb-3">The boys</Eyebrow>
        <Display as="h2" size={72} className="md:text-[120px]">
          The names on the wall.
        </Display>

        <div className="mt-16 grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 lg:gap-x-10 lg:gap-y-14">
          {MEMBERS.map((m, i) => (
            <MemberHex key={m.slug} member={m} onSelect={onSelect} index={i} />
          ))}
        </div>
      </div>

      <MemberDialog member={selected} open={!!selected} onOpenChange={onOpenChange} />
    </section>
  );
}
