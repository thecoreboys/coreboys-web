"use client";

import { useEffect, useState } from "react";
import { CoreWordmark } from "@/components/brand/CoreWordmark";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/** A brief station-ident transition that makes entry to the access gate feel intentional. */
export function AccessGateIntro() {
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), reducedMotion ? 80 : 920);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  if (!visible) return null;

  return (
    <div className="access-gate-intro" aria-hidden="true">
      <span className="access-gate-intro-beam access-gate-intro-beam-one" />
      <span className="access-gate-intro-beam access-gate-intro-beam-two" />
      <CoreWordmark className="access-gate-intro-wordmark" />
    </div>
  );
}
