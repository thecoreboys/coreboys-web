import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/special-message/page.tsx", import.meta.url), "utf8");

test("the personal message uses direct, human copy", () => {
  assert.doesNotMatch(page, /[\u2013\u2014]/);
  assert.doesNotMatch(page, /contribute something meaningful/i);
  assert.match(page, /job\s+market being reshaped by AI/);
  assert.match(page, /CORE, I&apos;d love to work with you/);
  assert.doesNotMatch(page, /Michael Cran/);
  assert.match(page, /src="\/special-message\/core-huddle\.webp"/);
  assert.doesNotMatch(page, /origin-storyboard-v2|Special edition|No\. 02|Part 0[1-6]/);
  assert.doesNotMatch(page, /A photo of the people and community that made this project matter to me/);
  assert.doesNotMatch(page, /This community helped me through some hard days/);
  assert.match(page, /I wanted to say thank you/);
});


