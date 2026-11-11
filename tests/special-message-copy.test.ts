import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/special-message/page.tsx", import.meta.url), "utf8");

test("the personal message uses direct, human copy", () => {
  assert.doesNotMatch(page, /[\u2013\u2014]/);
  assert.doesNotMatch(page, /contribute something meaningful/i);
  assert.match(page, /looking\s+for work while AI is changing what companies hire for/);
  assert.match(page, /CORE, I&apos;d love to work with you/);
  assert.doesNotMatch(page, /Michael Cran/);
  assert.match(page, /src="\/special-message\/core-huddle\.webp"/);
  assert.doesNotMatch(page, /origin-storyboard-v2|Special edition|No\. 02|Part 0[1-6]/);
  assert.doesNotMatch(page, /A photo of the people and community that made this project matter to me/);
  assert.doesNotMatch(page, /This community helped me through some hard days/);
  assert.match(page, /I wanted to say thank you/);
});

test("the equipment note and removed video pitch stay off the page", () => {
  assert.doesNotMatch(page, /equipment images are illustrative|who is gay|\/special-message\/production\//i);
  assert.match(page, /CORE science fair/);
  assert.match(page, /Who’s single\?/);
  assert.match(page, /Who’s a millionaire\?/);
});

