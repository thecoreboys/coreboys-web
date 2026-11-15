import type { ReactNode } from "react";
import styles from "@/components/marketing/PricingExperience.module.css";

export function AccountPageHeader({ title, description, children, visual }: {
  title: string;
  description: string;
  children?: ReactNode;
  visual?: ReactNode;
}) {
  return <header className={`${styles.cleanHeader} ${visual ? styles.upgradeHeader : ""}`}>
    <div className={visual ? styles.upgradeHeroCopy : undefined}>
      <p className={styles.kicker}>CORE membership</p>
      <h1 id="membership-title">{title}</h1>
      <p className={styles.heroCopy}>{description}</p>
      {children}
    </div>
    {visual}
  </header>;
}
