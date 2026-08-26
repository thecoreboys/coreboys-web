"use client";

import { useEffect, useState } from "react";
import styles from "./special-message.module.css";

export function StoryProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const story = document.getElementById("special-message-top");
        if (!story) return;

        const start = story.offsetTop;
        const distance = Math.max(1, story.offsetHeight - window.innerHeight);
        const next = Math.min(1, Math.max(0, (window.scrollY - start) / distance));
        setProgress(next);
      });
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div className={styles.storyProgress} aria-hidden="true">
      <span style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}
