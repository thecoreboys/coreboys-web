"use client";

import { ExternalLink } from "lucide-react";
import styles from "./ContactInquiryWidget.module.css";

/** Persistent, low-profile contact point for website inquiries. */
export function ContactInquiryWidget() {
  return (
    <aside className={styles.widget} aria-label="Website inquiries contact">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/berryeyu-blue.png" alt="" className={styles.avatar} />
      <p>
        Contact <a href="https://x.com/berryeyu" target="_blank" rel="noreferrer">@berryeyu</a> on <span className={styles.xLabel} aria-label="X"><span aria-hidden className={styles.xLogo}>𝕏</span></span> for website inquiries
      </p>
      <ExternalLink aria-hidden className={styles.icon} />
    </aside>
  );
}
