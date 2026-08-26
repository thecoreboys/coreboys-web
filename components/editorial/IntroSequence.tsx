"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ease, durations } from "@/lib/motion";

const TIMECODE_DURATION = 400;
const TYPE_DURATION = 500;
const EXPAND_DURATION = 200;
const REVEAL_DURATION = 200;
const TOTAL = TIMECODE_DURATION + TYPE_DURATION + EXPAND_DURATION + REVEAL_DURATION;

const SESSION_KEY = "coreboys:intro-played";

export function IntroSequence() {
  const [stage, setStage] = useState<"timecode" | "type" | "expand" | "wipe" | "done">(
    "timecode",
  );
  const [timecode, setTimecode] = useState("00:00:00:00");
  const [typed, setTyped] = useState("");
  const [skip, setSkip] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Returning visitors get a 200ms fade only.
    if (window.sessionStorage.getItem(SESSION_KEY)) {
      setSkip(true);
      const t = window.setTimeout(() => setStage("done"), durations.fast);
      return () => window.clearTimeout(t);
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStage("done");
      window.sessionStorage.setItem(SESSION_KEY, "1");
      return;
    }

    let raf = 0;
    const start = performance.now();

    // Stage 1 — timecode counts up
    const counter = () => {
      const now = performance.now();
      const elapsed = Math.min(now - start, TIMECODE_DURATION);
      const ms = Math.floor((elapsed / TIMECODE_DURATION) * 1200);
      const hh = String(Math.floor(ms / 1000) % 24).padStart(2, "0");
      const mm = String(Math.floor(ms / 100) % 60).padStart(2, "0");
      const ss = String(Math.floor(ms / 10) % 60).padStart(2, "0");
      const ff = String(ms % 100).padStart(2, "0");
      setTimecode(`${hh}:${mm}:${ss}:${ff}`);
      if (elapsed < TIMECODE_DURATION) raf = requestAnimationFrame(counter);
    };
    raf = requestAnimationFrame(counter);

    // Stage 2 — type "CORE"
    const t1 = window.setTimeout(() => setStage("type"), TIMECODE_DURATION);
    const letters = ["C", "O", "R", "E"];
    const t2: number[] = letters.map((_, i) =>
      window.setTimeout(
        () => setTyped(letters.slice(0, i + 1).join("")),
        TIMECODE_DURATION + (i + 1) * (TYPE_DURATION / letters.length),
      ),
    );

    // Stage 3 — expand
    const t3 = window.setTimeout(
      () => setStage("expand"),
      TIMECODE_DURATION + TYPE_DURATION,
    );

    // Stage 4 — radial wipe
    const t4 = window.setTimeout(
      () => setStage("wipe"),
      TIMECODE_DURATION + TYPE_DURATION + EXPAND_DURATION,
    );

    // Done
    const t5 = window.setTimeout(() => {
      setStage("done");
      window.sessionStorage.setItem(SESSION_KEY, "1");
    }, TOTAL);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      t2.forEach((t) => window.clearTimeout(t));
      window.clearTimeout(t3);
      window.clearTimeout(t4);
      window.clearTimeout(t5);
    };
  }, []);

  return (
    <AnimatePresence>
      {stage !== "done" && (
        <motion.div
          aria-hidden="true"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: durations.fast / 1000, ease: ease.out }}
          className="fixed inset-0 z-[80] grid place-items-center bg-[color:var(--bg)]"
        >
          {/* radial wipe */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: stage === "wipe" ? 60 : 0 }}
            transition={{ duration: REVEAL_DURATION / 1000, ease: ease.out }}
            className="pointer-events-none absolute h-2 w-2 rounded-full bg-[color:var(--core)]"
            style={{ mixBlendMode: "difference" }}
          />

          {/* content stack */}
          <div className="relative flex flex-col items-center gap-6 text-center">
            {/* timecode */}
            {!skip && (
              <div className="font-mono text-[12px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
                {timecode}
              </div>
            )}

            {/* CORE typed in */}
            {!skip && (
              <div
                aria-hidden="true"
                className="font-logo wordmark-fill text-[120px] leading-none tracking-[-0.04em]"
                style={{ minHeight: "120px", letterSpacing: "-0.04em" }}
              >
                {typed}
                <span className="inline-block w-[6px] animate-pulse bg-[color:var(--core)] align-baseline" />
              </div>
            )}

            {/* expansion line */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{
                opacity: stage === "expand" || stage === "wipe" ? 1 : 0,
                y: stage === "expand" || stage === "wipe" ? 0 : 12,
              }}
              transition={{ duration: durations.fast / 1000, ease: ease.out }}
              className="font-mono text-[12px] uppercase tracking-[0.18em] text-[color:var(--ink)]"
            >
              Create. Own. Run. Everything.
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
