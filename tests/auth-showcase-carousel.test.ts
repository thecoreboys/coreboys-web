import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(process.cwd(), "components/auth/AuthModal.tsx"), "utf8");

test("auth feature showcase advances itself without arrow controls", () => {
  assert.match(source, /SLIDE_DURATION_MS = 5_000/);
  assert.match(source, /setTimeout\(\(\) =>/);
  assert.match(source, /\(currentSlide \+ 1\) % SLIDES\.length/);
  assert.doesNotMatch(source, /ChevronLeft|ChevronRight|Previous feature|Next feature/);
});

test("auth feature progress pauses in place and resumes with its remaining time", () => {
  assert.match(source, /remainingMsRef/);
  assert.match(source, /deadline - Date\.now\(\)/);
  assert.match(source, /animationPlayState: isPaused \? "paused" : "running"/);
  assert.match(source, /pointerInside\.current \|\| focusInside\.current/);
});
