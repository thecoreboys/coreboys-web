import Link from "next/link";
import type { ReactNode } from "react";
import styles from "@/components/marketing/PricingExperience.module.css";

export function AccountPageHeader({ title, description, active, children }: {
  title: string;
  description: string;
  active: "settings" | "membership" | "upgrade";
  children?: ReactNode;
}) {
  return <header className={styles.cleanHeader}>
    <nav className={styles.accountNav} aria-label="Account and membership">
      {([
        ["settings", "/account/settings", "Account settings"],
        ["membership", "/account/settings/billing", "Billing"],
        ["upgrade", "/upgrade", "Support the site"],
      ] as const).map(([key, href, label]) => <Link key={key} href={href} aria-current={active === key ? "page" : undefined}>{label}</Link>)}
    </nav>
    <p className={styles.kicker}>{active === "settings" ? "Your CORE account" : "CORE membership"}</p>
    <h1 id={active === "settings" ? "settings-title" : "membership-title"}>{title}</h1>
    <p className={styles.heroCopy}>{description}</p>
    {children}
  </header>;
}
