import type { ReactNode } from "react";
import styles from "@/components/marketing/PricingExperience.module.css";

export function AccountPageHeader({ title, description, children, visual }: {
  title: string;
  description: string;
  children?: ReactNode;
  visual?: ReactNode;
}) {
  return <header className={`account-page-intro ${styles.cleanHeader} ${visual ? styles.upgradeHeader : ""}`}>
    <div className={`account-page-intro__copy ${visual ? styles.upgradeHeroCopy : ""}`}>
      <p className={`account-page-intro__eyebrow ${styles.kicker}`}>CORE membership</p>
      <h1 id="membership-title">{title}</h1>
      <p className={`account-page-intro__description ${styles.heroCopy}`}>{description}</p>
      {children}
    </div>
    {visual}
  </header>;
}
