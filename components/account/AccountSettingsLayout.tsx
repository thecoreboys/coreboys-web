"use client";

import Link from "next/link";
import {
  Accessibility,
  Bell,
  CreditCard,
  Link2,
  Palette,
  Play,
  Radio,
  Shield,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/utils/cx";

export const ACCOUNT_SETTINGS_NAV = [
  { group: "Account", label: "Profile", href: "/account/settings#profile", id: "profile", icon: UserRound },
  { group: "Account", label: "Connections", href: "/account/settings#connected-accounts", id: "connected-accounts", icon: Link2 },
  { group: "Account", label: "Notifications", href: "/account/settings#notifications", id: "notifications", icon: Bell },
  { group: "Account", label: "Privacy & safety", href: "/account/settings#privacy", id: "privacy", icon: Shield },
  { group: "Preferences", label: "Appearance", href: "/account/settings#experience", id: "experience", icon: Palette },
  { group: "Preferences", label: "Playback", href: "/account/settings#playback", id: "playback", icon: Play },
  { group: "Preferences", label: "Station audio", href: "/account/settings#station-audio", id: "station-audio", icon: Radio },
  { group: "Preferences", label: "Accessibility", href: "/account/settings#accessibility", id: "accessibility", icon: Accessibility },
  { group: "Preferences", label: "Personalization", href: "/account/settings#personalization", id: "personalization", icon: Sparkles },
  { group: "Membership", label: "Billing", href: "/account/settings/billing", id: "billing", icon: CreditCard },
] as const;

export function AccountSettingsLayout({
  title,
  description,
  activeSection,
  children,
}: {
  title: string;
  description: string;
  activeSection: string;
  children: ReactNode;
}) {
  const activeId = activeSection.replace(/^#/, "");
  return (
    <section className="min-h-[calc(100dvh-4rem)] bg-primary text-primary">
      <header className="border-b border-secondary bg-primary">
        <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
          <p className="text-xs font-semibold text-tertiary">Account</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-tertiary">{description}</p>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-start gap-5 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8 lg:px-8">
        <aside className="min-w-0 lg:sticky lg:top-[calc(var(--site-header-h,8rem)+1rem)]">
          <nav aria-label="Account settings" className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-secondary bg-primary p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-col">
            {ACCOUNT_SETTINGS_NAV.map((item, index) => {
              const previous = ACCOUNT_SETTINGS_NAV[index - 1];
              const active = activeId === item.id;
              return (
                <div key={item.id} className={cx("shrink-0", item.group !== previous?.group && index > 0 && "lg:mt-2 lg:border-t lg:border-secondary lg:pt-2")}>
                  {item.group !== previous?.group ? <p className="hidden px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-quaternary lg:block">{item.group}</p> : null}
                  <Link
                    href={item.href as never}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                      active ? "bg-secondary text-primary shadow-xs" : "text-tertiary hover:bg-primary_hover hover:text-primary",
                    )}
                  >
                    <item.icon aria-hidden="true" className={cx("size-4 shrink-0", active ? "text-primary" : "text-quaternary")} />
                    {item.label}
                  </Link>
                </div>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 space-y-5">{children}</main>
      </div>
    </section>
  );
}
