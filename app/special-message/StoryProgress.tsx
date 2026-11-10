"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { storyChapters } from "./story-chapters";
import styles from "./special-message.module.css";

export function StoryProgress() {
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState<string>(storyChapters[0].id);

  useEffect(() => {
    const story = document.getElementById("story-timeline");
    const sections = storyChapters.map(({ id }) => document.getElementById(id));
    let frame = 0;

    const measure = () => {
      frame = 0;
      if (!story) return;
      const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--site-header-h")) || 0;
      const bounds = story.getBoundingClientRect();
      const distance = Math.max(1, bounds.height - window.innerHeight + header);
      setProgress(Math.min(1, Math.max(0, (header - bounds.top) / distance)));
      let current: string = storyChapters[0].id;
      sections.forEach((section) => {
        if (section && section.getBoundingClientRect().top <= header + 160) current = section.id;
      });
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    if (story) observer.observe(story);
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <aside className={styles.timelineSidebar} data-lenis-prevent>
      <nav className={styles.chapterNav} aria-label="Message timeline">
        <p className={styles.navHeading}>Follow the story <span>{storyChapters.find((chapter) => chapter.id === active)?.number} / 08</span></p>
        <ol>
          {storyChapters.map((chapter) => (
            <li key={chapter.id}>
              <a href={`#${chapter.id}`} aria-current={active === chapter.id ? "location" : undefined}>
                <span className={styles.navNumber}>{chapter.number}</span>
                <span><strong>{chapter.title}</strong><small>{chapter.detail}</small></span>
              </a>
            </li>
          ))}
        </ol>
        <div className={styles.readingProgress}>
          <span>Reading progress <b>{Math.round(progress * 100)}%</b></span>
          <div aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></div>
        </div>
      </nav>
      <div className={styles.authorCard}>
        <span className={styles.authorMark} aria-hidden="true">mc<span>_</span></span>
        <p>Built by <strong>Michael</strong></p>
        <a href="https://x.com/berryeyu" target="_blank" rel="noreferrer">Get in touch <ArrowUpRight size={14} aria-hidden="true" /></a>
      </div>
    </aside>
  );
}
