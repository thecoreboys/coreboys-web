import Image from "next/image";
import { Maximize2 } from "lucide-react";
import artwork from "@/public/awards/2026/core-content-org-of-the-year-winner.webp";
import styles from "./StreamerAwardsWinner.module.css";

export function StreamerAwardsWinner() {
  return (
    <section id="streamer-awards" className={`watch-billboard ${styles.section}`} aria-labelledby="streamer-awards-winner-heading" data-awards-winner>
      {/* A soft, heavily blurred wash of the artwork gives the section depth.
          A tiny, low-quality copy is enough because it is never seen sharp. */}
      <div className={styles.backdrop} aria-hidden="true">
        <Image src={artwork} alt="" fill sizes="40vw" quality={25} loading="lazy" />
      </div>
      <div className={styles.copy}>
        <p>The Streamer Awards 2026</p>
        <h2 id="streamer-awards-winner-heading">Content Org of the Year</h2>
      </div>
      <figure className={styles.frame}>
        <a className={styles.artwork} href="/awards/2026/core-content-org-of-the-year-winner.webp" target="_blank" rel="noopener noreferrer" aria-label="View the full CORE Streamer Awards artwork">
          <Image
            src={artwork}
            alt="CORE, Content Org of the Year winner at The Streamer Awards 2026, with all six members on stage."
            sizes="(min-width: 1440px) 736px, (min-width: 768px) 54vw, 92vw"
            placeholder="blur"
            loading="lazy"
          />
          <span className={styles.enlarge} aria-hidden="true"><Maximize2 size={18} /></span>
        </a>
      </figure>
    </section>
  );
}
