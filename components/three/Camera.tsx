"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Scripted camera dolly — replaces R3F's static camera with a GSAP timeline
 * driven both by initial-load tween AND by ScrollTrigger pin-points.
 *
 * Phases:
 *   load:       z=12 → z=8 over 2s, with subtle Y drift.
 *   past hero:  tilt down 8°, dolly in to z=5 (manifesto compose).
 *   manifesto:  hold (no movement) so the manifesto words own the frame.
 *   roster on:  retreat to z=14, slow 15° orbit on Y, ambient mode.
 */
export function Camera() {
  const { camera } = useThree();
  const tweens = useRef<gsap.core.Tween[]>([]);
  const triggers = useRef<ScrollTrigger[]>([]);

  useEffect(() => {
    // Load tween: z=12 → 8 with slight y drift.
    camera.position.set(0, 0.4, 12);
    camera.lookAt(0, 0, 0);
    const t1 = gsap.to(camera.position, {
      z: 8,
      y: 0.55,
      duration: 2,
      ease: "expo.out",
    });
    tweens.current.push(t1);

    if (typeof window !== "undefined") {
      gsap.registerPlugin(ScrollTrigger);
    }

    // Past-hero tilt: bind to scroll progress over the hero section.
    const hero = document.getElementById("hero");
    const manifesto = document.getElementById("manifesto");
    const roster = document.getElementById("roster");

    if (hero && manifesto) {
      const st1 = ScrollTrigger.create({
        trigger: hero,
        start: "bottom bottom",
        end: () => `+=${manifesto.offsetHeight}`,
        scrub: 1,
        onUpdate: (self) => {
          const p = self.progress;
          camera.position.z = 8 - p * 3; // 8 → 5
          camera.position.y = 0.55 - p * 0.6;
          camera.rotation.x = -p * 0.14; // ~8°
        },
      });
      triggers.current.push(st1);
    }

    if (roster) {
      const st2 = ScrollTrigger.create({
        trigger: roster,
        start: "top center",
        end: "bottom top",
        scrub: 1,
        onUpdate: (self) => {
          const p = self.progress;
          camera.position.z = 5 + p * 9; // 5 → 14
          camera.rotation.y = p * 0.26; // ~15°
        },
      });
      triggers.current.push(st2);
    }

    return () => {
      tweens.current.forEach((t) => t.kill());
      triggers.current.forEach((t) => t.kill());
      tweens.current = [];
      triggers.current = [];
    };
  }, [camera]);

  return null;
}
