"use client";

import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { SocialIcon, PLATFORM_LABEL } from "./SocialIcon";
import { LiveDot } from "./LiveDot";
import { ageFromIso } from "@/lib/utils";
import { useLoginIsLive } from "@/hooks/useLiveStatus";
import { CREW, type Member } from "@/lib/members";

const PLATFORM_ORDER = ["youtube", "twitch", "tiktok", "instagram", "x", "snapchat"] as const;
type DialogPlatform = (typeof PLATFORM_ORDER)[number];

export function MemberDialog({
  member,
  open,
  onOpenChange,
}: {
  member: Member | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const live = useLoginIsLive(member?.twitchLogin ?? "");

  if (!member) return null;

  const grouped = new Map<DialogPlatform, typeof member.socials>();
  for (const platform of PLATFORM_ORDER) {
    const subset = member.socials.filter((s) => s.platform === platform);
    if (subset.length > 0) grouped.set(platform, subset);
  }
  const availablePlatforms = [...grouped.keys()];
  const defaultPlatform = availablePlatforms[0] ?? "youtube";
  const age = ageFromIso(member.birthDate);

  const cameraman = CREW.find(
    (c) => c.role === "cameraman" && c.worksWith.includes(member.slug),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1.4fr]">
          {/* Portrait pane */}
          <div className="relative aspect-[3/4] w-full overflow-hidden bg-[color:var(--bg)] lg:aspect-auto">
            <Image
              src={member.portrait}
              alt={member.stageName}
              fill
              sizes="(min-width: 1024px) 40vw, 92vw"
              className="object-cover"
              priority
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: `linear-gradient(180deg, transparent 30%, ${member.accent}25 100%)`,
              }}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[color:var(--bg-elev)] via-transparent to-transparent" />
          </div>

          {/* Detail pane */}
          <div className="flex flex-col gap-6 p-8 md:p-10">
            <div className="flex items-center gap-3 kicker">
              <LiveDot live={live} />
              <span>{live ? "Live now" : "Member"}</span>
              <span className="opacity-40">/</span>
              <span style={{ color: member.accent }}>● {member.slug}</span>
            </div>

            <div>
              <DialogTitle>{member.stageName}</DialogTitle>
              <DialogDescription className="mt-2">
                {member.realName}
                {age != null ? ` · ${age}` : ""}
              </DialogDescription>
            </div>

            <p className="max-w-prose text-[color:var(--ink)]/85 leading-relaxed">{member.bio}</p>

            <Tabs defaultValue={defaultPlatform} className="w-full">
              <TabsList>
                {availablePlatforms.map((p) => (
                  <TabsTrigger key={p} value={p}>
                    <SocialIcon platform={p} size={14} />
                    {PLATFORM_LABEL[p]}
                  </TabsTrigger>
                ))}
              </TabsList>
              {availablePlatforms.map((p) => (
                <TabsContent key={p} value={p}>
                  <ul className="flex flex-col gap-2">
                    {grouped.get(p)!.map((s) => (
                      <li key={s.url}>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-center justify-between border border-[color:var(--rule)] bg-[color:var(--bg)] px-4 py-3 transition hover:border-[color:var(--ink)]/40"
                        >
                          <span className="flex items-center gap-3 text-sm">
                            <SocialIcon platform={p} size={16} className="opacity-70 group-hover:opacity-100" />
                            <span className="font-medium">{s.label ?? s.handle ?? PLATFORM_LABEL[p]}</span>
                            {s.handle && s.label ? (
                              <span className="text-[color:var(--ink-dim)] text-xs">{s.handle}</span>
                            ) : null}
                          </span>
                          <span className="kicker text-xs opacity-60 group-hover:opacity-100">Open ↗</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </TabsContent>
              ))}
            </Tabs>

            {cameraman ? (
              <div className="mt-2 border-t border-[color:var(--rule)] pt-4">
                <div className="kicker mb-2">Shot by</div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium">{cameraman.name}</div>
                    <div className="kicker text-xs">Cameraman</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {cameraman.socials.map((s) => (
                      <a
                        key={s.url}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--rule)] text-[color:var(--ink-dim)] transition hover:text-[color:var(--ink)]"
                        aria-label={`${cameraman.name} on ${PLATFORM_LABEL[s.platform as DialogPlatform]}`}
                      >
                        <SocialIcon platform={s.platform as DialogPlatform} size={14} />
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
