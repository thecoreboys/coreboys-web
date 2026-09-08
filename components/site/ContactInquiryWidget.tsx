"use client";

import Link from "next/link";
import { ChevronDown, Mail, ExternalLink } from "lucide-react";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { usePlayer } from "@/components/providers/PlayerProvider";
import styles from "./ContactInquiryWidget.module.css";

export function ContactInquiryWidget() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { mode } = usePlayer();
  if (mode === "theater" || /^\/(?:watch\/)?(?:shorts|multiview|theater)(?:\/|$)/.test(pathname ?? "")) return null;
  return (
    <aside className={styles.widget} aria-label="A message from the website builder">
      {open && <div id="builder-contact" className={styles.contact}>
        <p>Built independently, with appreciation for this community.</p>
        <a href="https://x.com/berryeyu" target="_blank" rel="noreferrer">Website inquiries · @berryeyu <ExternalLink size={14} aria-hidden /></a>
      </div>}
      <div className={styles.row}>
        <Link className={styles.messageLink} href="/special-message">
          <Mail size={18} aria-hidden />
          <span>Read a personal message</span>
        </Link>
        <button type="button" className={styles.toggle} aria-label={open ? "Close builder contact details" : "Show builder contact details"} aria-expanded={open} aria-controls="builder-contact" onClick={() => setOpen(!open)}>
          <ChevronDown size={16} aria-hidden style={{ transform: open ? undefined : "rotate(180deg)" }} />
        </button>
      </div>
    </aside>
  );
}
