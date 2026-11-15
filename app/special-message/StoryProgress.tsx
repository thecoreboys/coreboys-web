"use client";

import { useEffect, useState } from "react";
import styles from "./special-message.module.css";

export function StoryProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const story = document.getElementById("special-message-top");
    const revealTargets = story?.querySelectorAll<HTMLElement>(
      ".heroFigure, .chapter, .toolkitSection, .receiptsSection, .closingSpread",
    );
    story?.setAttribute("data-story-motion", "on");

    let observer: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.setAttribute("data-story-visible", "true");
            observer?.unobserve(entry.target);
          }
        }, { threshold: 0.12, rootMargin: "0px 0px -7% 0px" })
    }

    revealTargets?.forEach((target) => {
      target.setAttribute("data-story-reveal", "true");
      if (observer) observer.observe(target);
      else target.setAttribute("data-story-visible", "true");
    });

    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
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
      observer?.disconnect();
      story?.removeAttribute("data-story-motion");
      revealTargets?.forEach((target) => {
        target.removeAttribute("data-story-reveal");
        target.removeAttribute("data-story-visible");
      });
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
