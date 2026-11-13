import Image from "next/image";
import { Maximize2 } from "lucide-react";
import artwork from "@/public/awards/2026/core-content-org-of-the-year-winner.webp";
import styles from "./StreamerAwardsWinner.module.css";

export function StreamerAwardsWinner() {
  return (
    <section id="streamer-awards" className={styles.section} aria-labelledby="streamer-awards-winner-heading" data-awards-winner>
      <h2 id="streamer-awards-winner-heading" className="sr-only">CORE — Content Org of the Year, The Streamer Awards 2026</h2>
      <figure className={styles.frame}>
        <a className={styles.artwork} href="/awards/2026/core-content-org-of-the-year-winner.webp" target="_blank" rel="noopener noreferrer" aria-label="View the full CORE Streamer Awards artwork">
          <Image
            src={artwork}
            alt="CORE, Content Org of the Year winner at The Streamer Awards 2026, with all six members on stage."
            sizes="(min-width: 1680px) 1600px, (min-width: 768px) 94vw, 92vw"
            placeholder="blur"
            loading="lazy"
          />
          <span className={styles.enlarge} aria-hidden="true"><Maximize2 size={18} /></span>
        </a>
      </figure>
    </section>
  );
}
