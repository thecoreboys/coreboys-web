"use client";

import { useQueryState } from "nuqs";
import { useCallback, useMemo } from "react";
import { MEMBERS, MEMBERS_BY_SLUG } from "@/lib/members";
import { MemberHex } from "@/components/ui/MemberHex";
import { MemberDialog } from "@/components/ui/MemberDialog";

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
      <div className="mx-auto max-w-7xl px-6">
        <div className="kicker mb-3">The boys</div>
        <h2 className="font-display text-5xl md:text-7xl font-semibold tracking-tight">
          The names on the wall.
        </h2>

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
