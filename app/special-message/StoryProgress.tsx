"use client";

import { useEffect, useState } from "react";
import { storyChapters } from "./story-chapters";
import styles from "./special-message.module.css";

export function StoryProgress() {
  const [active, setActive] = useState<string>(storyChapters[0].id);

  useEffect(() => {
    const story = document.getElementById("story-timeline");
    const sections = storyChapters.map(({ id }) => document.getElementById(id));
    let frame = 0;

    const measure = () => {
      frame = 0;
      const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--site-header-h")) || 0;
      let current: string = storyChapters[0].id;
      for (const section of sections) {
        if (section && section.getBoundingClientRect().top <= header + 72) current = section.id;
      }
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

  const links = (
    <ol>
      {storyChapters.map(({ id, title }) => (
        <li key={id}>
          <a href={`#${id}`} aria-current={active === id ? "location" : undefined}>{title}</a>
        </li>
      ))}
    </ol>
  );

  return (
    <aside className={styles.timelineSidebar}>
      <nav className={styles.desktopContents} aria-label="On this page">
        <p>On this page</p>
        {links}
      </nav>
      <details className={styles.mobileContents}>
        <summary>On this page</summary>
        <nav aria-label="On this page">{links}</nav>
      </details>
    </aside>
  );
}
